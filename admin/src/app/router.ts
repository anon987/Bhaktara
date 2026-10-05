import { useEffect, useState } from "react";

// A small hash router: hash URLs work on any static host (Firebase Hosting
// rewrites are still set). Pages are flat; editors carry an ID.
export const pageNames = [
  "dashboard",
  "content",
  "media",
  "home",
  "banners",
  "collections",
  "deities",
  "categories",
  "challenges",
  "badges",
  "puja",
  "sadhana-config",
  "gamification-config",
  "festivals",
  "mandir-offerings",
  "users",
  "roles",
  "audit",
] as const;
export type PageName = (typeof pageNames)[number];

export type Route =
  | { name: PageName }
  | { name: "content-new" }
  | { name: "content-edit"; id: string }
  | { name: "user"; uid: string }
  | { name: "home-redirect" }
  | { name: "not-found" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home-redirect" };
  const [head, second, third] = parts;
  if (head === "content") {
    if (parts.length === 1) return { name: "content" };
    if (second === "new" && parts.length === 2) return { name: "content-new" };
    if (second === "edit" && third && parts.length === 3)
      return { name: "content-edit", id: decodeURIComponent(third) };
    return { name: "not-found" };
  }
  if (head === "users" && second && parts.length === 2)
    return { name: "user", uid: decodeURIComponent(second) };
  if (parts.length === 1 && (pageNames as readonly string[]).includes(head))
    return { name: head as PageName };
  return { name: "not-found" };
}

export const paths = {
  page: (name: PageName) => `#/${name}`,
  dashboard: "#/dashboard",
  content: "#/content",
  contentNew: "#/content/new",
  contentEdit: (id: string) => `#/content/edit/${encodeURIComponent(id)}`,
  banners: "#/banners",
  audit: "#/audit",
  users: "#/users",
  user: (uid: string) => `#/users/${encodeURIComponent(uid)}`,
};

export const navigate = (path: string) => {
  window.location.hash = path;
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
