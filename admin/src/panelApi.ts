import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "./firebase";
import { toIso } from "./api";
import { withoutUndefined } from "./callable";
import type { AdminRole } from "./domain";
import { catalogKinds, type AssetPurpose, type CatalogKind } from "../../src/domain/admin";
import type { HomeLayoutSectionInput } from "../../src/domain/home";
import type { MediaVariant } from "../../src/domain/media";

// Admin panel v2 data access (doc 09 §1). Reads use the staff Firestore
// rules; every write is a callable that validates and audits.

export type CatalogRow<T = Record<string, unknown>> = {
  id: string;
  data: T;
  updatedAt: string | null;
};

export type DashboardData = {
  computedAt: string;
  // Figures the server could not compute this time (shown as zero).
  unavailable?: string[];
  today: string;
  users: { total: number; guests: number; signedIn: number; new7: number; new30: number; active1: number; active7: number };
  practice: {
    activeStreaks: number;
    xpToday: number;
    series: { day: string; practised: number; qualifying: number; fullSadhana: number }[];
  };
  content: {
    byStatus: Record<string, number>;
    scheduledSoon: { id: string; title: string; type: string; scheduledAt: string }[];
  };
  challenges: { active: number; daysQueued: number };
  festivals: { id: string; name: string; date: string; hasCollection: boolean }[];
  flaggedUsers: number;
  alerts: { level: "info" | "warn"; key: string; count?: number }[];
};

export type UserRow = {
  uid: string;
  displayName: string | null;
  isAnonymous: boolean;
  language: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  totalXp: number;
  level: number;
  currentStreak: number;
  flagged: boolean;
  disabled: boolean;
};
export type UserFilter = "all" | "flagged" | "disabled" | "signedIn" | "guests";
export type UserDetail = {
  uid: string;
  auth: {
    providers: string[];
    isAnonymous: boolean;
    email: string | null;
    createdAt: string | null;
    lastSignInAt: string | null;
    disabled: boolean;
    role: AdminRole | null;
  } | null;
  profile: {
    displayName: string | null;
    language: string | null;
    timezone: string;
    mandirDeityId: string | null;
    createdAt: string | null;
    lastActiveAt: string | null;
  };
  stats: {
    totalXp: number;
    level: number;
    rank: string;
    currentStreak: number;
    longestStreak: number;
    lastQualifyingDay: string | null;
    counters: Record<string, number>;
    flags: { suspicious: boolean; reason?: string };
  };
  days: { day: string; xp: number; qualifying: boolean; fullSadhana: boolean; tasks: Record<string, boolean> }[];
  badges: { id: string; unlockedAt: string | null }[];
  notes: { text: string; by: string; at: string | null }[];
};
export type StaffRow = {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: AdminRole;
  lastSignInAt: string | null;
  disabled: boolean;
};

export type AssetRow = {
  id: string;
  purpose: AssetPurpose;
  label: string;
  status: "UPLOADING" | "READY";
  media: Record<string, MediaVariant> | null;
  createdAt: string | null;
  warnings: string[];
};
export type UploadSlot = {
  key: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};

export type ConfigId = "gamification" | "sadhana" | "puja" | "visuals";
export type ConfigVersion = { version: number; savedBy: string; savedAt: string | null; action: string };

export type HomeLanguage = "hi" | "en";
export type HomeLayoutState = {
  language: HomeLanguage;
  revision: number;
  sections: HomeLayoutSectionInput[];
  valid: boolean;
  issues: { path: string; message: string }[];
  updatedAt: string | null;
  updatedBy: string | null;
  builder: { dirty: boolean; builtAt: string | null; nextChangeAt: string | null };
};

