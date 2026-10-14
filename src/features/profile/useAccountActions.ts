import { useCallback } from "react";
import { useApp } from "../../app/providers/AppProvider";
import { useDialog } from "../../components/Dialog";
import { MergeSummary } from "../../domain/account";
import { useAccount } from "./AccountProvider";

// "+40 अंक · 3 दिन · 2 उपलब्धियाँ": what a merge added, in plain words.
export function useMergeSummaryText() {
  const { t } = useApp();
  return useCallback(
    (summary: MergeSummary) =>
      [
        summary.xpAdded > 0 && `+${summary.xpAdded} ${t("points")}`,
        summary.daysAdded > 0 && `${summary.daysAdded} ${t("daysUnit")}`,
        summary.badgesAdded > 0 &&
          `${summary.badgesAdded} ${t("milestonesTitle")}`,
      ]
        .filter(Boolean)
        .join(" · "),
    [t],
  );
}

// Sign-in and sign-out with their plain-language outcomes (doc 21 §3, §6).
export function useAccountActions({ onAddPhoto }: { onAddPhoto: () => void }) {
  const { t } = useApp();
  const showDialog = useDialog();
  const account = useAccount();
  const summaryText = useMergeSummaryText();
  const signIn = useCallback(async () => {
    if (account.busy) return;
    const outcome = await account.signIn();
    const addPhoto = account.profile.photoKey
      ? []
      : [{ text: t("yourPhoto"), onPress: onAddPhoto }];
    switch (outcome.kind) {
      case "linked":
        showDialog(
          t("signedInTitle"),
          `${t("signedInText")}${account.profile.photoKey ? "" : `\n\n${t("addOwnPhoto")}`}`,
          [...addPhoto, { text: t("close"), style: "cancel" }],
        );
        return;
      case "merged": {
        const added = summaryText(outcome.summary);
        showDialog(
          t("mergedTitle"),
          `${t("mergedText")}${added ? `\n\n${added}` : ""}`,
        );
        return account.dismissMerged();
      }
      case "mergePending":
        showDialog(t("signedInTitle"), t("mergePending"));
        return;
      case "mergeLost":
        showDialog(t("signedInTitle"), t("mergeLost"));
        return;
      case "cancelled":
        return;
      case "failed":
        if (outcome.reason === "inProgress") return;
        showDialog(
          t("signIn"),
          t(
            outcome.reason === "offline"
              ? "signInOffline"
              : outcome.reason === "playServices"
                ? "signInPlayServices"
                : outcome.reason === "unavailable"
                  ? "authUnavailable"
                  : "signInFailed",
          ),
        );
    }
  }, [account, onAddPhoto, showDialog, summaryText, t]);
  const signOut = useCallback(() => {
    showDialog(t("signOutTitle"), t("signOutText"), [
      {
        text: t("signOut"),
        onPress: () => {
          account
            .signOut()
            .catch(() => showDialog(t("signOut"), t("signInOffline")));
        },
      },
      { text: t("cancel"), style: "cancel" },
    ]);
  }, [account, showDialog, t]);
  return { signIn, signOut };
}
