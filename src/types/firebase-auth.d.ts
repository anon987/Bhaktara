import type { Persistence, ReactNativeAsyncStorage } from "firebase/auth";

// Firebase 12.19 exports this in its RN runtime but its top-level "types"
// condition omits the RN declaration. Match dist/rn/index.rn.d.ts explicitly.
// Only persistence.native.ts calls this function; web uses browser persistence.
declare module "firebase/auth" {
  export function getReactNativePersistence(
    storage: ReactNativeAsyncStorage,
  ): Persistence;
}
