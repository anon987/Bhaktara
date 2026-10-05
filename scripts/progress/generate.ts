// Renders docs/MILESTONES.md from docs/progress/roadmap.json.
//
//   npm run progress         regenerate the Markdown
//   npm run progress:check   exit 1 if the Markdown is stale or the data is invalid
//
// Output is deterministic: the date comes from the JSON's `updated` field,
// never from the clock, so the check is stable in CI.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { format } from "prettier";
import { z } from "zod";

const root = resolve(__dirname, "..", "..");
const dataPath = resolve(root, "docs/progress/roadmap.json");
const outputPath = resolve(root, "docs/MILESTONES.md");
const outputDir = resolve(root, "docs");

const statusSchema = z.enum([
  "done",
  "in_progress",
  "not_started",
  "blocked",
  "deferred",
]);
type Status = z.infer<typeof statusSchema>;

const itemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    status: statusSchema,
    notes: z.string(),
    evidence: z.array(z.string().min(1)).optional(),
    blockedBy: z.array(z.string().min(1)).optional(),
  })
  .strict();
type Item = z.infer<typeof itemSchema>;

const milestoneSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    scope: z.enum(["v1", "later"]),
    goal: z.string().min(1),
    items: z.array(itemSchema).min(1),
  })
  .strict();
type Milestone = z.infer<typeof milestoneSchema>;

const blockerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    kind: z.enum(["decision", "billing", "purchase", "external"]),
    detail: z.string().min(1),
    ref: z.string().min(1).optional(),
  })
  .strict();
type Blocker = z.infer<typeof blockerSchema>;

const roadmapSchema = z
  .object({
    $comment: z.string(),
    title: z.string().min(1),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    source: z.string().min(1),
    milestones: z.array(milestoneSchema).min(1),
    blockers: z.array(blockerSchema),
  })
  .strict();
type Roadmap = z.infer<typeof roadmapSchema>;

const STATUS_ORDER: Status[] = [
  "done",
  "in_progress",
  "not_started",
  "blocked",
  "deferred",
];
const STATUS_LABEL: Record<Status, string> = {
  done: "✅ Done",
  in_progress: "🔄 In progress",
  not_started: "⏳ Not started",
  blocked: "⛔ Blocked",
  deferred: "💤 Deferred",
};
const STATUS_EMOJI: Record<Status, string> = {
  done: "✅",
  in_progress: "🔄",
  not_started: "⏳",
  blocked: "⛔",
  deferred: "💤",
};
const KIND_LABEL: Record<Blocker["kind"], string> = {
  decision: "Decision",
  billing: "Billing",
  purchase: "Purchase",
  external: "External",
};
const NEXT_UP_NOT_STARTED = 6;
const COMMIT = /^[0-9a-f]{7,40}$/;

function fail(message: string): never {
  console.error(`progress: ${message}`);
  process.exit(1);
}

function load(): Roadmap {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(dataPath, "utf8"));
  } catch (error) {
    fail(`cannot read ${relative(root, dataPath)}: ${String(error)}`);
  }
  const parsed = roadmapSchema.safeParse(raw);
  if (!parsed.success) {
    fail(`invalid roadmap.json\n${z.prettifyError(parsed.error)}`);
  }
  validate(parsed.data);
  return parsed.data;
}

function validate(data: Roadmap) {
  const errors: string[] = [];
  const ids = new Set<string>();
  const items = new Map<string, Item>();
  for (const id of [
    ...data.milestones.map((m) => `milestone:${m.id}`),
    ...data.milestones.flatMap((m) => m.items.map((i) => i.id)),
    ...data.blockers.map((b) => b.id),
  ]) {
    if (ids.has(id)) errors.push(`duplicate id "${id}"`);
    ids.add(id);
  }
  for (const item of data.milestones.flatMap((m) => m.items)) {
    items.set(item.id, item);
  }
  const blockerIds = new Set(data.blockers.map((b) => b.id));
  for (const milestone of data.milestones) {
    for (const item of milestone.items) {
      for (const ref of item.blockedBy ?? []) {
        if (!blockerIds.has(ref) && !items.has(ref)) {
          errors.push(`${item.id}: unknown blockedBy "${ref}"`);
        }
        if (ref === item.id) errors.push(`${item.id}: blocks itself`);
      }
      if (item.status === "blocked" && !item.blockedBy?.length) {
        errors.push(`${item.id}: status "blocked" needs blockedBy`);
      }
      for (const evidence of item.evidence ?? []) {
        if (!COMMIT.test(evidence) && !existsSync(resolve(root, evidence))) {
          errors.push(`${item.id}: evidence path not found "${evidence}"`);
        }
      }
    }
  }
  for (const blocker of data.blockers) {
    if (blocker.ref && !existsSync(resolve(root, blocker.ref))) {
      errors.push(`${blocker.id}: ref path not found "${blocker.ref}"`);
    }
  }
  if (!existsSync(resolve(root, data.source))) {
    errors.push(`source path not found "${data.source}"`);
  }
  if (errors.length) fail(`invalid roadmap.json\n- ${errors.join("\n- ")}`);
}

