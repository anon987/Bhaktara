import { AuthService } from "../repositories/contracts";
export const authService: AuthService = {
  isConnected: false,
  signIn: async () => "unavailable",
};
export type RewardedAction = "save" | "offering" | "whatsapp-share";
export function requiresRewardedAd(action: RewardedAction) {
  return action !== "whatsapp-share";
}
export function canPlaceAd(
  zone: "content-rail" | "jaap-controls" | "mandir-controls",
) {
  return zone === "content-rail";
}
export interface AudioService {
  readonly connected: boolean;
  play(contentId: string): Promise<"unavailable">;
}
export const audioService: AudioService = {
  connected: false,
  play: async () => "unavailable",
};
