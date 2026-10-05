import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { CallableOptions, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import * as banners from "./banners";
import * as content from "./content";
import { Actor, actorFrom } from "./core";
import { setAdminRole as setRole } from "./roles";
import { requestUploadUrl as uploadSlot } from "./uploads";

// Admin CMS functions (doc 08 §3). Firestore lives in asia-south1.
// Deploying needs the Blaze plan; until then they run in the local emulator.
setGlobalOptions({ region: "asia-south1", maxInstances: 5 });

// Every admin callable: authenticated, non-anonymous, role claim checked,
// Zod-validated input, audit entry in the same transaction as the change.
// Unexpected errors surface as INTERNAL without details. App Check stays in
// monitor mode until M4 (doc 16), so it is not enforced here yet.
const admin = <T>(
  handler: (actor: Actor, data: unknown) => Promise<T>,
  options: CallableOptions = {},
) =>
  onCall(options, (request) => handler(actorFrom(request.auth), request.data));

export const createContent = admin(content.createContent);
export const updateContent = admin(content.updateContent);
export const transitionContentStatus = admin((actor, data) =>
  content.transitionContentStatus(actor, data),
);
export const createBanner = admin(banners.createBanner);
export const updateBanner = admin(banners.updateBanner);
export const deleteBanner = admin(banners.deleteBanner);
export const setAdminRole = admin(setRole);

// R2 keys live in Secret Manager in deployed environments. The emulator
// reads them (if at all) from functions/.env.local, which is Git-ignored.
const r2Secrets =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? []
    : [defineSecret("R2_ACCESS_KEY_ID"), defineSecret("R2_SECRET_ACCESS_KEY")];
export const requestUploadUrl = admin(
  (actor, data) => uploadSlot(actor, data),
  {
    secrets: r2Secrets,
  },
);

// Doc 08 §4: SCHEDULED → PUBLISHED and expiry archiving every 5 minutes.
export const publishScheduledContent = onSchedule(
  { schedule: "every 5 minutes", timeZone: "Asia/Kolkata" },
  async () => {
    const result = await content.publishDueContent();
    if (
      result.published.length ||
      result.archived.length ||
      result.failed.length
    )
      logger.info("Scheduled content run", result);
  },
);
