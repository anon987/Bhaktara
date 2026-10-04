# Initial Content and Data Seeding Plan

> Launch catalog size follows D-018 (full targets). Only V1 content types are included (D-004).
> Everything here is produced by a single operator with AI tools (D-001, D-010). Every item must pass the checklist in `12_CONTENT_OPERATIONS.md` §5.

## 1. V1 launch catalog targets

| Type | Target | Est. avg length | Notes |
|---|---|---|---|
| Bhajan | 100+ | ~5 min | |
| Aarti | 30+ | ~4 min | Requires source text (§3 of doc 12) |
| Mantra | 50+ | ~3–10 min (loops) | Requires source text |
| Chalisa | 30+ | ~10 min | Requires source text |
| Wallpapers | 200+ | — | Across at least 14 deities |
| Devotional ringtones | 100+ | 20–30 s | |
| Status videos | 100+ | 15–30 s | 9:16 |
| Deity profiles | 20+ | — | Also used by Virtual Mandir (subset) |
| Festivals | Next 12 months | — | With verified dates |
| Challenges | 8 weeks' worth | — | Daily and weekly templates |
| Badges | Full V1 set | — | Defined in `10_GAMIFICATION_SPEC.md` |

Removed from V1: stories, scripture lessons (D-004), Stotra (D-045).

Also seed:
- Mandir art for each Mandir-enabled deity
- Free offerings (diya, flowers, bell)
- 10–20 special offerings (D-040)

## 2. Effort reality check (single operator)

These are rough estimates for planning, not commitments.

**QA listen-through alone**
- About 100 × 5 min + 30 × 4 + 50 × 5 + 30 × 10
- ≈ 18–20 hours of pure listening, before any regeneration of failed takes.
- Sacred-text items will often need more than one generation attempt.

**Visuals**
- 200 wallpapers + 100 status videos + about 100 ringtones.
- Each needs generation, selection, checklist and metadata.

**Consequence:** content production must start in parallel with M0 (foundation). It cannot wait for the CMS to be ready.

Until the CMS exists:
- Keep assets in a structured local folder.
- Track each item in a manifest (spreadsheet or CSV) with every metadata field, the source-text reference and the AI tool record.

## 3. Import method

Seed only through scripts or controlled admin imports. Never create records manually through the mobile client.

**V1 requirement:** a seed/import script that reads the manifest (CSV/JSON) plus the asset folder and then:
1. validates required metadata and checklist flags
2. uploads originals to the media pipeline so renditions are generated
3. creates content documents
4. reports failures per row

The script is idempotent: re-running it updates existing items instead of duplicating them. It uses a stable `importKey` per row.

## 4. Deity taxonomy

Canonical deity IDs (one ID per deity, with localized names; no duplicates such as "Ram" and "Rama"):
- `shiva`, `parvati`, `ganesha`, `kartikeya`
- `vishnu`, `lakshmi`, `rama`, `sita`, `hanuman`
- `krishna`, `radha`
- `durga`, `kali`, `saraswati`
- `surya`, `shani`, `sai_baba`

The final list is pending confirmation (P-11).

Aliases and transliterations live in the deity's `localizedNames` / search tags, not as separate deities.

## 5. Launch collections

Morning Bhakti · Evening Aarti · Shiva Special · Krishna Special · Hanuman Special · Devi Special · Beginner's Mantra · Daily Sadhana · Wallpapers · Devotional Status

## 6. Localization

**V1**
- UI in Hindi and English
- Content metadata (titles, descriptions) in Hindi and English

**Later**
- Bengali, Marathi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Punjabi

The schema uses localized maps (e.g. `title.hi`, `title.en`) so new languages can be added without migration. This will be finalized in the schema round.
