import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  where,
} from "firebase/firestore";
import { FirestoreApi } from "../../repositories/firestoreApi";

// JavaScript SDK implementation for the web build and Node emulator tests.
export const jsFirestoreApi: FirestoreApi = {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  where,
};
