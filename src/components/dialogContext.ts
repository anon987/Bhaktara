import { createContext, useContext } from "react";
export type DialogAction = {
  text: string;
  style?: "cancel";
  onPress?: () => void;
};
export const DialogContext = createContext<
  (title: string, message: string, actions?: DialogAction[]) => void
>(() => undefined);
export const useDialog = () => useContext(DialogContext);
