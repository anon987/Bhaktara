import type { ReactNode } from "react";
import type { AdminRole } from "../domain";
import { AuditPage } from "../pages/AuditPage";
import { BannersPage } from "../pages/BannersPage";
import { CatalogPage } from "../pages/catalog/CatalogPage";
import { ConfigPage } from "../pages/config/ConfigPage";
import { ContentEditorPage } from "../pages/content/ContentEditorPage";
import { ContentLibraryPage } from "../pages/content/ContentLibraryPage";
import { DashboardPage } from "../pages/DashboardPage";
import { HomeManagerPage } from "../pages/HomeManagerPage";
import { MediaLibraryPage } from "../pages/MediaLibraryPage";
import { RolesPage } from "../pages/RolesPage";
import { UserDetailPage } from "../pages/users/UserDetailPage";
import { UsersPage } from "../pages/users/UsersPage";
import { librarySections, type Route } from "./router";

export function pageFor(route: Route, role: AdminRole): ReactNode | null {
  switch (route.name) {
    case "dashboard":
      return <DashboardPage />;
    case "content":
      return <ContentLibraryPage key="all" />;
    case "bhajans":
    case "aartis":
    case "mantras":
    case "chalisas":
    case "wallpapers":
    case "ringtones":
    case "status-videos":
      return <ContentLibraryPage key={route.name} type={librarySections[route.name]} />;
    case "content-new":
      return <ContentEditorPage key={`new-${route.type ?? ""}`} type={route.type} />;
    case "content-edit":
      return <ContentEditorPage key={route.id} id={route.id} />;
    case "media":
      return <MediaLibraryPage />;
    case "home":
      return <HomeManagerPage />;
    case "banners":
      return <BannersPage />;
    case "collections":
      return <CatalogPage key="collection" kind="collection" />;
    case "deities":
      return <CatalogPage key="deity" kind="deity" />;
    case "categories":
      return <CatalogPage key="category" kind="category" />;
    case "challenges":
      return <CatalogPage key="challenge" kind="challenge" />;
    case "badges":
      return <CatalogPage key="badge" kind="badge" />;
    case "festivals":
      return <CatalogPage key="festival" kind="festival" />;
    case "mandir-offerings":
      return <CatalogPage key="mandirOffering" kind="mandirOffering" />;
    case "puja":
      return <ConfigPage key="puja" id="puja" />;
    case "sadhana-config":
      return <ConfigPage key="sadhana" id="sadhana" />;
    case "gamification-config":
      return <ConfigPage key="gamification" id="gamification" />;
    case "users":
      return <UsersPage />;
    case "user":
      return <UserDetailPage key={route.uid} uid={route.uid} />;
    case "roles":
      return <RolesPage />;
    case "audit":
      return <AuditPage />;
    default:
      void role;
      return null;
  }
}
