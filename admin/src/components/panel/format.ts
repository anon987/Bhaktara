import { formatDistanceToNowStrict } from "date-fns";

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "—";
export const formatDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";
export const ago = (iso: string | null | undefined) =>
  iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : "never";
export const compact = (value: number) =>
  new Intl.NumberFormat("en-IN", { notation: value >= 10000 ? "compact" : "standard" }).format(value);
