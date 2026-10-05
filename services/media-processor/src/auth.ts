import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, errors, JWTVerifyGetKey, jwtVerify } from "jose";

// Only the processMedia Cloud Function may call the processor. It sends a
// Google-signed OIDC identity token (from the metadata server) for its
// runtime service account, in `Authorization: Bearer …`. Cloud Run's IAM
// check (roles/run.invoker) also verifies it at the edge; this is the second,
// in-process check: signature, issuer, audience, expiry and the exact caller.

export class AuthError extends Error {
  override name = "AuthError";
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}
export type Caller = { email: string };
export type Verifier = (authorization: string | undefined) => Promise<Caller>;

export const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export function bearerToken(authorization: string | undefined): string {
  const match = /^Bearer ([A-Za-z0-9._~+/=-]{1,4096})$/.exec(
    authorization ?? "",
  );
  if (!match) throw new AuthError(401, "A bearer identity token is required.");
  return match[1];
}

export function googleOidcVerifier(options: {
  // The processor's own URL, which the caller requested the token for.
  audience: string;
  // The Cloud Functions runtime service account allowed to call.
  serviceAccount: string;
  // Google's public keys; injectable so tests can sign with a local key.
  keys?: JWTVerifyGetKey;
  clockToleranceSeconds?: number;
}): Verifier {
  const keys = options.keys ?? createRemoteJWKSet(new URL(GOOGLE_CERTS_URL));
  const allowed = options.serviceAccount.toLowerCase();
  return async (authorization) => {
    const token = bearerToken(authorization);
    let payload;
    try {
      ({ payload } = await jwtVerify(token, keys, {
        issuer: GOOGLE_ISSUERS,
        audience: options.audience,
        algorithms: ["RS256"],
        clockTolerance: options.clockToleranceSeconds ?? 30,
        requiredClaims: ["exp", "iat", "sub"],
      }));
    } catch (error) {
      // Network failures fetching Google's keys are not the caller's fault.
      if (
        error instanceof errors.JOSEError &&
        !(error instanceof errors.JWKSTimeout)
      )
        throw new AuthError(401, "The identity token is not valid.");
      throw error;
    }
    const email = typeof payload.email === "string" ? payload.email : "";
    if (payload.email_verified !== true || email.toLowerCase() !== allowed)
      throw new AuthError(403, "This caller may not use the processor.");
    return { email };
  };
}

// Local development only (main.ts refuses it on Cloud Run or with R2
// credentials): a shared static token compared in constant time.
export function staticTokenVerifier(expected: string): Verifier {
  const want = Buffer.from(expected);
  return async (authorization) => {
    const got = Buffer.from(bearerToken(authorization));
    if (got.length !== want.length || !timingSafeEqual(got, want))
      throw new AuthError(401, "The token is not valid.");
    return { email: "local-dev" };
  };
}
