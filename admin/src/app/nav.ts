import {
  AudioLines,
  Award,
  BellRing,
  BookOpenText,
  Clapperboard,
  FlameKindling,
  Image,
  Music4,
  BookOpen,
  CalendarHeart,
  Flame,
  Flower2,
  Gauge,
  History,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  type LucideIcon,
  Megaphone,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tags,
  Target,
  UploadCloud,
  Users,
} from "lucide-react";
import type { Permission } from "../domain";
import type { PageName } from "./router";

export type NavItem = {
  page: PageName;
  label: string;
  icon: LucideIcon;
  permission: Permission;
  description: string;
};
export type NavGroup = { label: string; items: NavItem[] };

// The sidebar (doc 09 §1). Items a role cannot use are hidden.
export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { page: "dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.read", description: "Users, practice and content at a glance" },
    ],
  },
  {
    label: "Library",
    items: [
      { page: "upload", label: "Upload", icon: UploadCloud, permission: "content.upload", description: "Upload one file, many files, a folder or a ZIP" },
      { page: "bhajans", label: "Bhajans", icon: Music4, permission: "content.read", description: "Devotional songs, with a player" },
      { page: "aartis", label: "Aartis", icon: FlameKindling, permission: "content.read", description: "Aartis for each deity, with a player" },
      { page: "mantras", label: "Mantras", icon: AudioLines, permission: "content.read", description: "Mantra chants, with a player" },
      { page: "chalisas", label: "Chalisas", icon: BookOpenText, permission: "content.read", description: "Chalisa recitations, with a player" },
      { page: "wallpapers", label: "Wallpapers", icon: Image, permission: "content.read", description: "Phone wallpapers, with full-size view" },
      { page: "ringtones", label: "Ringtones", icon: BellRing, permission: "content.read", description: "Ringtones, with a player" },
      { page: "status-videos", label: "Status videos", icon: Clapperboard, permission: "content.read", description: "WhatsApp status videos, with a video player" },
      { page: "content", label: "All content", icon: BookOpen, permission: "content.read", description: "Every item of every type in one list" },
    ],
  },
  {
    label: "Content",
    items: [
      { page: "media", label: "Media library", icon: Images, permission: "asset.read", description: "Images for banners, deities, festivals and offerings" },
      { page: "home", label: "Home manager", icon: LayoutTemplate, permission: "home.read", description: "Order and content of the Home screen" },
      { page: "banners", label: "Banners", icon: Megaphone, permission: "banner.read", description: "The hero carousel at the top of Home" },
      { page: "collections", label: "Collections", icon: Library, permission: "catalog.read", description: "Editorial collections and rails" },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { page: "deities", label: "Deities", icon: Sparkles, permission: "catalog.read", description: "Deities, Mandir art and order" },
      { page: "categories", label: "Categories", icon: Tags, permission: "catalog.read", description: "Browse categories for Explore" },
    ],
  },
  {
    label: "Sadhana",
    items: [
      { page: "challenges", label: "Challenges", icon: Target, permission: "catalog.read", description: "Daily and weekly sankalps" },
      { page: "badges", label: "Badges", icon: Award, permission: "catalog.read", description: "Milestones and their rewards" },
      { page: "puja", label: "Puja offerings", icon: Flower2, permission: "config.read", description: "Flowers, bhog and tilak for each deity" },
      { page: "sadhana-config", label: "Sadhana plan", icon: Flame, permission: "config.read", description: "Daily plan and puja tray" },
      { page: "gamification-config", label: "XP & levels", icon: Gauge, permission: "config.read", description: "XP table, caps and level curve" },
    ],
  },
  {
    label: "Mandir & festivals",
    items: [
      { page: "festivals", label: "Festivals", icon: CalendarHeart, permission: "catalog.read", description: "Festival dates for the year" },
      { page: "mandir-offerings", label: "Mandir offerings", icon: Settings2, permission: "catalog.read", description: "Free and special Mandir offerings" },
    ],
  },
  {
    label: "People",
    items: [
      { page: "users", label: "Users", icon: Users, permission: "user.read", description: "Find, view and moderate users" },
      { page: "roles", label: "Staff roles", icon: ShieldCheck, permission: "role.read", description: "Who can use this panel" },
      { page: "audit", label: "Audit log", icon: History, permission: "audit.read", description: "Every change made in the panel" },
    ],
  },
];

export const navItems = navGroups.flatMap((group) => group.items);
export const navItemFor = (page: string) => navItems.find((item) => item.page === page);
