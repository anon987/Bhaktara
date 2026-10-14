import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, TextInput, View } from "react-native";
import { Camera, ImageIcon, Trash2 } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootParams } from "../../app/navigation/routes";
import { useApp } from "../../app/providers/AppProvider";
import { useDialog } from "../../components/Dialog";
import { Button, Card, Notice, Page, Txt } from "../../components/ui";
import { backgrounds } from "../../components/backgrounds";
import {
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  displayNameSchema,
} from "../../domain/account";
import { StringKey } from "../../i18n/strings";
import { practiceFailure } from "../../repositories/progressionRepository";
import { nameDraft } from "../../services/account/profileStore";
import { colors, fonts, radii } from "../../theme/tokens";
import { useAccount } from "./AccountProvider";
import { pickPhoto, PhotoUploadError, preparePhoto, UploadStep } from "./photo";
import { Avatar } from "./ProfileParts";

type Props = NativeStackScreenProps<RootParams, "EditProfile">;

// Why a name is not accepted, in plain words (null: fine).
export function nameProblem(name: string): StringKey | null {
  if (displayNameSchema.safeParse(name).success) return null;
  const length = [...name.trim()].length;
  if (length < DISPLAY_NAME_MIN) return "nameShort";
  if (length > DISPLAY_NAME_MAX) return "nameLong";
  return "nameLetters";
}

const codeOf = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code).replace(/^functions\//, "")
    : "";

// updateProfile / requestProfilePhotoUpload errors (details.reason from the
// server) in plain words.
export function profileProblem(
  error: unknown,
  what: "name" | "photo",
): StringKey {
  if (error instanceof PhotoUploadError)
    // The storage refused the bytes (not the internet): pick it again.
    return error.step === "tooLarge" ? "photoTooLarge" : "photoRetry";
  // Only a real connection problem talks about the internet; a function that
  // is not there (not yet deployed) or a server fault says "not right now".
  const code = codeOf(error);
  if (code === "not-found")
    return what === "photo" ? "photoUnavailable" : "nameFailed";
  const network =
    ["unavailable", "deadline-exceeded"].includes(code) ||
    (error instanceof TypeError && /network/i.test(error.message));
  const failure = practiceFailure(error);
  if (failure.kind === "rejected")
    switch (failure.reason) {
      case "DISPLAY_NAME_NOT_ALLOWED":
        return "nameRejected";
      case "RATE_LIMITED":
        return what === "name" ? "nameRateLimited" : "photoRateLimited";
      case "PHOTO_TOO_LARGE":
        return "photoTooLarge";
      case "PHOTO_TYPE_INVALID":
      case "PHOTO_KEY_INVALID":
      case "PHOTO_NOT_UPLOADED":
        return "photoRetry";
      case "UPLOADS_NOT_CONFIGURED":
        return "photoUnavailable";
    }
  if (what === "photo") return network ? "photoFailed" : "photoUnavailable";
  return network ? "nameOffline" : "nameFailed";
}

type PhotoState =
  | { kind: "idle" }
  | { kind: "busy"; step: UploadStep | "removing"; preview: string | null }
  | { kind: "done"; message: StringKey }
  | { kind: "error"; message: StringKey };
type NameState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "done" }
  | { kind: "error"; message: StringKey };

const stepText: Record<UploadStep | "removing", StringKey> = {
  preparing: "photoPreparing",
  uploading: "photoUploading",
  saving: "photoSaving",
  removing: "photoSaving",
};

