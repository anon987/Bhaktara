import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { CallableOptions, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import * as banners from "./banners";
import * as content from "./content";
import { Actor, actorFrom } from "./core";
import * as home from "./home";
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
// Home manager (doc 09 §6).
export const getHomeLayout = admin(home.getHomeLayout);
export const updateHomeLayout = admin(home.updateHomeLayout);
export const previewHomeFeed = admin(home.previewHomeFeed);
export const rebuildHomeFeed = admin(home.rebuildHomeFeed);

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

// Doc 08 §4 buildHomeFeed: writes that can change Home only mark the feed
// dirty (one read, at most one write); the scheduled run rebuilds. See the
// design notes in home.ts. Retried, since marking is idempotent.
const markHomeDirty = (kind: home.HomeSourceKind, document: string) =>
  onDocumentWritten({ document, retry: true }, (event) =>
    home.handleHomeSourceWrite(
      kind,
      String(Object.values(event.params)[0]),
      event.data?.before.data(),
      event.data?.after.data(),
    ),
  );
// Also the doc 08 hook for regenerating searchTokens (done today by the
// content callables and the importer).
export const onContentWrite = markHomeDirty("content", "content/{contentId}");
export const onBannerWrite = markHomeDirty("banners", "banners/{bannerId}");
export const onCollectionWrite = markHomeDirty(
  "collections",
  "collections/{collectionId}",
);
export const onHomeLayoutWrite = markHomeDirty(
  "homeLayout",
  "homeLayout/{language}",
);

export const buildHomeFeed = onSchedule(
  { schedule: "every 5 minutes", timeZone: "Asia/Kolkata" },
  async () => {
    const result = await home.runScheduledHomeFeedBuild();
    if (result.status !== "IDLE") logger.info("Home feed build", result);
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
