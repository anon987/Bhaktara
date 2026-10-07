import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  Timestamp,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "./firebase";
import { withoutUndefined } from "./callable";
import {
  BannerInput,
  ContentDraftInput,
  ContentStatus,
  ContentType,
  draftFromDocuments,
  ReadinessProblem,
  TransitionInput,
  UploadMime,
} from "./domain";
import type { MediaVariant, MediaVariantName } from "../../src/domain/media";

// Everything the screens need from Firebase, behind one interface so the
// components can be tested with a fake. Reads go straight to Firestore
// (staff read rules, doc 09 §15); every write is a Cloud Function call,
// which validates again and writes the audit entry.
export type Localized = { hi: string; en: string };
export type Page<T, C> = { items: T[]; next: C | null };

export type ContentRow = {
  id: string;
  type: ContentType;
  status: ContentStatus;
  title: Localized;
  updatedAt: string | null;
  scheduledAt: string | null;
  // For previews in the library (absent on rows from older callers).
  media?: Partial<Record<MediaVariantName, MediaVariant>>;
  durationSeconds?: number | null;
  deityIds?: string[];
};

export type ContentRecord = {
  id: string;
  status: ContentStatus;
  draft: ContentDraftInput;
  updatedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
};

export type DeityOption = { id: string; name: Localized };
export type SaveResult = {
  id: string;
  status: ContentStatus;
  problems: ReadinessProblem[];
};
export type BannerRecord = { id: string; banner: BannerInput };
export type AuditRow = {
  id: string;
  adminUid: string;
  action: string;
  entity: string;
  entityId: string;
  beforeSummary: unknown;
  afterSummary: unknown;
  createdAt: string | null;
};
export type UploadSlot = {
  key: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
};
export type ContentQuery = {
  status?: ContentStatus;
  type?: ContentType;
  after?: string | null;
  pageSize: number;
};
export type AuditCursor = unknown;

export interface AdminApi {
  listContent(query: ContentQuery): Promise<Page<ContentRow, string>>;
  getContent(id: string): Promise<ContentRecord | null>;
  listDeities(): Promise<DeityOption[]>;
  createContent(id: string, draft: ContentDraftInput): Promise<SaveResult>;
  updateContent(id: string, draft: ContentDraftInput): Promise<SaveResult>;
  transitionContent(
    input: TransitionInput,
  ): Promise<{ id: string; from: ContentStatus; to: ContentStatus }>;
  listBanners(): Promise<BannerRecord[]>;
  createBanner(banner: BannerInput): Promise<{ id: string }>;
  updateBanner(id: string, banner: BannerInput): Promise<{ id: string }>;
  deleteBanner(id: string): Promise<{ id: string }>;
  listAudit(input: {
    after?: AuditCursor | null;
    pageSize: number;
  }): Promise<Page<AuditRow, AuditCursor>>;
  requestUploadUrl(input: {
    contentId: string;
    contentType: UploadMime;
    bytes: number;
  }): Promise<UploadSlot>;
  putFile(
    slot: UploadSlot,
    file: Blob,
    onProgress: (fraction: number) => void,
  ): Promise<void>;
}

export const toIso = (value: unknown): string | null =>
  value instanceof Timestamp
    ? value.toDate().toISOString()
    : typeof value === "string"
      ? value
      : null;

const localized = (value: unknown): Localized => {
  const record = (value ?? {}) as Partial<Localized>;
  return { hi: record.hi ?? "", en: record.en ?? "" };
};

// Stored banner documents use Timestamps; the callable input uses ISO strings.
export function bannerFromDocument(data: Record<string, unknown>): BannerInput {
  const image = (data.image ?? {}) as BannerInput["image"];
  return {
    title: localized(data.title),
    subtitle: localized(data.subtitle),
    ctaText: localized(data.ctaText),
    image: { mobile: image.mobile ?? { key: "" }, thumb: image.thumb },
    target: (data.target as BannerInput["target"]) ?? { route: "mandir" },
    priority: typeof data.priority === "number" ? data.priority : 0,
    startAt: toIso(data.startAt) ?? "",
    endAt: toIso(data.endAt) ?? "",
    isActive: data.isActive === true,
    languages: Array.isArray(data.languages)
      ? (data.languages as BannerInput["languages"])
      : ["hi", "en"],
  };
}

// Staff list rules allow at most 100 documents per query (bounded(100) in
// firestore.rules); one extra row is read to know whether a next page exists.
export const MAX_PAGE_SIZE = 99;
const pageSizeFor = (requested: number) =>
  Math.max(1, Math.min(Math.floor(requested), MAX_PAGE_SIZE));

