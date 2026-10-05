import { useEffect, useState } from "react";

// A tiny hash router: four screens do not need a routing library, and hash
// URLs work on any static host (Firebase Hosting rewrites are still set).
export type Route =
  | { name: "content" }
  | { name: "content-new" }
  | { name: "content-edit"; id: string }
  | { name: "banners" }
  | { name: "audit" }
  | { name: "home" }
  | { name: "not-found" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "content") {
    if (parts.length === 1) return { name: "content" };
    if (parts[1] === "new" && parts.length === 2) return { name: "content-new" };
    if (parts[1] === "edit" && parts.length === 3)
      return { name: "content-edit", id: decodeURIComponent(parts[2]) };
  }
  if (parts.length === 1 && parts[0] === "banners") return { name: "banners" };
  if (parts.length === 1 && parts[0] === "audit") return { name: "audit" };
  return { name: "not-found" };
}

export const paths = {
  content: "#/content",
  contentNew: "#/content/new",
  contentEdit: (id: string) => `#/content/edit/${encodeURIComponent(id)}`,
  banners: "#/banners",
  audit: "#/audit",
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
