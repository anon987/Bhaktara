import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminApi, ContentRow } from "../../api";
import { AdminProvider } from "../../app/context";
import type { AdminRole, ContentStatus, ContentType } from "../../domain";
import { fakeApi } from "../../test/fakeApi";
import type { BulkContentCall } from "./bulk";
import { ContentLibraryPage } from "./ContentLibraryPage";

const row = (id: string, status: ContentStatus = "DRAFT", index = 0): ContentRow => ({
  id,
  type: "BHAJAN",
  status,
  title: { en: `Bhajan ${id}`, hi: "भजन" },
  // Newest first, so the default sort keeps this order.
  updatedAt: new Date(Date.UTC(2026, 0, 1) - index * 60_000).toISOString(),
  scheduledAt: null,
  deityIds: ["shiva"],
});
const rowsOf = (statuses: ContentStatus[]) => statuses.map((status, index) => row(`b${index + 1}`, status, index));

const okFor: BulkContentCall = async ({ ids, action }) => ({
  results: ids.map((id) => ({
    id,
    ok: true,
    status: action.kind === "transition" ? action.to : undefined,
  })),
});

function renderLibrary({
  rows,
  role = "CONTENT_ADMIN",
  bulk = vi.fn(okFor),
  type = "BHAJAN",
  listContent,
}: {
  rows: ContentRow[];
  role?: AdminRole;
  bulk?: ReturnType<typeof vi.fn<BulkContentCall>>;
  type?: ContentType;
  listContent?: AdminApi["listContent"];
}) {
  const api = Object.assign(
    fakeApi({ listContent: listContent ?? vi.fn(async () => ({ items: rows, next: null })) }),
    { bulkContent: bulk },
  );
  render(
    <AdminProvider api={api} role={role}>
      <ContentLibraryPage type={type} />
    </AdminProvider>,
  );
  return { api, bulk };
}

const box = (title: string) => screen.getByRole("checkbox", { name: `Select ${title}` });
const announced = (text: string) =>
  waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text));
const bar = () => screen.getByRole("region", { name: "Bulk actions" });

describe("library selection", () => {
  it("selects one item, a shift-click range, and all shown; Esc clears", async () => {
    const user = userEvent.setup();
    renderLibrary({ rows: rowsOf(["DRAFT", "DRAFT", "DRAFT", "DRAFT", "DRAFT"]) });
    await screen.findByText("Bhajan b1");

    await user.click(box("Bhajan b2"));
    expect(box("Bhajan b2")).toBeChecked();
    expect(within(bar()).getByText("1 selected")).toBeInTheDocument();

    await user.keyboard("{Shift>}");
    await user.click(box("Bhajan b4"));
    await user.keyboard("{/Shift}");
    expect(box("Bhajan b3")).toBeChecked();
    expect(box("Bhajan b4")).toBeChecked();
    expect(box("Bhajan b1")).not.toBeChecked();
    expect(within(bar()).getByText("3 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Select all 5 shown" }));
    expect(within(bar()).getByText("5 selected")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Bulk actions" })).not.toBeInTheDocument();
    expect(box("Bhajan b2")).not.toBeChecked();
  });

  it("clears the selection when a filter changes", async () => {
    const user = userEvent.setup();
    renderLibrary({ rows: rowsOf(["DRAFT", "DRAFT"]) });
    await user.click(await screen.findByRole("checkbox", { name: "Select Bhajan b1" }));
    expect(bar()).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Filter by title or deity" }), "b");
    expect(screen.queryByRole("region", { name: "Bulk actions" })).not.toBeInTheDocument();
  });

  it("selects all matching items by loading the remaining pages, and sends them in chunks of 200", async () => {
    const user = userEvent.setup();
    const all = Array.from({ length: 205 }, (_, index) => row(`r${index}`, "READY", index));
    const listContent = vi.fn<AdminApi["listContent"]>(async ({ after }) =>
      after ? { items: all.slice(50), next: null } : { items: all.slice(0, 50), next: "r49" },
    );
    const { bulk } = renderLibrary({ rows: all, listContent });
    await screen.findByText("Bhajan r0");

    await user.click(screen.getByRole("button", { name: /Select all matching/ }));
    await waitFor(() => expect(within(bar()).getByText("205 selected")).toBeInTheDocument());
    expect(listContent).toHaveBeenLastCalledWith(expect.objectContaining({ after: "r49", type: "BHAJAN" }));

    await user.click(within(bar()).getByRole("button", { name: /^Publish now/ }));
    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(2));
    expect(bulk.mock.calls[0][0].ids).toHaveLength(200);
    expect(bulk.mock.calls[1][0].ids).toHaveLength(5);
    expect(bulk.mock.calls[0][0].action).toEqual({ kind: "transition", to: "PUBLISHED" });
    await announced("205 published");
  });
});

