import type {
  MergeSummary,
  ProfilePhotoType,
  ProfilePhotoUpload,
  ProfileResult,
  UpdateProfileRequest,
} from "../domain/account";
import type { Callable } from "./progressionRepository";

// Profile and account client (doc 21). Name and photo change only through
// these callables (rules deny direct writes); errors carry
// `details.reason` (see practiceFailure in progressionRepository):
// DISPLAY_NAME_NOT_ALLOWED, RATE_LIMITED, PHOTO_KEY_INVALID,
// PHOTO_NOT_UPLOADED, PHOTO_TOO_LARGE, PHOTO_TYPE_INVALID,
// UPLOADS_NOT_CONFIGURED; for the merge SIGN_IN_REQUIRED,
// GUEST_TOKEN_INVALID, GUEST_TOKEN_EXPIRED, GUEST_NOT_ANONYMOUS,
// SAME_ACCOUNT, GUEST_NOT_FOUND, ALREADY_MERGED_ELSEWHERE.
export interface AccountRepository {
  // Validate forms with updateProfileSchema / displayNameSchema first.
  updateProfile(input: UpdateProfileRequest): Promise<ProfileResult>;
  // A signed PUT for the (already resized, ≤ 1 MB) photo. PUT the bytes to
  // `uploadUrl` with exactly `headers` and a body of `bytes` bytes, then call
  // updateProfile({ photoKey: key }) before `expiresAt`.
  requestProfilePhotoUpload(input: {
    contentType: ProfilePhotoType;
    bytes: number;
  }): Promise<ProfilePhotoUpload>;
  // As the signed-in account, with the guest's ID token captured before
  // switching (doc 21 §3). Safe to repeat: a repeat returns the stored
  // summary with alreadyMerged true.
  mergeGuestAccount(input: { guestIdToken: string }): Promise<MergeSummary>;
}

export function createAccountRepository(call: Callable): AccountRepository {
  return {
    updateProfile: (input) => call("updateProfile", input),
    requestProfilePhotoUpload: (input) => call("requestProfilePhotoUpload", input),
    mergeGuestAccount: (input) => call("mergeGuestAccount", input),
  };
}
