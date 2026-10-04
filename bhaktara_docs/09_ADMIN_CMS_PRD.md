# Admin CMS / Operations Panel PRD

> Operator model: single operator (D-001). Hosted on Firebase Hosting. Authorization uses custom claims (doc 07).
> The CMS is designed to make one person fast and safe: checklists, bulk operations, scheduling, previews.

## 1. Modules (V1)

| Module | Purpose |
|---|---|
| Dashboard | Health and KPIs |
| Content | CRUD, upload, checklist, workflow |
| Import | Bulk import from manifest (doc 18 §3) |
| Home | Section order and visibility per language, shortcuts |
| Banners | Hero carousel |
| Collections | Editorial collections |
| Deities & Categories | Taxonomy, Mandir-enabled deities |
| Mandir Offerings | Free and rewarded special offerings (D-040) |
| Festivals | Manual dates (D-034) |
| Challenges | Daily/weekly templates and schedule |
| Badges & Frames | Definitions |
| Gamification Config | XP table, caps, level curve, league rules (versioned) |
| Sadhana Config | Default daily plan (jaap target, meditation minutes, prayer checklist items) |
| Notifications | Campaigns, schedule, stats |
| Ads | Placements, rewarded gates, kill switches |
| Users | Lookup, stats, flags, display-name moderation |
| License Records | AI tool/plan license evidence (doc 12 §4) |
| Audit Log | Read-only history |
| Settings | App config, admin roles |

## 2. Dashboard

**Metrics**
- DAU, WAU, new users (guest vs signed-in), D1/D7/D30
- Sadhana completion, active streaks
- Content plays, saves, shares
- Rewarded ad starts/completes, estimated ad revenue
- League participation

**Operator alerts**
- Items stuck in READY
- Scheduled content for the next 7 days, highlighting empty days
- Festivals in the next 45 days without a linked collection
- Challenges queue shorter than 14 days
- Zero-result searches (top 20)
- Flagged users
- Crash-free rate (link to Crashlytics)

## 3. Content manager

**Workflow (D-036):** `DRAFT → READY → SCHEDULED → PUBLISHED → ARCHIVED`
- DRAFT → READY is blocked until every applicable checklist item (doc 12 §5) is ticked and required fields are complete.
- PUBLISHED → DRAFT is allowed, to unpublish for a fix.

**Fields**
- type
- title {hi,en}
- description {hi,en}
- audio language
- deities, categories, tags (with a transliteration helper that suggests common spellings)
- media upload per variant slot
- featured
- saveGate (REWARDED/FREE)
- shareable, ad-eligible
- schedule and expiry

**Private panel (stored in `contentPrivate`)**
- source text (Devanagari), source reference
- AI tool / plan / license record
- checklist

**Preview**
- Card preview, detail preview and audio playback in the CMS before publishing.

**List view**
- Filter by status/type/deity.
- Bulk actions: schedule, archive, change collection.

## 4. Import

- Upload a manifest (CSV/JSON) plus assets (or point to already-processed variants).
- Dry run showing per-row validation errors.
- Idempotent through `importKey`.
- Imported items land in DRAFT, or READY if every checklist column is true.

## 5. Upload

- Drag/drop with progress.
- Direct-to-R2 via a presigned URL, then `processMedia` (doc 22 A4).
- Validation: type, size, duration, dimensions.
- Replacing an asset creates new immutable keys. The old keys are cleaned up after 30 days.

## 6. Home manager

- Per language: reorder and hide sections from the whitelist (doc 06 §3).
- The banner section is fixed at the top (D-030).
- Rails: choose the source (collection / content type + sort) and the item limit.
- Live preview on a phone frame.
- Publishing triggers `buildHomeFeed`.

## 7. Banner manager

- Image, title/subtitle/CTA {hi,en}.
- Internal target picker restricted to the route whitelist (D-015). There is no free-text URL.
- Active window, priority, languages, preview, enable/disable.

## 8. Mandir offerings

- Create an offering: name, kind, art assets, deities (or all), unlock FREE / REWARDED_SINGLE_USE, optional availability window (festival specials), sort order.

## 9. Festivals

- Manual date entry (with an optional end date).
- Description, image, deities, linked collection, featured flag, publish.
- **Recommended practice:** enter the next 12 months at launch and verify each date against a published calendar before publishing.

## 10. Challenges

- Templates: metric, target, filters, XP, badge, audience.
- Schedule by date range.
- "Clone for next week" action.
- Calendar view showing gaps.

## 11. Gamification and Sadhana config

- Edit values with validation (e.g., the cap must be at least the maximum single award).
- Every save creates a new version, with an audit log entry and a rollback option.

## 12. Notifications

- Compose {hi,en}, internal target (whitelist), image, audience (all / language / signed-in / guests / inactive N days / streak ≥ N).
- Schedule and preview.
- Delivery stats.
- The system enforces the per-user daily cap (D-043) and quiet hours. The operator is told how many users will actually be reached.

## 13. Ads

- Placement table (doc 11 §5).
- Excluded-zone flags are visible and cannot be removed for the jaap and Mandir screens (C-001).
- Rewarded gates on/off.
- Kill switches mirror Remote Config.

## 14. Users

- Search by UID, email or display name.
- View stats, days, badges and league history.
- Flags.
- Reset an inappropriate display name.
- **Never show:** auth credentials or tokens.

## 15. Roles

| Role | Can do |
|---|---|
| SUPER_ADMIN | Everything |
| CONTENT_ADMIN | Content, publishing, home, banners, festivals, challenges, notifications |
| EDITOR | Draft/edit content, upload, move to READY |
| MODERATOR | Users and display-name moderation |
| ANALYST | Read-only dashboard |

At launch, the operator holds SUPER_ADMIN.

## 16. Audit logs

Every admin mutation records: `adminUid`, `action`, `entity`, `entityId`, before/after summary, timestamp.