export function firebaseApi({ db, functions }: FirebaseServices): AdminApi {
  const call =
    <I, O>(name: string) =>
    async (input: I): Promise<O> =>
      // Unset fields must stay absent: the client would send them as null.
      (await httpsCallable<I, O>(functions, name)(withoutUndefined(input))).data;

  return {
    async listContent({ status, type, after, pageSize: requested }) {
      const pageSize = pageSizeFor(requested);
      const constraints: QueryConstraint[] = [];
      if (status) constraints.push(where("status", "==", status));
      if (type) constraints.push(where("type", "==", type));
      // Ordered by ID: imported and seeded items may lack updatedAt, and
      // equality filters plus the ID order need no composite index.
      constraints.push(orderBy(documentId()));
      if (after) constraints.push(startAfter(after));
      constraints.push(limit(pageSize + 1));
      const snapshot = await getDocs(
        query(collection(db, "content"), ...constraints),
      );
      const rows = snapshot.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          type: data.type as ContentType,
          status: data.status as ContentStatus,
          title: localized(data.title),
          updatedAt: toIso(data.updatedAt),
          scheduledAt: toIso(data.scheduledAt),
          media: (data.media ?? undefined) as ContentRow["media"],
          durationSeconds: typeof data.durationSeconds === "number" ? data.durationSeconds : null,
          deityIds: Array.isArray(data.deityIds) ? (data.deityIds as string[]) : [],
        };
      });
      const items = rows.slice(0, pageSize);
      return {
        items,
        next: rows.length > pageSize ? items[items.length - 1].id : null,
      };
    },

    async getContent(id) {
      const [content, privateRecord] = await Promise.all([
        getDoc(doc(db, "content", id)),
        getDoc(doc(db, "contentPrivate", id)),
      ]);
      if (!content.exists()) return null;
      const data = content.data();
      return {
        id,
        status: data.status as ContentStatus,
        draft: draftFromDocuments(data, privateRecord.data()),
        updatedAt: toIso(data.updatedAt),
        scheduledAt: toIso(data.scheduledAt),
        publishedAt: toIso(data.publishedAt),
      };
    },

    async listDeities() {
      // Active deities (public rule, at most 30 per query).
      const snapshot = await getDocs(
        query(
          collection(db, "deities"),
          where("isActive", "==", true),
          limit(30),
        ),
      );
      return snapshot.docs
        .map((item) => ({ id: item.id, name: localized(item.data().name) }))
        .sort((a, b) => a.name.en.localeCompare(b.name.en));
    },

    createContent: (id, draft) =>
      call<{ id: string; draft: ContentDraftInput }, SaveResult>(
        "createContent",
      )({ id, draft }),
    updateContent: (id, draft) =>
      call<{ id: string; draft: ContentDraftInput }, SaveResult>(
        "updateContent",
      )({ id, draft }),
    transitionContent: call("transitionContentStatus"),

    async listBanners() {
      const snapshot = await getDocs(
        query(
          collection(db, "banners"),
          orderBy("priority", "desc"),
          limit(100),
        ),
      );
      return snapshot.docs.map((item) => ({
        id: item.id,
        banner: bannerFromDocument(item.data()),
      }));
    },
    createBanner: (banner) =>
      call<{ banner: BannerInput }, { id: string }>("createBanner")({ banner }),
    updateBanner: (id, banner) =>
      call<{ id: string; banner: BannerInput }, { id: string }>("updateBanner")({
        id,
        banner,
      }),
    deleteBanner: (id) =>
      call<{ id: string }, { id: string }>("deleteBanner")({ id }),

    async listAudit({ after, pageSize: requested }) {
      const pageSize = pageSizeFor(requested);
      const constraints: QueryConstraint[] = [orderBy("createdAt", "desc")];
      if (after) constraints.push(startAfter(after as QueryDocumentSnapshot));
      constraints.push(limit(pageSize + 1));
      const snapshot = await getDocs(
        query(collection(db, "auditLogs"), ...constraints),
      );
      const docs = snapshot.docs.slice(0, pageSize);
      return {
        items: docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            adminUid: String(data.adminUid ?? ""),
            action: String(data.action ?? ""),
            entity: String(data.entity ?? ""),
            entityId: String(data.entityId ?? ""),
            beforeSummary: data.beforeSummary ?? null,
            afterSummary: data.afterSummary ?? null,
            createdAt: toIso(data.createdAt),
          };
        }),
        next:
          snapshot.docs.length > pageSize ? docs[docs.length - 1] : null,
      };
    },

    requestUploadUrl: call("requestUploadUrl"),

    putFile(slot, file, onProgress) {
      // XHR rather than fetch for upload progress. The presigned URL signs
      // Content-Type and Content-Length, so the file is sent unchanged.
      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open(slot.method, slot.url);
        for (const [name, value] of Object.entries(slot.headers))
          request.setRequestHeader(name, value);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(event.loaded / event.total);
        };
        request.onload = () =>
          request.status >= 200 && request.status < 300
            ? resolve()
            : reject(
                new Error(`Storage rejected the upload (HTTP ${request.status}).`),
              );
        request.onerror = () =>
          reject(
            new Error(
              "The upload could not reach storage (network or bucket CORS).",
            ),
          );
        request.send(file);
      });
    },
  };
}