export interface PanelApi {
  getDashboard(force?: boolean): Promise<DashboardData>;
  listCatalog<T = Record<string, unknown>>(kind: CatalogKind): Promise<CatalogRow<T>[]>;
  saveCatalogItem(input: { kind: CatalogKind; id?: string; create: boolean; data: unknown }): Promise<{ id: string }>;
  deleteCatalogItem(input: { kind: CatalogKind; id: string }): Promise<{ id: string }>;
  getConfig<T = Record<string, unknown>>(id: ConfigId): Promise<{ data: T | null; version: number }>;
  listConfigVersions(id: ConfigId): Promise<ConfigVersion[]>;
  saveConfig(input: { id: ConfigId; data: unknown; expectedVersion: number }): Promise<{ version: number }>;
  rollbackConfig(input: { id: ConfigId; toVersion: number; expectedVersion: number }): Promise<{ version: number }>;
  searchUsers(input: { query?: string; filter: UserFilter; after?: string | null; pageSize: number }): Promise<{ items: UserRow[]; next: string | null }>;
  getUserDetail(uid: string): Promise<UserDetail>;
  moderateUser(input: { uid: string; action: "flag"; reason: string } | { uid: string; action: "unflag" | "resetDisplayName" } | { uid: string; action: "note"; note: string }): Promise<unknown>;
  setUserDisabled(input: { uid: string; disabled: boolean; reason: string }): Promise<unknown>;
  deleteUserAccount(input: { uid: string; confirmUid: string; reason: string }): Promise<unknown>;
  listAdmins(): Promise<StaffRow[]>;
  setAdminRole(input: { email: string; role: AdminRole | null }): Promise<unknown>;
  listAssets(purpose?: AssetPurpose): Promise<AssetRow[]>;
  requestAssetUpload(input: { purpose: AssetPurpose; label: string; contentType: "image/jpeg" | "image/png" | "image/webp"; bytes: number }): Promise<UploadSlot & { assetId: string }>;
  processAsset(input: { assetId: string; image: string }): Promise<{ assetId: string; media: Record<string, MediaVariant>; warnings: string[] }>;
  deleteAsset(assetId: string): Promise<unknown>;
  processMedia(input: { contentId: string; inputs: { audio?: string; image?: string; video?: string } }): Promise<{ media: Record<string, MediaVariant>; warnings: string[]; durationSeconds: number | null }>;
  getHomeLayout(language: HomeLanguage): Promise<HomeLayoutState>;
  updateHomeLayout(input: { language: HomeLanguage; sections: HomeLayoutSectionInput[]; expectedRevision: number }): Promise<{ revision: number; changed: boolean }>;
  rebuildHomeFeed(): Promise<unknown>;
}

export function firebasePanelApi({ db, functions }: FirebaseServices): PanelApi {
  const call =
    <I, O>(name: string, timeout = 70_000) =>
    async (input: I): Promise<O> =>
      (await httpsCallable<I, O>(functions, name, { timeout })(withoutUndefined(input))).data;

  return {
    getDashboard: (force) => call<{ force?: boolean }, DashboardData>("getDashboard", 120_000)({ force }),

    async listCatalog<T>(kind: CatalogKind) {
      const snapshot = await getDocs(
        query(collection(db, catalogKinds[kind].collection), limit(200)),
      );
      return snapshot.docs.map((item) => ({
        id: item.id,
        data: item.data() as T,
        updatedAt: toIso(item.data().updatedAt),
      }));
    },
    saveCatalogItem: call("saveCatalogItem"),
    deleteCatalogItem: call("deleteCatalogItem"),

    async getConfig<T>(id: ConfigId) {
      const snapshot = await getDoc(doc(db, "appConfig", id));
      const data = snapshot.exists() ? (snapshot.data() as T & { version?: number }) : null;
      return { data, version: (data?.version as number | undefined) ?? 0 };
    },
    async listConfigVersions(id) {
      const snapshot = await getDocs(
        query(collection(db, "appConfig", id, "versions"), orderBy("savedAt", "desc"), limit(50)),
      );
      return snapshot.docs.map((item) => ({
        version: Number(item.id),
        savedBy: String(item.get("savedBy") ?? ""),
        savedAt: toIso(item.get("savedAt")),
        action: String(item.get("action") ?? "save"),
      }));
    },
    saveConfig: call("saveConfig"),
    rollbackConfig: call("rollbackConfig"),

    searchUsers: call("searchUsers"),
    getUserDetail: (uid) => call<{ uid: string }, UserDetail>("getUserDetail")({ uid }),
    moderateUser: call("moderateUser"),
    setUserDisabled: call("setUserDisabled"),
    deleteUserAccount: call("deleteUserAccount", 300_000),
    listAdmins: async () => (await call<object, { admins: StaffRow[] }>("listAdmins")({})).admins,
    setAdminRole: call("setAdminRole"),

    async listAssets(purpose) {
      const constraints = [orderBy("createdAt", "desc"), limit(100)];
      const snapshot = await getDocs(
        purpose
          ? query(collection(db, "mediaAssets"), where("purpose", "==", purpose), ...constraints)
          : query(collection(db, "mediaAssets"), ...constraints),
      );
      return snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          purpose: data.purpose as AssetPurpose,
          label: String(data.label ?? item.id),
          status: data.status === "READY" ? "READY" : "UPLOADING",
          media: (data.media as Record<string, MediaVariant> | undefined) ?? null,
          createdAt: toIso(data.createdAt),
          warnings: (data.warnings as string[] | undefined) ?? [],
        };
      });
    },
    requestAssetUpload: call("requestAssetUpload"),
    processAsset: call("processAsset", 540_000),
    deleteAsset: (assetId) => call("deleteAsset")({ assetId }),
    processMedia: call("processMedia", 540_000),

    getHomeLayout: (language) => call<{ language: HomeLanguage }, HomeLayoutState>("getHomeLayout")({ language }),
    updateHomeLayout: call("updateHomeLayout"),
    rebuildHomeFeed: () => call("rebuildHomeFeed", 120_000)({}),
  };
}

export { withoutUndefined };
