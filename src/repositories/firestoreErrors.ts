// Firestore error codes: the JavaScript SDK uses "permission-denied", React
// Native Firebase prefixes them ("firestore/permission-denied").
export function firestoreErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error))
    return null;
  const { code } = error;
  return typeof code === "string" ? code.replace(/^firestore\//, "") : null;
}

// Retrying cannot change these outcomes: the rules rejected the request
// (draft, missing or mistyped content) or the input is malformed. Anything
// else (offline, unavailable, deadline, timeouts) is retried later.
const permanentCodes = new Set([
  "permission-denied",
  "invalid-argument",
  "not-found",
]);
export function isPermanentError(error: unknown) {
  const code = firestoreErrorCode(error);
  return code !== null && permanentCodes.has(code);
}

export function codedError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}
