import { mediaUrl, parseMediaBaseUrl } from "../../domain/media";

// Public CDN origin for this build's R2 bucket (doc 23 §2), e.g.
// https://media-dev.example.com. Unset means bundled placeholder art only.
// Doc 06 reserves appConfig/app.mediaBaseUrl for a runtime override later.
function readMediaBaseUrl(): string | null {
  try {
    return parseMediaBaseUrl(process.env.EXPO_PUBLIC_MEDIA_BASE_URL);
  } catch (error) {
    if (__DEV__)
      console.warn("Ignoring invalid EXPO_PUBLIC_MEDIA_BASE_URL", error);
    return null;
  }
}
export const mediaBaseUrl = readMediaBaseUrl();
// Remote Config can move the CDN without a release (doc 22 §A2). Invalid or
// empty values keep the build's base.
let runtimeBaseUrl: string | null = null;
export function setRuntimeMediaBaseUrl(value: string) {
  try {
    runtimeBaseUrl = parseMediaBaseUrl(value);
  } catch {
    runtimeBaseUrl = null;
  }
}
export const resolveMediaUrl = (key: string) =>
  mediaUrl(runtimeBaseUrl ?? mediaBaseUrl, key);
