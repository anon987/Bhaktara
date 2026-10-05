import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminApi, ContentRecord } from "../api";
import { AdminProvider } from "../app/context";
import type { AdminRole, ContentStatus } from "../domain";
import { callableError, fakeApi } from "../test/fakeApi";
import { ContentEditor } from "./ContentEditor";

const record = (status: ContentStatus = "DRAFT"): ContentRecord => ({
  id: "hanuman-chalisa",
  status,
  updatedAt: "2026-10-01T05:00:00.000Z",
  scheduledAt: null,
  publishedAt: null,
  draft: {
    type: "BHAJAN",
    title: { hi: "भजन", en: "Bhajan" },
    description: { hi: "", en: "A bhajan" },
    deityIds: ["hanuman"],
    categoryIds: [],
    tags: [],
    media: { thumb: { key: "bhajan/x/thumb.abcd1234.webp" } },
    isFeatured: false,
    saveGate: "FREE",
    isShareable: true,
    adEligible: true,
    private: { checklist: {} },
  },
});

function renderEditor(api: AdminApi, role: AdminRole, id?: string) {
  render(
    <AdminProvider api={api} role={role}>
      <ContentEditor id={id} />
    </AdminProvider>,
  );
}

describe("ContentEditor validation", () => {
  it("shows the shared readiness rules for a new draft", async () => {
    renderEditor(fakeApi(), "EDITOR");
    const status = await screen.findByRole("complementary", { name: "Status and media" });
    expect(within(status).getByText(/Needed before READY/)).toBeInTheDocument();
    expect(within(status).getByText(/Hindi title is required/)).toBeInTheDocument();
    expect(within(status).getByText(/At least one deity is required/)).toBeInTheDocument();
  });

  it("flags invalid fields instantly and does not call the server", async () => {
    const api = fakeApi();
    renderEditor(api, "EDITOR");
    const thumb = await screen.findByLabelText("thumb (required)");
    await userEvent.type(thumb, "https://cdn.example.com/a.webp");
    expect(thumb).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Media must use asset keys").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent("Fix these fields before saving");

    await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
    expect(api.createContent).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("ID: Use a lowercase slug");
  });

  it("shows server field errors from a rejected save", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => record()),
      updateContent: vi.fn(async () => {
        throw callableError("invalid-argument", "Some fields are invalid.", {
          issues: [{ path: "deityIds", message: "unknown deity vishnu" }],
        });
      }),
    });
    renderEditor(api, "EDITOR", "hanuman-chalisa");
    await userEvent.type(await screen.findByLabelText("Tags"), "aarti");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Some fields are invalid");
    expect(alert).toHaveTextContent("Deities: unknown deity vishnu");
  });
});

describe("ContentEditor status transitions", () => {
  it("lists the checklist problems when the server refuses DRAFT → READY", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => record()),
      transitionContent: vi.fn(async () => {
        throw callableError(
          "failed-precondition",
          "The checklist or required fields are incomplete.",
          {
            reason: "CHECKLIST_INCOMPLETE",
            problems: [
              { field: "description.hi", message: "Hindi description is required" },
              {
                field: "checklist.titleChecked",
                message: "Checklist: Title correct in Hindi and English, spelling checked",
              },
            ],
          },
        );
      }),
    });
    renderEditor(api, "EDITOR", "hanuman-chalisa");
    await userEvent.click(await screen.findByRole("button", { name: "Move to READY" }));
    expect(api.transitionContent).toHaveBeenCalledWith({
      contentId: "hanuman-chalisa",
      to: "READY",
      scheduledAt: undefined,
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not ready yet");
    expect(alert).toHaveTextContent("Description (Hindi): Hindi description is required");
    expect(alert).toHaveTextContent(
      "Checklist: Title correct in Hindi and English, spelling checked",
    );
  });

  it("shows role limits and the server's permission refusal", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => record("READY")),
      transitionContent: vi.fn(async () => {
        throw callableError("permission-denied", "Your role (EDITOR) cannot do this.");
      }),
    });
    renderEditor(api, "EDITOR", "hanuman-chalisa");
    expect(
      await screen.findByText(/Publish now needs SUPER_ADMIN or CONTENT_ADMIN/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish now" })).not.toBeInTheDocument();
    expect(screen.getByText(/Move it back to DRAFT to edit it/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back to DRAFT" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not allowed");
    expect(alert).toHaveTextContent("Your role (EDITOR) cannot do this.");
  });

  it("explains a missing schedule time", async () => {
    const api = fakeApi({
      getContent: vi.fn(async () => record("READY")),
      transitionContent: vi.fn(async () => {
        throw callableError(
          "failed-precondition",
          "Scheduling needs a publish time in the future.",
          { reason: "SCHEDULE_REQUIRED" },
        );
      }),
    });
    renderEditor(api, "CONTENT_ADMIN", "hanuman-chalisa");
    await userEvent.click(await screen.findByRole("button", { name: "Schedule" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Schedule needed");
    expect(alert).toHaveTextContent("Scheduling needs a publish time in the future.");
  });

  it("blocks status moves while there are unsaved edits", async () => {
    renderEditor(fakeApi({ getContent: vi.fn(async () => record()) }), "EDITOR", "hanuman-chalisa");
    await userEvent.type(await screen.findByLabelText("Tags"), "x");
    expect(screen.getByRole("button", { name: "Move to READY" })).toBeDisabled();
    expect(screen.getByText(/Save your changes before changing the status/)).toBeInTheDocument();
  });
});