type Counts = Record<Status, number> & { total: number };

function count(items: Item[]): Counts {
  const counts = {
    done: 0,
    in_progress: 0,
    not_started: 0,
    blocked: 0,
    deferred: 0,
    total: items.length,
  };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

// Completion counts only finished items; deferred work is out of scope.
function percent(counts: Counts): number | null {
  const inScope = counts.total - counts.deferred;
  return inScope === 0 ? null : Math.round((counts.done / inScope) * 100);
}

function bar(value: number | null, width: number): string {
  if (value === null) return `\`${"·".repeat(width)}\` deferred`;
  const filled = Math.round((value / 100) * width);
  return `\`${"█".repeat(filled)}${"░".repeat(width - filled)}\` ${value}%`;
}

function cell(text: string): string {
  return text
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

function link(path: string): string {
  const target = relative(outputDir, resolve(root, path)).split("\\").join("/");
  return `[${path}](${target})`;
}

function evidence(item: Item): string {
  return (item.evidence ?? [])
    .map((entry) => (COMMIT.test(entry) ? `\`${entry}\`` : link(entry)))
    .join(", ");
}

function render(data: Roadmap): string {
  const allItems = data.milestones.flatMap((m) => m.items);
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const blockers = new Map(data.blockers.map((b) => [b.id, b]));
  const v1 = data.milestones.filter((m) => m.scope === "v1");
  const later = data.milestones.filter((m) => m.scope === "later");
  const v1Counts = count(v1.flatMap((m) => m.items));
  const v1Percent = percent(v1Counts);

  const refName = (ref: string) =>
    blockers.get(ref)?.title ?? `${byId.get(ref)?.title ?? ref} (\`${ref}\`)`;
  // A dependency is open unless it is an item that is already done.
  const openDeps = (item: Item) =>
    (item.blockedBy ?? []).filter((ref) => byId.get(ref)?.status !== "done");

  const lines: string[] = [];
  const push = (...text: string[]) => lines.push(...text);

  push(
    `# 🪷 ${data.title}`,
    "",
    `> **Last generated:** ${data.updated} (from the \`updated\` field) · **Source of truth:** ${link("docs/progress/roadmap.json")} · **Roadmap:** ${link(data.source)}`,
    ">",
    "> Generated file — do not edit by hand. See the footer to update it.",
    "",
    "## Overall progress (V1: " + `${v1[0].id}–${v1[v1.length - 1].id})`,
    "",
    `**${bar(v1Percent, 20)}** — ${v1Counts.done} of ${v1Counts.total - v1Counts.deferred} V1 items done, ${v1Counts.in_progress} in progress.`,
    "",
    "| Status | Items |",
    "| --- | ---: |",
    ...STATUS_ORDER.map((s) => `| ${STATUS_LABEL[s]} | ${v1Counts[s]} |`),
    `| **Total** | **${v1Counts.total}** |`,
    "",
    "Completion % = done ÷ (total − deferred). In-progress items count as not done.",
    "",
    "### By milestone",
    "",
    "| Milestone | Progress | ✅ | 🔄 | ⏳ | ⛔ | 💤 | Total |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...data.milestones.map((m) => {
      const c = count(m.items);
      const label =
        m.scope === "later"
          ? `${m.id} ${m.title} _(post-V1)_`
          : `**${m.id}** ${m.title}`;
      return `| ${label} | ${bar(percent(c), 10)} | ${c.done} | ${c.in_progress} | ${c.not_started} | ${c.blocked} | ${c.deferred} | ${c.total} |`;
    }),
    "",
    "**Legend:** " + STATUS_ORDER.map((s) => STATUS_LABEL[s]).join(" · "),
    "",
  );

  const inProgress = v1.flatMap((m) =>
    m.items.filter((i) => i.status === "in_progress").map((i) => ({ m, i })),
  );
  const ready = v1
    .flatMap((m) =>
      m.items
        .filter((i) => i.status === "not_started" && openDeps(i).length === 0)
        .map((i) => ({ m, i })),
    )
    .slice(0, NEXT_UP_NOT_STARTED);
  push("## 🎯 Next up", "", "**In progress**", "");
  push(
    ...(inProgress.length
      ? inProgress.map(
          ({ m, i }) => `- 🔄 **${m.id}** · ${i.title} (\`${i.id}\`)`,
        )
      : ["- _Nothing in progress._"]),
    "",
    `**Next not-started items with no open blockers** (first ${NEXT_UP_NOT_STARTED} in roadmap order)`,
    "",
    ...(ready.length
      ? ready.map(({ m, i }) => `- ⏳ **${m.id}** · ${i.title} (\`${i.id}\`)`)
      : ["- _None._"]),
    "",
  );

  push("## ⛔ Blocked / decisions needed", "");
  for (const blocker of data.blockers) {
    const blocked = allItems.filter((i) => i.blockedBy?.includes(blocker.id));
    push(
      `### ${blocker.title}`,
      "",
      `- **Type:** ${KIND_LABEL[blocker.kind]}${blocker.ref ? ` · **Reference:** ${link(blocker.ref)}` : ""}`,
      `- ${blocker.detail}`,
      blocked.length
        ? `- **Blocks:** ${blocked.map((i) => `${STATUS_EMOJI[i.status]} ${i.title} (\`${i.id}\`)`).join("; ")}`
        : "- **Blocks:** no tracked items yet",
      "",
    );
  }
  const itemDeps = allItems.filter(
    (i) =>
      i.status !== "done" &&
      i.status !== "deferred" &&
      openDeps(i).some((ref) => byId.has(ref)),
  );
  if (itemDeps.length) {
    push("### Waiting on other roadmap items", "");
    for (const item of itemDeps) {
      const deps = openDeps(item).filter((ref) => byId.has(ref));
      push(
        `- ${STATUS_EMOJI[item.status]} ${item.title} (\`${item.id}\`) ← ${deps.map(refName).join(", ")}`,
      );
    }
    push("");
  }

  for (const milestone of [...v1, ...later]) {
    push(...renderMilestone(milestone, refName));
  }

  push(
    "---",
    "",
    "## How to update this file",
    "",
    `1. Edit ${link("docs/progress/roadmap.json")}: change an item's \`status\`, \`notes\`, \`evidence\` (repo paths or commit hashes) or \`blockedBy\` (blocker or item ids), and set \`updated\` to today's date.`,
    "2. Run `npm run progress` to regenerate this file.",
    "3. Commit both files. CI runs `npm run progress:check`, which fails when this file is out of date or the data is invalid (unknown ids, missing evidence paths).",
    "",
    "Only mark an item ✅ when code or docs in the repository prove it. UI previews with mock data stay 🔄 or ⏳.",
    "",
  );
  return lines.join("\n");
}

