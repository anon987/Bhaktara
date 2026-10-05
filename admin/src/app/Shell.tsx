import { useEffect, useRef } from "react";
import { AuditLog } from "../audit/AuditLog";
import type { SessionActions, SessionUser } from "../auth/session";
import { BannerManager } from "../banners/BannerManager";
import { ContentEditor } from "../content/ContentEditor";
import { ContentList } from "../content/ContentList";
import { AdminRole, can, Permission } from "../domain";
import { paths, Route, useRoute } from "./router";

const sections: { label: string; href: string; permission: Permission; routes: Route["name"][] }[] = [
  {
    label: "Content",
    href: paths.content,
    permission: "content.read",
    routes: ["content", "content-new", "content-edit"],
  },
  { label: "Banners", href: paths.banners, permission: "banner.read", routes: ["banners"] },
  { label: "Audit log", href: paths.audit, permission: "audit.read", routes: ["audit"] },
];

type Props = {
  role: AdminRole;
  user: SessionUser;
  actions: SessionActions;
  environment: string;
};

export function Shell({ role, user, actions, environment }: Props) {
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const visible = sections.filter((section) => can(role, section.permission));
  const current = sections.find((section) => section.routes.includes(route.name));

  // Move focus to the new page heading so screen readers announce it.
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    const heading = mainRef.current?.querySelector<HTMLElement>("h1");
    heading?.focus({ preventScroll: false });
  }, [routeKey]);

  const start = visible[0]?.href;
  useEffect(() => {
    if (route.name === "home" && start) window.location.replace(start);
  }, [route.name, start]);

  let page;
  if (route.name === "home") page = null;
  else if (current && !can(role, current.permission)) {
    page = (
      <section>
        <h1 tabIndex={-1}>Not available</h1>
        <p>Your role ({role}) cannot open {current.label}.</p>
      </section>
    );
  } else if (route.name === "content") page = <ContentList />;
  else if (route.name === "content-new")
    page = can(role, "content.edit") ? (
      <ContentEditor />
    ) : (
      <section>
        <h1 tabIndex={-1}>Not available</h1>
        <p>Your role ({role}) cannot create content.</p>
      </section>
    );
  else if (route.name === "content-edit") page = <ContentEditor key={route.id} id={route.id} />;
  else if (route.name === "banners") page = <BannerManager />;
  else if (route.name === "audit") page = <AuditLog />;
  else
    page = (
      <section>
        <h1 tabIndex={-1}>Page not found</h1>
        <p>
          <a href={visible[0]?.href ?? "#/"}>Go to the start page</a>
        </p>
      </section>
    );

  return (
    <div className="shell">
      <a className="skip-link" href="#main" onClick={(event) => {
        event.preventDefault();
        mainRef.current?.focus();
      }}>
        Skip to content
      </a>
      <header className="topbar">
        <span className="brand">Bhaktara Admin</span>
        <nav aria-label="Sections">
          <ul>
            {visible.map((section) => (
              <li key={section.href}>
                <a
                  href={section.href}
                  aria-current={current === section ? "page" : undefined}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="account">
          <span className="env-badge">{environment}</span>
          <span>
            {user.email ?? user.uid} · <strong>{role}</strong>
          </span>
          <button type="button" onClick={() => actions.signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        {page}
      </main>
    </div>
  );
}
