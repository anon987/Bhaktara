import type * as FirestoreModular from "firebase/firestore";

// The slice of the Firestore modular API the repository uses. The JavaScript
// SDK (web, Node emulator tests) and React Native Firebase (Android/iOS)
// export these functions with the same names and semantics, so each platform
// passes in its own implementation. This is a type-only import: the native
// bundle never includes the JavaScript SDK.
export type FirestoreApi = Pick<
  typeof FirestoreModular,
  | "collection"
  | "doc"
  | "query"
  | "where"
  | "orderBy"
  | "limit"
  | "startAfter"
  | "documentId"
  | "getDocFromServer"
  | "getDocsFromServer"
>;