function renderMilestone(
  milestone: Milestone,
  refName: (ref: string) => string,
): string[] {
  const c = count(milestone.items);
  const scope = milestone.scope === "later" ? " _(post-V1)_" : "";
  return [
    `## ${milestone.id} — ${milestone.title}${scope}`,
    "",
    `${bar(percent(c), 20)} · ${c.done}/${c.total - c.deferred} done${c.deferred ? ` · ${c.deferred} deferred` : ""}`,
    "",
    `_${milestone.goal}_`,
    "",
    "| Status | Item | Notes | Evidence |",
    "| --- | --- | --- | --- |",
    ...milestone.items.map((item) => {
      const deps = (item.blockedBy ?? []).map(refName);
      const notes = [
        item.notes,
        deps.length ? `**Blocked by:** ${deps.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `| ${STATUS_EMOJI[item.status]} | ${cell(item.title)} (\`${item.id}\`) | ${cell(notes)} | ${evidence(item)} |`;
    }),
    "",
  ];
}

async function main() {
  const check = process.argv.includes("--check");
  const data = load();
  const markdown = await format(render(data), {
    parser: "markdown",
    filepath: outputPath,
  });
  if (check) {
    const current = existsSync(outputPath)
      ? readFileSync(outputPath, "utf8")
      : "";
    if (current !== markdown) {
      fail(
        "docs/MILESTONES.md is out of date. Run `npm run progress` and commit the result.",
      );
    }
    console.log("progress: docs/MILESTONES.md is up to date.");
    return;
  }
  writeFileSync(outputPath, markdown);
  const pct = percent(
    count(
      data.milestones.filter((m) => m.scope === "v1").flatMap((m) => m.items),
    ),
  );
  console.log(`progress: wrote docs/MILESTONES.md (V1 ${pct ?? 0}% done).`);
}

main().catch((error: unknown) => fail(String(error)));
