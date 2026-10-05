// The OIDC verifier with a locally generated RSA key standing in for
// Google's signing keys (offline: the JWKS is injected).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  JWTPayload,
  SignJWT,
} from "jose";
import {
  AuthError,
  bearerToken,
  googleOidcVerifier,
  staticTokenVerifier,
  Verifier,
} from "../src/auth";

const audience = "https://media-processor-abc-el.a.run.app";
const serviceAccount =
  "functions-runtime@bhaktara-test.iam.gserviceaccount.com";
let sign: (claims: JWTPayload, options?: { alg?: string }) => Promise<string>;
let otherKeySign: (claims: JWTPayload) => Promise<string>;
let verify: Verifier;

const claims = (overrides: JWTPayload = {}): JWTPayload => ({
  iss: "https://accounts.google.com",
  aud: audience,
  sub: "1234567890",
  email: serviceAccount,
  email_verified: true,
  ...overrides,
});

async function denied(promise: Promise<unknown>, status: 401 | 403) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AuthError, String(error));
    assert.equal(error.status, status);
    return true;
  });
}

before(async () => {
  const google = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(google.publicKey)),
    kid: "k1",
    alg: "RS256",
  };
  const signer =
    (key: Parameters<SignJWT["sign"]>[0], kid: string) =>
    (payload: JWTPayload, options: { alg?: string } = {}) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: options.alg ?? "RS256", kid })
        .setIssuedAt()
        .setExpirationTime(typeof payload.exp === "number" ? payload.exp : "5m")
        .sign(key);
  sign = signer(google.privateKey, "k1");
  otherKeySign = signer(other.privateKey, "k1");
  verify = googleOidcVerifier({
    audience,
    serviceAccount,
    keys: createLocalJWKSet({ keys: [jwk] }),
  });
});

describe("googleOidcVerifier", () => {
  test("accepts a Google-signed token for the configured service account", async () => {
    assert.deepEqual(await verify(`Bearer ${await sign(claims())}`), {
      email: serviceAccount,
    });
    // Google also issues the bare issuer form.
    await verify(
      `Bearer ${await sign(claims({ iss: "accounts.google.com" }))}`,
    );
  });

  test("rejects missing, malformed and forged tokens", async () => {
    await denied(verify(undefined), 401);
    await denied(verify("Basic abc"), 401);
    await denied(verify("Bearer not-a-jwt"), 401);
    await denied(verify(`Bearer ${await otherKeySign(claims())}`), 401);
    const token = await sign(claims());
    const [head, , signature] = token.split(".");
    const tampered = Buffer.from(
      JSON.stringify(claims({ email: "attacker@example.com" })),
    ).toString("base64url");
    await denied(verify(`Bearer ${head}.${tampered}.${signature}`), 401);
    // alg=none is never accepted.
    const none = [
      Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
      Buffer.from(JSON.stringify(claims())).toString("base64url"),
      "",
    ].join(".");
    await denied(verify(`Bearer ${none}`), 401);
  });

  test("checks audience, issuer and expiry", async () => {
    await denied(
      verify(`Bearer ${await sign(claims({ aud: "https://other.run.app" }))}`),
      401,
    );
    await denied(
      verify(`Bearer ${await sign(claims({ iss: "https://evil.example" }))}`),
      401,
    );
    const past = Math.floor(Date.now() / 1000) - 3600;
    await denied(verify(`Bearer ${await sign(claims({ exp: past }))}`), 401);
  });

  test("only the configured, verified service account may call", async () => {
    await denied(
      verify(
        `Bearer ${await sign(claims({ email: "someone@bhaktara-test.iam.gserviceaccount.com" }))}`,
      ),
      403,
    );
    await denied(
      verify(`Bearer ${await sign(claims({ email_verified: false }))}`),
      403,
    );
    await denied(
      verify(`Bearer ${await sign(claims({ email: undefined }))}`),
      403,
    );
  });
});

test("bearer parsing and the local static token", async () => {
  assert.equal(bearerToken("Bearer a.b.c"), "a.b.c");
  assert.throws(() => bearerToken("Bearer "), AuthError);
  assert.throws(() => bearerToken(`Bearer ${"a".repeat(5000)}`), AuthError);
  const local = staticTokenVerifier("local-dev-token-0123456789");
  assert.deepEqual(await local("Bearer local-dev-token-0123456789"), {
    email: "local-dev",
  });
  await denied(local("Bearer local-dev-token-012345678X"), 401);
  await denied(local("Bearer short"), 401);
});