// Edit profile: name (Hindi or English) and the devotee's own photo. The
// typed name is kept on the device until it is saved, so it is never lost.
export function EditProfileScreen({ navigation }: Props) {
  const { t, local, session } = useApp();
  const showDialog = useDialog();
  const account = useAccount();
  const uid = session?.uid ?? null;
  const [name, setName] = useState(account.profile.displayName ?? "");
  const [nameState, setNameState] = useState<NameState>({ kind: "idle" });
  const [photo, setPhoto] = useState<PhotoState>({ kind: "idle" });
  const touched = useRef(false);

  // A name typed earlier and not saved yet comes back.
  useEffect(() => {
    if (!uid) return;
    let active = true;
    nameDraft
      .read(uid)
      .then((draft) => {
        if (active && draft !== null && !touched.current) setName(draft);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [uid]);
  // The saved name arrives after the screen opened (first load).
  const savedName = account.profile.displayName;
  useEffect(() => {
    if (savedName && !touched.current) setName(savedName);
  }, [savedName]);

  const onChangeName = (value: string) => {
    touched.current = true;
    setName(value);
    if (nameState.kind !== "saving") setNameState({ kind: "idle" });
    if (uid) nameDraft.write(uid, value).catch(() => undefined);
  };

  const problem = nameProblem(name);
  const saveName = async () => {
    if (problem) {
      setNameState({ kind: "error", message: problem });
      return;
    }
    setNameState({ kind: "saving" });
    try {
      await account.saveName(displayNameSchema.parse(name));
      await nameDraft.clear().catch(() => undefined);
      touched.current = false;
      setNameState({ kind: "done" });
    } catch (error) {
      // Offline: the draft stays on the device for the next try.
      setNameState({ kind: "error", message: profileProblem(error, "name") });
    }
  };

  const busy = photo.kind === "busy";
  const choose = async (source: "library" | "camera") => {
    if (busy) return;
    let picked;
    try {
      picked = await pickPhoto(source);
    } catch {
      setPhoto({ kind: "error", message: "photoFailed" });
      return;
    }
    if (picked.kind === "denied") {
      showDialog(t("takePhoto"), t("cameraDenied"));
      return;
    }
    if (picked.kind === "cancelled") return;
    setPhoto({ kind: "busy", step: "preparing", preview: null });
    try {
      const uri = await preparePhoto(picked.photo);
      setPhoto({ kind: "busy", step: "preparing", preview: uri });
      await account.setPhoto(uri, (step) =>
        setPhoto({ kind: "busy", step, preview: uri }),
      );
      setPhoto({ kind: "done", message: "photoSaved" });
    } catch (error) {
      setPhoto({ kind: "error", message: profileProblem(error, "photo") });
    }
  };
  const remove = async () => {
    if (busy) return;
    setPhoto({ kind: "busy", step: "removing", preview: null });
    try {
      await account.removePhoto();
      setPhoto({ kind: "done", message: "photoRemoved" });
    } catch (error) {
      setPhoto({ kind: "error", message: profileProblem(error, "photo") });
    }
  };

  const disabled = !account.available;
  return (
    <Page
      background={backgrounds.profile}
      title={t("editProfile")}
      onBack={navigation.goBack}
    >
      {disabled && <Notice text={t("profileOffline")} />}

      <Card style={styles.section}>
        <Txt bold size={21}>
          {t("yourPhoto")}
        </Txt>
        <View style={{ alignItems: "center" }}>
          <Avatar
            photoKey={account.profile.photoKey}
            preview={busy ? photo.preview : null}
            size={150}
            label={t("yourPhoto")}
          />
        </View>
        {photo.kind !== "idle" && (
          <View
            style={styles.status}
            accessibilityLiveRegion="polite"
            accessibilityRole={photo.kind === "error" ? "alert" : undefined}
          >
            {busy && <ActivityIndicator color={colors.primary} />}
            <Txt
              bold
              size={16}
              style={{
                flex: 1,
                color:
                  photo.kind === "error"
                    ? colors.primary
                    : photo.kind === "done"
                      ? colors.green
                      : colors.ink,
              }}
            >
              {t(busy ? stepText[photo.step] : photo.message)}
            </Txt>
          </View>
        )}
        <Button
          icon={ImageIcon}
          label={t("choosePhoto")}
          disabled={disabled || busy}
          onPress={() => void choose("library")}
        />
        <Button
          icon={Camera}
          label={t("takePhoto")}
          disabled={disabled || busy}
          onPress={() => void choose("camera")}
        />
        {account.profile.photoKey && (
          <Button
            secondary
            icon={Trash2}
            label={t("removePhoto")}
            disabled={disabled || busy}
            onPress={() => void remove()}
          />
        )}
      </Card>

      <Card style={styles.section}>
        <Txt bold size={21} nativeID="name-label">
          {t("yourName")}
        </Txt>
        <TextInput
          testID="name-input"
          accessibilityLabel={t("yourName")}
          accessibilityLabelledBy="name-label"
          value={name}
          onChangeText={onChangeName}
          placeholder={t("namePlaceholder")}
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={DISPLAY_NAME_MAX + 10}
          returnKeyType="done"
          onSubmitEditing={() => void saveName()}
          editable={nameState.kind !== "saving"}
          style={[
            styles.input,
            {
              fontFamily: local.language === "hi" ? fonts.hi : fonts.en,
            },
            nameState.kind === "error" && { borderColor: colors.primary },
          ]}
        />
        {nameState.kind === "error" ? (
          <Txt
            bold
            size={16}
            accessibilityRole="alert"
            style={{ color: colors.primary }}
          >
            {t(nameState.message)}
          </Txt>
        ) : nameState.kind === "done" ? (
          <Txt bold size={16} style={{ color: colors.green }}>
            {t("nameSaved")}
          </Txt>
        ) : (
          <Txt muted size={15}>
            {t("nameHint")}
          </Txt>
        )}
        <Button
          label={nameState.kind === "saving" ? t("savingName") : t("saveName")}
          disabled={disabled || nameState.kind === "saving"}
          onPress={() => void saveName()}
        />
      </Card>
    </Page>
  );
}

const styles = StyleSheet.create({
  section: { gap: 16, padding: 20 },
  status: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 22,
    color: colors.ink,
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.gold,
  },
});
