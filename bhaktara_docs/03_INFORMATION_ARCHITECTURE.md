# Information Architecture and Navigation

> Decisions: D-004, D-005, D-007, D-011, D-013, D-015, D-019, D-021, D-025, D-028, D-029, D-030.
> Tags: **[Decided]** · **[Rec default — adjustable]**

## 1. Bottom navigation [Decided: D-028]

| # | Tab | Purpose |
|---|---|---|
| 1 | **Home** | Daily dashboard, CMS-driven |
| 2 | **Explore** | Browse all content types, deities, collections, festivals |
| 3 | **Mandir** | Virtual Mandir |
| 4 | **Sadhana** | Daily practice, Challenges, League, History |
| 5 | **Profile** | Identity, progress, library, settings |

**Global elements**
- **Mini audio player:** sits above the bottom nav whenever audio is loaded, and persists across tabs.
- **Search:** entry point in the Home header and the Explore header.

## 2. Onboarding [Decided: D-029]

1. Splash screen. An anonymous session is created silently (doc 21).
2. Language choice: हिन्दी / English. This can be changed later in Settings.
3. Land on Home.

That is the whole onboarding. There is no sign-in wall and no deity or interest questions.

**Permissions are asked in context, not during onboarding [Rec default]**
- **Notifications (Android 13+ runtime permission):** asked after the first completed Sadhana task.
  - Suggested copy: "Roz Sadhana ki yaad dilayein?"
  - If the user agrees, they pick a reminder time (default 06:00).
- **Ringtone system-settings permission:** asked only when the user taps "Set as ringtone".

## 3. Home [Decided top position: D-030]

### Section order (default)

| # | Section | Admin-configurable? |
|---|---|---|
| 0 | Header: greeting, streak chip, search icon, notifications icon | Fixed |
| 1 | Hero banner carousel (internal targets only — D-015) | Fixed at top. Content is CMS-controlled. |
| 3 | Progress strip: streak, XP, level/rank | Orderable |
| 4 | Quick shortcuts (Bhajan, Aarti, Mantra, Chalisa, Wallpaper, Ringtone, Status, Mandir) | Orderable. Items are CMS-controlled. |
| 5 | Aaj ki Sadhana (progress + continue) | Orderable |
| 6 | Today's challenges | Orderable |
| 7 | League preview. Guests see a sign-in CTA instead (D-019). | Orderable |
| 8 | Upcoming festivals (D-034) | Orderable |
| 9+ | Content rails: Trending, collections, new releases, deity rails | Orderable, add/remove from CMS |
| — | Quote of the day | Orderable |

### Home rules
- The header and banner positions are fixed. Everything else can be reordered or hidden from the CMS Home manager.
- Section types come from a fixed whitelist. The CMS cannot inject arbitrary layouts or code.
- The home feed is precomputed per language (`getHomeFeed`). The client makes one read, plus per-user widgets (streak, Sadhana, challenges).
- Native ad slots appear between content rails (doc 11 §3). None in the first viewport by default. Configurable.

## 4. Explore

**Content tabs (V1 content types — D-004)**
- Bhajan
- Aarti
- Mantra
- Chalisa
- Wallpapers
- Ringtones
- Status

**Browse by**
- Deities (grid → deity page with all content types for that deity)
- Collections
- Festivals (list → festival detail)

**List behaviour**
- Paginated.
- Filter by deity and language.
- Sort: popular / new.
- Native ads every N items (default 8). N is configurable (doc 11).

## 5. Content detail (per type)

| Type | Primary action | Secondary actions |
|---|---|---|
| **Audio** (bhajan, aarti, mantra, chalisa) | Play (full player with background playback and lock-screen controls) | Favorite, share (link/card), related |
| **Wallpaper** | Full-screen preview | Set as wallpaper (home/lock/both), save to gallery — both behind a rewarded ad (D-038); favorite, share link |
| **Ringtone** | Preview play | Set as ringtone / notification / alarm, save — behind a rewarded ad (D-038); favorite |
| **Status video** | Play (9:16) | Share to WhatsApp (free — D-041), save to gallery (rewarded ad — D-038), favorite |

- No lyrics or text in V1 (D-011).
- There is no "report issue" control in V1 (D-014).

## 6. Mandir tab [Decided: D-007]

1. **First visit:** choose a deity from the active Mandir deities, managed in the CMS. This choice is stored as the user's Mandir deity and can be changed anytime.
2. **Mandir scene:**
   - Light diya (free)
   - Offer flowers (free)
   - Ring bell (tap to ring, with sound; free)
   - Play aarti (uses the global audio player)
   - **Special offerings tray (D-040):** ornaments, special flowers, festival items. Tapping one offers "Ad dekhkar arpit karein". One ad unlocks one use.
3. **Daily visit:** lighting the diya counts as the daily visit (5 XP once per day, doc 10).
4. **Change deity:** switcher in the top bar.

Design note: calm, restrained motion. Only a bottom-edge banner is allowed, outside the offering tray (D-037, C-001).

## 7. Sadhana tab [Decided: D-025, D-028]

**Top segments:** Aaj · Challenges · League · History

**Aaj**
- Today's plan with three task types: jaap, meditation, prayer checklist.
- Each task shows its completion state.
- "Full Sadhana" bonus progress.

**Jaap screen**
- Deity/mantra choice
- Large tap counter
- Mala progress (108)
- Optional haptic feedback
- Optional background mantra audio

**Meditation screen**
- Timer presets (5 / 10 / 15 / 20 min)
- Optional ambient audio
- Completes a server session (doc 10 §9)

**Challenges**
- Daily and weekly challenges, with progress.
- Completed list.

**League**
- Current cohort board, tier, time left, promotion/relegation zones, history.
- Guests see a preview + sign-in CTA (D-019).

**History**
- Calendar heatmap of qualifying days
- Streak stats
- Past Sadhana

## 8. Profile

**Header**
- Avatar, display name (editable — D-042), rank + level, XP, current and longest streak
- Guests see "Guest" plus a soft sign-in banner (D-021)

**Sections**
- Badges
- Stats
- League history
- Favorites
- Saved media (items saved to device)

**Settings**
- Language
- Notifications and reminder time
- Account: sign in/out, delete account
- Privacy
- About/Credits, including the AI disclosure (D-013)
- Privacy policy and terms

**Not shown in V1**
- Subscription entry point (post-V1)

## 9. Deep-link conventions

Stable route identifiers:
- `content/{type}/{id}`
- `deity/{id}`
- `collection/{id}`
- `festival/{id}`
- `challenge/{id}`
- `mandir` / `mandir/{deityId}`
- `sadhana` · `sadhana/jaap` · `sadhana/meditation`
- `league`

Removed from V1: `scripture/{id}`.

Banners and notifications resolve targets through a validated target service. Unknown or invalid targets fall back to Home. They never cause a crash or open an arbitrary URL.

## 10. Guest vs signed-in differences

| Area | Guest | Signed-in |
|---|---|---|
| Content, Mandir, Sadhana, XP, streak, challenges, badges, favorites | Yes | Yes |
| League | Preview + CTA only | Yes |
| Cross-device sync | No (device-bound) | Yes |
