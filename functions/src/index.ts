import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { CallableOptions, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import * as assets from "./assets";
import * as banners from "./banners";
import * as bulk from "./bulk";
import * as catalog from "./catalog";
import * as dashboard from "./dashboard";
import * as content from "./content";
import { Actor, actorFrom } from "./core";
import * as home from "./home";
import * as media from "./media";
import * as progression from "./progression";
import { setAdminRole as setRole } from "./roles";
import { requestUploadUrl as uploadSlot } from "./uploads";
import * as users from "./users";

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
// Library multi-select: up to 200 items, each in its own transaction.
export const bulkContent = admin((actor, data) => bulk.bulkContent(actor, data), {
  timeoutSeconds: 120,
});
export const createBanner = admin(banners.createBanner);
export const updateBanner = admin(banners.updateBanner);
export const deleteBanner = admin(banners.deleteBanner);
export const setAdminRole = admin(setRole);
// Home manager (doc 09 §6).
export const getHomeLayout = admin(home.getHomeLayout);
export const updateHomeLayout = admin(home.updateHomeLayout);
export const previewHomeFeed = admin(home.previewHomeFeed);
export const rebuildHomeFeed = admin(home.rebuildHomeFeed);

// R2 keys live in Secret Manager in deployed environments, once an upload
// token exists: set R2_UPLOAD_SECRETS=true in functions/.env.<projectId> after
// creating the R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY secrets. Until then
// the callable deploys without them and answers that uploads are not
// configured. The emulator reads keys (if at all) from functions/.env.local.
const r2Secrets =
  process.env.FUNCTIONS_EMULATOR === "true" ||
  process.env.R2_UPLOAD_SECRETS !== "true"
    ? []
    : [defineSecret("R2_ACCESS_KEY_ID"), defineSecret("R2_SECRET_ACCESS_KEY")];
export const requestUploadUrl = admin(
  (actor, data) => uploadSlot(actor, data),
  {
    secrets: r2Secrets,
  },
);

// Admin panel v2 (doc 09 §1): dashboard, catalogue, config, users, assets.
export const getDashboard = admin(dashboard.getDashboard, { timeoutSeconds: 120 });
export const saveCatalogItem = admin(catalog.saveCatalogItem);
export const deleteCatalogItem = admin(catalog.deleteCatalogItem);
export const saveConfig = admin(catalog.saveConfig);
export const rollbackConfig = admin(catalog.rollbackConfig);
export const searchUsers = admin(users.searchUsers);
export const getUserDetail = admin(users.getUserDetail);
export const moderateUser = admin(users.moderateUser);
export const setUserDisabled = admin(users.setUserDisabled);
export const deleteUserAccount = admin(users.deleteUserAccount, { timeoutSeconds: 300 });
export const listAdmins = admin((actor) => users.listAdmins(actor));
export const requestAssetUpload = admin(
  (actor, data) => assets.requestAssetUpload(actor, data),
  { secrets: r2Secrets },
);
export const processAsset = admin((actor, data) => assets.processAsset(actor, data), {
  timeoutSeconds: 540,
});
export const deleteAsset = admin(assets.deleteAsset);

// Doc 22 §A4 step 4: render staged originals on the Cloud Run media
// processor (MEDIA_PROCESSOR_URL; R2 keys live with the processor, not here)
// and write the variants onto content.media. Processing can take minutes.
export const processMedia = admin(
  (actor, data) => media.processMedia(actor, data),
  { timeoutSeconds: 540 },
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

// Habit layer (doc 08 §2). Guests may call these (D-016); the app reports
// activities and the server decides XP, streaks, challenges and badges.
const player = <T>(
  handler: (player: progression.Player, data: unknown) => Promise<T>,
) =>
  onCall((request) =>
    handler(progression.playerFrom(request.auth), request.data),
  );

export const setTimezone = player(progression.setTimezone);
export const startSession = player(progression.startSession);
export const completeSession = player(progression.completeSession);
export const completePrayerChecklist = player(
  progression.completePrayerChecklist,
);

// Doc 08 §4: close ended daily and weekly challenges after the 04:00 rollover.
export const expireChallenges = onSchedule(
  { schedule: "5 4 * * *", timeZone: "Asia/Kolkata" },
  async () => {
    const result = await progression.expireChallenges();
    if (result.expired) logger.info("Expired user challenges", result);
  },
);