describe("bulk action bar", () => {
  it("shows editors only their actions, with how many items each applies to", async () => {
    const user = userEvent.setup();
    renderLibrary({ rows: rowsOf(["DRAFT", "READY", "PUBLISHED"]), role: "EDITOR" });
    await user.click(await screen.findByRole("checkbox", { name: "Select all 3 shown" }));

    const actions = within(bar());
    expect(actions.getByRole("button", { name: "Mark ready (1 of 3 selected)" })).toBeEnabled();
    expect(actions.getByRole("button", { name: "Back to draft (1 of 3 selected)" })).toBeEnabled();
    expect(actions.getByRole("button", { name: "Edit details (3 items)" })).toBeEnabled();
    for (const name of [/^Publish now/, /^Schedule/, /^Archive/, /^Restore/, /^Delete/])
      expect(actions.queryByRole("button", { name })).not.toBeInTheDocument();
  });

  it("shows admins every action and disables the ones that apply to nothing", async () => {
    const user = userEvent.setup();
    renderLibrary({ rows: rowsOf(["DRAFT", "READY", "PUBLISHED"]) });
    await user.click(await screen.findByRole("checkbox", { name: "Select all 3 shown" }));

    const actions = within(bar());
    expect(actions.getByRole("button", { name: "Publish now (2 of 3 selected)" })).toBeEnabled();
    expect(actions.getByRole("button", { name: "Back to draft (2 of 3 selected)" })).toBeEnabled();
    expect(actions.getByRole("button", { name: "Archive (2 of 3 selected)" })).toBeEnabled();
    expect(actions.getByRole("button", { name: "Restore (0 of 3 selected)" })).toBeDisabled();
    expect(actions.getByRole("button", { name: "Delete (1 of 3 selected)" })).toBeEnabled();
  });

  it("edit details sends only the changed fields", async () => {
    const user = userEvent.setup();
    const { bulk } = renderLibrary({ rows: rowsOf(["PUBLISHED", "DRAFT"]) });
    await user.click(await screen.findByRole("checkbox", { name: "Select all 2 shown" }));
    await user.click(within(bar()).getByRole("button", { name: /^Edit details/ }));

    const dialog = await screen.findByRole("dialog", { name: "Edit details of 2 items" });
    expect(within(dialog).getByRole("button", { name: "Save to 2 items" })).toBeDisabled();
    await user.click(within(within(dialog).getByRole("radiogroup", { name: "Featured" })).getByRole("radio", { name: "On" }));
    await user.click(within(within(dialog).getByRole("radiogroup", { name: "Save policy" })).getByRole("radio", { name: "Free" }));
    await user.click(within(dialog).getByRole("button", { name: "Save to 2 items" }));

    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
    expect(bulk.mock.calls[0][0]).toEqual({
      ids: ["b1", "b2"],
      action: { kind: "update", patch: { isFeatured: true, saveGate: "FREE" } },
    });
  });

  it("lists failed items with their reason, keeps them selected and updates the rest in place", async () => {
    const user = userEvent.setup();
    const bulk = vi.fn<BulkContentCall>(async () => ({
      results: [
        { id: "b1", ok: true, status: "PUBLISHED" },
        { id: "b2", ok: false, problems: [{ field: "deityIds", message: "At least one deity is required" }] },
      ],
    }));
    renderLibrary({ rows: rowsOf(["READY", "DRAFT", "ARCHIVED"]), bulk });
    await user.click(await screen.findByRole("checkbox", { name: "Select all 3 shown" }));
    await user.click(within(bar()).getByRole("button", { name: /^Publish now/ }));

    await announced("1 published · 1 skipped · 1 failed");
    const failed = screen.getByRole("list", { name: "Failed items" });
    expect(within(failed).getByRole("link", { name: /Bhajan b2/ })).toHaveAttribute("href", "#/content/edit/b2");
    expect(within(failed).getByText("Deities: At least one deity is required")).toBeInTheDocument();

    expect(box("Bhajan b2")).toBeChecked();
    expect(box("Bhajan b1")).not.toBeChecked();
    expect(box("Bhajan b3")).not.toBeChecked();
    expect(within(bar()).getByText("1 selected")).toBeInTheDocument();
    expect(screen.getAllByText("published").length).toBeGreaterThan(0);
  });

  it("deletes only after the number of items is typed", async () => {
    const user = userEvent.setup();
    const { bulk } = renderLibrary({ rows: rowsOf(["ARCHIVED", "ARCHIVED", "PUBLISHED"]) });
    await user.click(await screen.findByRole("checkbox", { name: "Select all 3 shown" }));
    await user.click(within(bar()).getByRole("button", { name: /^Delete/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/permanently removes/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Only archived items and drafts that were never published/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Delete 2 items" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "3");
    expect(confirm).toBeDisabled();
    await user.clear(within(dialog).getByRole("textbox"));
    await user.type(within(dialog).getByRole("textbox"), "2");
    await user.click(confirm);

    await waitFor(() => expect(bulk).toHaveBeenCalledWith({ ids: ["b1", "b2"], action: { kind: "delete" } }));
    await announced("2 deleted · 1 skipped");
    expect(screen.queryByText("Bhajan b1")).not.toBeInTheDocument();
    expect(screen.getByText("Bhajan b3")).toBeInTheDocument();
  });
});
