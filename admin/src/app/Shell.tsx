import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronsUpDown, LogOut, Monitor, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { SessionActions, SessionUser } from "../auth/session";
import { AdminRole, can } from "../domain";
import { EmptyState, PageBoundary } from "../components/panel/page";
import { navGroups, navItemFor } from "./nav";
import { navigate, paths, Route, useRoute } from "./router";
import { pageFor } from "./pages";

type Props = {
  role: AdminRole;
  user: SessionUser;
  actions: SessionActions;
  environment: string;
};

export function Lotus({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <path d="M20 6c4 5 5 11 0 20-5-9-4-15 0-20Z" fill="currentColor" opacity=".95" />
      <path d="M7 14c6 1 10 5 13 12-7-1-12-5-13-12Z" fill="currentColor" opacity=".7" />
      <path d="M33 14c-6 1-10 5-13 12 7-1 12-5 13-12Z" fill="currentColor" opacity=".7" />
      <path d="M6 27c5 3 9 3 14 0 5 3 9 3 14 0-4 5-9 7-14 7S10 32 6 27Z" fill="currentColor" opacity=".45" />
    </svg>
  );
}

function initials(user: SessionUser) {
  const source = user.email ?? user.uid;
  return source.slice(0, 2).toUpperCase();
}

function NavMenu({ role, route }: { role: AdminRole; route: Route }) {
  const { setOpenMobile, isMobile } = useSidebar();
  const active =
    route.name === "content-new" || route.name === "content-edit"
      ? "content"
      : route.name === "user"
        ? "users"
        : route.name;
  return (
    <>
      {navGroups.map((group) => {
        const items = group.items.filter((item) => can(role, item.permission));
        if (items.length === 0) return null;
        return (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton
                      asChild
                      isActive={active === item.page}
                      tooltip={item.label}
                    >
                      <a
                        href={paths.page(item.page)}
                        onClick={() => isMobile && setOpenMobile(false)}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}
    </>
  );
}

function UserMenu({ user, role, actions }: { user: SessionUser; role: AdminRole; actions: SessionActions }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
              {initials(user)}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user.email ?? "Signed in"}</span>
            <span className="truncate text-xs text-muted-foreground">{role.replace("_", " ").toLowerCase()}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.email}</p>
          <p className="text-xs text-muted-foreground">{role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor /> System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void actions.signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

function CommandMenu({ role }: { role: AdminRole }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-9 justify-start gap-2 px-2 text-muted-foreground sm:w-56 sm:px-3"
        onClick={() => setOpen(true)}
        aria-label="Search the panel"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="Jump to any page">
        <CommandInput placeholder="Go to a page or action…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Actions">
            {can(role, "content.edit") && (
              <CommandItem onSelect={() => { navigate(paths.contentNew); setOpen(false); }}>
                New content item
              </CommandItem>
            )}
          </CommandGroup>
          {navGroups.map((group) => {
            const items = group.items.filter((item) => can(role, item.permission));
            if (items.length === 0) return null;
            return (
              <CommandGroup key={group.label} heading={group.label}>
                {items.map((item) => (
                  <CommandItem
                    key={item.page}
                    value={`${item.label} ${item.description}`}
                    onSelect={() => {
                      navigate(paths.page(item.page));
                      setOpen(false);
                    }}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">{item.description}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export function Shell({ role, user, actions, environment }: Props) {
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const firstPage = useMemo(
    () => navGroups.flatMap((group) => group.items).find((item) => can(role, item.permission))?.page,
    [role],
  );

  // Move focus to the new page heading so screen readers announce it.
  const routeKey = JSON.stringify(route);
  useEffect(() => {
    const heading = mainRef.current?.querySelector<HTMLElement>("h1");
    heading?.focus({ preventScroll: true });
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [routeKey]);

  useEffect(() => {
    if (route.name === "home-redirect" && firstPage) window.location.replace(paths.page(firstPage));
  }, [route.name, firstPage]);

  const pageName =
    route.name === "content-new" || route.name === "content-edit"
      ? "content"
      : route.name === "user"
        ? "users"
        : route.name;
  const item = navItemFor(pageName);
  const group = navGroups.find((entry) => entry.items.some((nav) => nav.page === pageName));
  let page: ReactNode;
  if (route.name === "home-redirect") page = null;
  else if (item && !can(role, item.permission))
    page = <EmptyState title="Not available" text={`Your role (${role}) cannot open ${item.label}.`} />;
  else page = pageFor(route, role) ?? <EmptyState title="Page not found" text="That address does not exist in the panel." />;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <a href={paths.page(firstPage ?? "dashboard")}>
                  <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-primary to-kumkum text-primary-foreground">
                    <Lotus className="size-5" />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="font-display text-base font-semibold">Bhaktara</span>
                    <span className="truncate text-xs text-muted-foreground">Admin · {environment}</span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavMenu role={role} route={route} />
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <UserMenu user={user} role={role} actions={actions} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur md:rounded-t-xl">
          <SidebarTrigger aria-label="Toggle menu" className="size-9" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList>
              {group && (
                <>
                  <BreadcrumbItem className="hidden md:block">{group.label}</BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                </>
              )}
              <BreadcrumbItem>
                <BreadcrumbPage className="truncate">{item?.label ?? "Bhaktara"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Badge variant="outline" className="hidden border-primary/40 text-primary sm:inline-flex">
            {environment}
          </Badge>
          <CommandMenu role={role} />
          <ThemeToggle />
        </header>
        <main id="main" ref={mainRef} className="flex-1 p-4 md:p-8">
          <div className="mx-auto w-full max-w-7xl">
            <PageBoundary key={JSON.stringify(route)}>{page}</PageBoundary>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
