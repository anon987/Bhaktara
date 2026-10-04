import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Txt } from "./ui";
import { useApp } from "../app/providers/AppProvider";
import { colors } from "../theme/tokens";
import { DialogAction, DialogContext } from "./dialogContext";
export { useDialog } from "./dialogContext";
type DialogState = { title: string; message: string; actions?: DialogAction[] };

export function DialogProvider({ children }: React.PropsWithChildren) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const { t } = useApp();
  return (
    <DialogContext.Provider
      value={(title, message, actions) =>
        setDialog({ title, message, actions })
      }
    >
      {children}
      <Modal
        transparent
        visible={!!dialog}
        animationType="none"
        onRequestClose={() => setDialog(null)}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            onPress={() => setDialog(null)}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView
            edges={["bottom"]}
            accessibilityViewIsModal
            style={styles.sheet}
          >
            <Txt bold size={24}>
              {dialog?.title}
            </Txt>
            <Txt muted>{dialog?.message}</Txt>
            {(dialog?.actions ?? [{ text: t("close") }]).map((action) => (
              <Button
                key={action.text}
                label={action.text}
                secondary={action.style === "cancel"}
                onPress={() => {
                  setDialog(null);
                  action.onPress?.();
                }}
              />
            ))}
          </SafeAreaView>
        </View>
      </Modal>
    </DialogContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#21140C88",
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: 26,
    gap: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
});
