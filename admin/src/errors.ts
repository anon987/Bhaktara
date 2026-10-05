import { checkLabels, type CheckItem, type TransitionErrorDetails } from "./domain";

// Turns callable and Firestore errors into something an operator can act
// on. The functions attach structured details (functions/src/core.ts parse
// issues, content.ts TransitionErrorDetails); those are shown as a list.
export type Problem = { field: string; message: string };
export type ReadableError = {
  kind:
    | "checklist"
    | "invalid-transition"
    | "schedule"
    | "invalid"
    | "permission"
    | "signed-out"
    | "not-found"
    | "exists"
    | "uploads-unconfigured"
    | "precondition"
    | "unreachable"
    | "unknown";
  title: string;
  message: string;
  problems: Problem[];
};

type ErrorLike = { code?: unknown; message?: unknown; details?: unknown };

const fieldLabels: Record<string, string> = {
  "title.hi": "Title (Hindi)",
  "title.en": "Title (English)",
  "description.hi": "Description (Hindi)",
  "description.en": "Description (English)",
  "subtitle.hi": "Subtitle (Hindi)",
  "subtitle.en": "Subtitle (English)",
  "ctaText.hi": "Button text (Hindi)",
  "ctaText.en": "Button text (English)",
  audioLanguage: "Audio language",
  deityIds: "Deities",
  categoryIds: "Categories",
  tags: "Tags",
  durationSeconds: "Duration",
  expireAt: "Expiry",
  "private.sourceText": "Source text",
  "private.sourceTextRef": "Source reference",
  "private.aiTool": "AI tool",
  "private.aiPlan": "AI plan",
  "private.licenseRecordId": "License record",
  "image.mobile.key": "Mobile image key",
  "image.thumb.key": "Thumbnail key",
  priority: "Priority",
  startAt: "Start",
  endAt: "End",
  languages: "Languages",
  id: "ID",
  contentId: "Content ID",
  scheduledAt: "Publish time",
  bytes: "File size",
};

// Human label for a field path from zod issues or readiness problems.
export function fieldLabel(path: string): string {
  const field = path.replace(/^draft\./, "").replace(/^banner\./, "");
  if (fieldLabels[field]) return fieldLabels[field];
  const media = /^media\.(\w+)(\.key)?$/.exec(field);
  if (media) return `Media "${media[1]}"`;
  const check = /^(?:private\.)?checklist\.(\w+)$/.exec(field);
  if (check && check[1] in checkLabels)
    return `Checklist: ${checkLabels[check[1] as CheckItem]}`;
  return field || "Request";
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

function problemsFrom(details: unknown): Problem[] {
  const data = record(details);
  if (Array.isArray(data.problems))
    return data.problems.map((problem) => {
      const item = record(problem);
      return { field: String(item.field ?? ""), message: String(item.message ?? "") };
    });
  if (Array.isArray(data.issues))
    return data.issues.map((issue) => {
      const item = record(issue);
      return { field: String(item.path ?? ""), message: String(item.message ?? "") };
    });
  return [];
}

export function readableError(error: unknown): ReadableError {
  const value = (typeof error === "object" && error !== null
    ? error
    : {}) as ErrorLike;
  const code = String(value.code ?? "").replace(/^functions\//, "");
  const message =
    typeof value.message === "string" && value.message
      ? value.message
      : error instanceof Error
        ? error.message
        : String(error);
  const problems = problemsFrom(value.details);
  const reason = record(value.details).reason as
    | TransitionErrorDetails["reason"]
    | undefined;
  const result = (
    kind: ReadableError["kind"],
    title: string,
    text = message,
  ): ReadableError => ({ kind, title, message: text, problems });

  switch (code) {
    case "failed-precondition":
      if (reason === "CHECKLIST_INCOMPLETE")
        return result(
          "checklist",
          "Not ready yet",
          "The server refused the move. Fix these first:",
        );
      if (reason === "INVALID_TRANSITION")
        return result("invalid-transition", "Move not allowed");
      if (reason === "SCHEDULE_REQUIRED")
        return result("schedule", "Schedule needed");
      if (/not configured/i.test(message))
        return result(
          "uploads-unconfigured",
          "Uploads are not configured here",
          "This environment has no R2 storage credentials, so requestUploadUrl cannot issue upload slots. Ask the operator to configure the R2 settings for the functions (see docs/MEDIA_R2.md). Nothing was uploaded.",
        );
      return result("precondition", "Cannot do that right now");
    case "invalid-argument":
      return result(
        "invalid",
        "Some fields are invalid",
        "The server rejected these fields:",
      );
    case "permission-denied":
      return result(
        "permission",
        "Not allowed",
        message.includes("Missing or insufficient permissions")
          ? "Your account cannot read this. If your role changed, choose Refresh access."
          : message,
      );
    case "unauthenticated":
      return result("signed-out", "Signed out", "Sign in again to continue.");
    case "not-found":
      // A bare "not-found" is the HTTP 404 of a callable that is not
      // deployed or not loaded; the functions' own errors name the item.
      if (message === "not-found")
        return result(
          "unreachable",
          "Server problem",
          "This CMS function is not available. In development, check that `npm run emulators:cms` is running and the functions loaded.",
        );
      return result("not-found", "Not found");
    case "already-exists":
      return result("exists", "Already exists");
    case "internal":
    case "unavailable":
    case "deadline-exceeded":
      return result(
        "unreachable",
        "Server problem",
        "The CMS server failed or could not be reached. In development, check that `npm run emulators:cms` is running.",
      );
    default:
      return result("unknown", "Something went wrong");
  }
}
