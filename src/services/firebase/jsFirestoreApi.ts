import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { FirestoreApi } from "../../repositories/firestoreApi";

// JavaScript SDK implementation for the web build and Node emulator tests.
export const jsFirestoreApi: FirestoreApi = {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  where,
};
