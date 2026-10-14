# Bhaktara — Product Decision Log

This log records product decisions made by the product owner. When a decision here conflicts with another document, this log wins until that document is updated.

Format: ID · Decision · Date · Affects

## Round 1 — Launch and team (2026-09-22)

- **D-001 · Content team.** All content is created and reviewed by the product owner alone, using AI tools. There is no separate editor or Hindi/Sanskrit reviewer at launch. · Affects: 09, 12, 18
- **D-002 · First public release.** The first Play Store release includes the content app, the habit layer (Sadhana, XP, streak, challenges) and in-app ads. It replaces the old Phase 1 / Phase 2 / Phase 5 split. · Affects: 02, 16, CLAUDE.md
- **D-003 · Ads from launch.** In-app ads are enabled at launch, limited to native and banner formats. · Affects: 11, 16

## Round 2 — V1 scope (2026-09-22)

- **D-004 · V1 content types.** V1 ships with:
  - Bhakti audio: bhajan, aarti, mantra, chalisa
  - Wallpapers
  - Devotional ringtones
  - Status videos

  Scriptures, stories and the Gita are NOT in V1. · Affects: 01, 02, 03, 06, 18
- **D-005 · V1 utilities.** V1 includes a lean "Aaj ka Panchang" card and a festival list. Full Panchang, Rashifal, Vrat and Muhurat are post-V1. · Affects: 01, 02, 03, 16
- **D-006 · V1 competition.** Full weekly leagues ship in V1, including promotion and relegation. · Affects: 02, 10, 16
- **D-007 · Virtual Mandir.** Ships in V1 in a simple form: choose deity, light diya, offer flowers, ring bell, play aarti audio. · Affects: 02, 03, 16
- **D-008 · Name ringtones.** Name ringtones move to V1.x, not V1. · Affects: 01, 02, 16
- **D-009 · Platform (revised 2026-09-22).** Android-first. V1 ships on Android only. An iOS version is planned for later, after the Android app is successful and generating revenue. React Native was chosen for this reason. The codebase must stay iOS-ready from day 1: no Android-only architecture, and all platform-specific features must sit behind platform abstractions (doc 05 §Platform strategy). No iOS build, testing or App Store work is required before the iOS phase. · Affects: CLAUDE.md, 01, 02, 05, 14, 15, 16, 20, 21

## Round 3 — Content model (2026-09-22)

- **D-010 · Audio source.** All vocals are AI-generated, including mantra, chalisa and aarti. · Affects: 12, 17, 18
- **D-011 · Lyrics.** No lyrics or text are shown with audio in V1. · Affects: 03, 06, 09
- **D-012 · Long videos.** There are no long devotional videos in V1. Status videos are the only video content. · Affects: 02, 05, 06
- **D-013 · AI disclosure.** AI-generated vocals are mentioned only on the About/Credits page. There are no per-item labels. · Affects: 03, 12
- **D-014 · Report issue.** There is no user-facing "report issue" button in V1. · Affects: 03, 09
- **D-015 · Banner targets.** V1 banners support INTERNAL targets only. The YOUTUBE target type is removed from V1. It may return with long videos later. · Affects: 01, 03, 05, 06, 09

## Round 4 — Auth, guest, catalog (2026-09-22)

- **D-016 · Guest capabilities.** Guests can use every V1 feature, including Sadhana, XP, streak and challenges. When a guest signs in, their progress is kept. This requires Firebase Anonymous Auth, so every guest has a real UID. · Affects: 05, 06, 07, 08
- **D-017 · Account collision.** If a guest signs in with a Google account that already has Bhaktara data, the guest's progress is merged into that existing account. · Affects: 07, 08, 15
- **D-018 · Launch catalog.** The launch catalog uses the full targets from the original seeding plan (100+ bhajans, 200+ wallpapers, 100+ ringtones, 100+ status videos, etc.), limited to V1 content types. · Affects: 12, 16, 18
- **D-019 · Leagues require sign-in.** Guests are not placed in leagues. They see a league preview that invites them to sign in. · Affects: 03, 10, 21
- **D-020 · Merge rules.** When guest progress is merged into an existing account:
  - XP is added (deduplicated through the reward ledger)
  - current streak = max of the two accounts
  - longest streak = max of the two accounts
  - badges, favorites and Sadhana history are combined (union)
  - league placement is taken from the existing account

  · Affects: 08, 15, 21
- **D-021 · Sign-in prompts.** Sign-in is never forced. The app uses soft, dismissible reminders only. Leagues remain gated by sign-in (D-019). · Affects: 03, 21

## Round 5 — Gamification (2026-09-22)

- **D-022 · Leagues live from day 1** (resolves P-01). Leagues are active from launch. Cohort sizing rules for a small user base are defined in doc 10. · Affects: 10, 16
- **D-023 · Single currency.** XP is the only currency. Punya Points are removed from the product, schema, rewards, CMS and analytics. · Affects: 01, 06, 08, 09, 10, 13, 21
- **D-024 · Streak day boundary.** The streak day rolls over at 04:00 in the user's local time. · Affects: 06, 08, 10, 14, 15
- **D-025 · Sadhana tasks** (resolves P-02). The reading task is removed and replaced by the meditation task. V1 Sadhana task types are jaap, meditation and prayer checklist. · Affects: 01, 02, 03, 10
- **D-026 · Streak qualifying activity.** Any ONE of the following on a given day counts toward the streak:
  - a completed Sadhana task
  - a completed daily challenge
  - one completed jaap mala (108)

  · Affects: 08, 10, 15
- **D-027 · Rank names.** The ranks are Jigyasu → Sadhak → Bhakt → Ananya Bhakt → Param Bhakt. "Super Bhakt" is renamed to Param Bhakt. · Affects: CLAUDE.md, handoff, 10

## Round 6 — IA, Home, onboarding (2026-09-22)

- **D-028 · Bottom navigation.** The tabs are Home · Explore · Mandir · Sadhana · Profile. Challenges and League live inside the Sadhana tab. · Affects: 03, 04, CLAUDE.md
- **D-029 · Onboarding.** Onboarding asks for language only (Hindi/English). The Ishta Devta is picked on the first Mandir visit, not during onboarding. · Affects: 03, 13
- **D-030 · Home top.** The banner carousel is the first section on Home, directly below the header. · Affects: 03, 09

## Round 7 — Media, search, Panchang (2026-09-22)

- **D-031 · Media hosting.** All public media (audio, images, status videos) is hosted on Cloudflare R2 behind the Cloudflare CDN. Firestore stores asset keys, not full URLs. · Affects: 05, 06, 07, 09, 22
- **D-032 · Search.** Search uses Firestore keyword arrays (`searchTokens`) generated server-side on publish. · Affects: 05, 06, 08, 22
- **D-033 · Panchang out of V1.** The "Aaj ka Panchang" card is removed from V1 and moves to the post-V1 backlog. This supersedes part of D-005. Whether the festival list stays in V1 is pending P-07. · Affects: 02, 03, 16

## Round 8a — Pending closures (2026-09-22)

- **D-034 · Festival list in V1** (resolves P-07). The festival list and festival detail stay in V1. Festival dates are entered manually in the CMS by the operator. There is no calculation engine. · Affects: 02, 03, 09, 16
- **D-035 · Search is Firestore-only** (resolves P-06). Search uses Firestore `searchTokens` only. The on-device index proposal is rejected for V1. · Affects: 22
- **D-036 · CMS workflow** (resolves P-03). The content states are DRAFT → READY → SCHEDULED → PUBLISHED → ARCHIVED. READY requires the doc 12 §5 checklist to be complete. · Affects: 06, 09, 12

## Round 8b — Ads and privacy (2026-09-22)

- **D-037 · Native ads on all screens.** Native ads may appear on any screen, including Mandir, Sadhana and the audio player. Interstitials remain excluded from V1 (D-003). Ad-policy placement constraints still apply (see P-08). · Affects: 03, 04, 11, CLAUDE.md, 01
- **D-038 · Rewarded ads for saves.** A rewarded ad unlocks saving a wallpaper, ringtone or status video. · Affects: 03, 11, 13
- **D-039 · League names always shown.** Display names are always shown on league boards, with no hide option (resolves P-05). · Affects: 10, 21

## Round 8c (2026-09-22)

- **D-040 · Mandir special offerings via rewarded ad.** The Mandir has a "special offerings" set (ornaments, special flowers, etc.). The user watches one rewarded ad to use one special offering once. Basic diya, flowers and bell always stay free. · Affects: 02, 03, 06, 09, 11, 13
- **D-041 · Rewarded gate scope** (resolves P-09). Saving to the device (wallpaper, ringtone, status) requires a rewarded ad. Sharing a status to WhatsApp is free and not gated. · Affects: 03, 11
- **D-042 · League display name** (resolves P-10). Leagues show an editable display name. The default is first name + last initial from the Google profile. Users can edit it anytime, subject to a profanity filter and length limits. · Affects: 10, 21, 06
- **C-001 · Compliance rule (not a product preference).** Native ads must not be placed adjacent to or overlapping repeated-tap targets: the jaap counter and the Mandir diya, flowers and bell. This follows ad-network accidental-click policy. D-037 still applies everywhere else. The product owner may raise objections, but a placement that violates network policy cannot ship. · Affects: 04, 11

## Round 8d (2026-09-22)

- **D-043 · Notification cap.** A user receives at most 2 push notifications per day. · Affects: 14
- **D-044 · Ad networks.** V1 uses AdMob with Meta Audience Network through AdMob mediation (bidding). · Affects: 11
- **D-045 · Stotra.** Stotra is not in V1. It moves to the post-V1 backlog. · Affects: 02, 03, 06, 18

## Round 9 — Dev tooling (2026-09-22)

- **D-046 · MCP servers.** The project uses three MCP servers with Claude Code:
  - **Stitch MCP:** UI design source
  - **Firebase MCP:** Firebase project operations
  - **Cloudflare MCP:** R2/CDN/DNS operations

  Usage rules and guardrails are in doc 23. · Affects: CLAUDE.md, handoff, 04, 05, 23

## Round 10 — Media infrastructure (2026-10-04)

- **D-047 · Dev media endpoint.** The dev bucket `bhaktara-media-dev` (APAC location hint) serves public reads through its rate-limited r2.dev address until a Bhaktara domain is bought. A Bhaktara-owned domain (`media.<domain>`) is required before the first public release, because shipped builds embed the media base URL. · Affects: 22, 23

## Round 11 — Firebase SDK (2026-10-05)

- **D-048 · Native Firebase SDK.** Android/iOS use React Native Firebase for Auth, Firestore, Analytics, Crashlytics, Remote Config and App Check (native offline cache, App Check on every request). The web preview and Node emulator tests keep the Firebase JavaScript SDK. The Firestore repository receives the SDK's modular API, so its query logic is shared and tested in both. Analytics and Crashlytics collection stays disabled in `firebase.json` until the privacy policy and consent flow ship (M4). · Affects: 05, 07, 13, 15

## Round 12 — Elder-friendly system permissions (2026-10-05)

- **D-049 · Guided ringtone permission.** Setting a ringtone needs Android's "Modify system settings" special access, which is granted only on the system Settings screen and never by an in-app dialog. Bhaktara first explains the step in large type with an animated switch, then shrinks into a picture-in-picture guide ("Turn ON the switch") over that screen, watches the permission natively and returns to full screen by itself to set the sound. Without picture-in-picture it opens the screen and continues on return. Picture-in-picture is used only for this guide; status videos never enter it. · Affects: 03, 05, 15

## Round 13 — Habit layer (2026-10-05)

- **D-050 · Earning needs a connection.** Practice (jaap, meditation, prayer) always works, also offline, but XP, streaks, challenges and badges are earned only when the server records the practice: a jaap or meditation session must be started online so the server knows when it began. Offline practice is kept on the device and is never credited later. The app says so in plain words ("इस बार अंक नहीं मिलेंगे"). · Affects: 08, 10, 15
- **D-051 · Jaap count per practice day.** The bead count starts again at 04:00 (D-024); beads left over from yesterday do not count toward today's mala. Malas already completed stay in the history. · Affects: 03, 10
- **D-052 · Devotional practice screens.** Sadhana practice uses devotional metaphors instead of generic cards: a 108-bead mala with sumeru and the deity's mantra and traditional mala (jaap), a lamp with a breathing halo (meditation), a puja thali filled step by step with an aarti lamp (prayer), the streak as an akhand jyoti, today's tasks as three lamps and the history as a lamp calendar. Large type, Hindi first, one step at a time. The doc 10 numeric defaults are adopted as the initial `appConfig/gamification` values. · Affects: 03, 04, 10

## Round 14 — Prayer as puja (2026-10-06)

- **D-053 · Prayer is a short puja before the chosen deity.** The daily prayer task (D-025) is performed before the user's Ishta devta in a small mandir, not on an empty plate. Steps follow panchopachar order: पुष्प → धूप → दीप → नैवेद्य → आरती → प्रणाम. Each shows the traditional Sanskrit line and its plain Hindi meaning; offerings appear on the altar. The aarti is performed by circling the thali round the deity with a finger, three rounds with a bell each (an "अपने आप आरती करें" button does it for those who cannot drag). The puja ends with the kshama prarthana and a pranam, which records the prayer. The deity is the one chosen for jaap/Mandir and can be changed before starting. The steps live in `appConfig/sadhana.prayerItems` (`kind`, `line`, `label`). The puja can be performed again at any time the same day; XP and the task are credited once per practice day, and a repeat ends quietly ("पूजा संपन्न। आज के अंक पहले ही मिल चुके हैं।") without a blessing sheet. This replaces the gratitude/intention/reflection checklist. · Affects: 03, 06, 10

## Round 15 — Puja tray (2026-10-06)

- **D-054 · Puja from a tray of offerings, no text.** The prayer puja (D-053) is performed by tapping animated items on a brass tray under the temple, in traditional order: कलश जल → घंटी → चंदन-रोली तिलक → पुष्प/माला → धूप → नैवेद्य → दीप (आरती) → शंख. The next item glows; every item works at any time. Flowers, garland and bhog come from drawers that offer only what suits the deity (Shiva: bilva, dhatura, aak, kaner, rudraksha mala, milk/panchamrit; Ganesha: durva, hibiscus, modak; Krishna: tulsi, lotus, makhan-mishri with a tulsi leaf; and so on), and never what is forbidden (ketaki/tulsi to Shiva, tulsi to Ganesha, durva to the Devi). The dhoop and the diya follow the finger freely; if nobody moves them they circle the deity by themselves. The deity's aarti from the catalog plays during the lamp. The day's prayer is recorded once flowers, dhoop, bhog, aarti and shankh are done (kalash, bell, tilak and garland are optional). The screen shows no instructions; names exist for screen readers. 2.5D: React Native Skia draws the lamp's light on the deity, incense smoke and kalash water; the temple turns slightly with the phone's tilt (Reanimated gravity sensor). · Affects: 03, 04, 06, 10

## Round 16 — Admin panel v2 (2026-10-06)

- **D-055 · Admin panel v2.** The operator panel is rebuilt on shadcn/ui and Tailwind in the Bhaktara theme (cream and saffron by day, maroon and brass by night) with a collapsible sidebar that becomes a hamburger menu on phones, a ⌘K page search and a light/dark switch. Beyond the M1 screens (content, banners, Home manager, audit) it adds a dashboard, a media library with an asset picker, catalogue managers (deities, categories, collections, challenges, badges, festivals, Mandir offerings), versioned editors for `appConfig/gamification`, `appConfig/sadhana` and the new `appConfig/puja` (every save is a version that can be restored; stale saves are refused), a users section and a staff roles page. Reads use staff rules; every write goes through an audited callable. Moderators search, view, flag, annotate and reset display names; only SUPER_ADMIN disables or deletes accounts, never their own or another staff account. Deleting removes the profile, practice history, stats and challenges and the sign-in account, and keeps reward ledger lines without the user (`uid: deleted-user`). Deities and categories are deactivated, never deleted, and a deity cannot be active without its Mandir art. · Affects: 06, 09, 10

## Round 17 — Bulk upload (2026-10-06)

- **D-056 · Upload from files, fill in later.** Content managers upload one file, many files, a folder or a ZIP per category in the admin panel; every file becomes a DRAFT with its media rendered, and titles come from the file names (English; Hindi and the rest are added later). Audio needs no cover up front: an image with the same name is used, else album art embedded in the file, else the cover is added later. Media on a draft is replaced by uploading only what changes. The browser checks wallpaper size and ringtone/status length before anything is created, and the panel first confirms uploads are configured, so failed uploads never leave empty drafts. No AI fills metadata. · Affects: 09, 12, 22

## Round 18 — Prayer and Jaap visuals (2026-10-07)

- **D-057 · A sunlit shrine for Prayer, Jaap and Meditation, with images from the admin panel.** The Prayer, Jaap and Meditation screens move from the dusk sanctum to a light parchment-and-marble design: a marigold toran, round back and settings buttons around a centred maroon serif title, gold lotus dividers, a cream marble temple with a green sanctum, and the offering tray as eight labelled tiles (Kalash, Bell, Tilak, Flowers, Incense, Prasad, Diya, Shankh) under "Choose an offering", offered items saffron with a tick, and a "Reset offerings" link. This replaces the no-text tray of D-054; the order, drawers and recording rules of D-054 stay. Jaap shows the deity's emblem (Krishna's flute…), the full mantra (the Maha-mantra for Krishna), a polished wooden mala whose chanted beads turn gold, the count with "Tap to count", sound and vibration switches (saved on the device) and "Restart mala". Meditation follows: a brass diya in a gold ring that fills with the sitting over a faint mandala, the time in maroon serif ("remaining of 5 minutes"), a breathing orb with "Breathe in…/out…", a saffron Pause button, an "End meditation" link and a temple-bells sound switch. Images are optional and chosen in the admin panel from the asset library: `appConfig/visuals` (versioned like the other configs, readable by the app) holds the Prayer, Jaap and Meditation backgrounds, the meditation lamp, the toran, the divider and an image per tray item, flower, garland and bhog; each deity can carry `shrineArt` (the temple painted with the deity, replacing the drawn temple) and `jaapEmblem`. New asset purposes: temple, background, decor. Any empty slot, unconfigured CDN or failed image falls back to the app's own drawing. · Affects: 04, 06, 09

## Round 19 — One temple: the Mandir tab (2026-10-14)

- **D-058 · The puja moves into the Mandir tab; lighting the diya is the daily Mandir visit.** The Prayer screen (the puja tray of D-053/D-054/D-057) leaves Sadhana and becomes part of the Mandir tab, which is now the app's one temple screen: the chosen deity in its temple, the tray, the diya, flowers, bell, aarti and the special offerings. Sadhana's third task (prayer) opens the Mandir tab and is still completed by the puja, exactly as before (`completePrayerChecklist`, once per practice day). Lighting the diya is the daily Mandir visit (doc 10 §2): the callable `recordMandirVisit` pays 5 XP once per practice day (ledger `rewardTransactions/{uid}_MANDIR_VISIT_{day}`, under the daily cap), increments `userStats.counters.mandirVisits` (badges "7 Mandir visits" and "30 Mandir visits"), sets `users/{uid}/days/{day}.mandirVisited` and advances `MANDIR_VISITS` challenges; lighting it again the same day changes nothing. Following doc 10 §3, a Mandir visit alone is not a qualifying streak activity (only a completed Sadhana task, a completed daily challenge or one mala are); a daily `MANDIR_VISITS` challenge it completes does qualify the day. Special offerings (D-040: garlands, mukut, haar, chhatra, mor pankh, special diyas, bhog, festival thali) are `REWARDED_SINGLE_USE` Mandir offerings of kind garland, ornament, diya, bhog or other, some for one deity only (`deityIds`), and carry `offerAt` — head, neck, above, feet or altar — saying where they appear on the murti or the altar; the admin panel sets it with a preview on the deity's murti. · Affects: 03, 06, 08, 09, 10

## Pending / resolved items

- ~~P-01~~ Resolved by D-022.
- ~~P-02~~ Resolved by D-025.
- ~~P-03~~ Resolved by D-036.
- ~~P-04~~ Resolved in schema v2: the `contentPrivate` and `licenseRecords` collections (doc 06).
- ~~P-05~~ Resolved by D-039. Original question: Leaderboard privacy. Decide whether a user's display name is shown on the league board by default, and whether it can be hidden. (Round 8)
- ~~P-06~~ Resolved by D-035 (rejected). Original proposal: instead of (or in addition to) Firestore keyword arrays, publish a compact search index JSON to the CDN and search on-device. This is free, typo-tolerant and works offline for a catalog of this size. (Round 8)
- ~~P-07~~ Resolved by D-034. Original question: Confirm whether the festival list stays in V1 now that the Panchang card is out. If it stays, dates are entered manually in the CMS. (Round 8)
- ~~P-08~~ Resolved (see Round 8c). Original: Ad exclusion zones for policy compliance.** Keep ads away from the jaap tap counter and the Mandir tap targets (diya, flowers, bell) to avoid accidental-click violations. (Round 8c)
- ~~P-09~~ Resolved (see Round 8c). Original: Scope of the rewarded gate.** Decide whether sharing a status to WhatsApp is also gated, and whether some saves per day are free. (Round 8c)
- ~~P-10~~ Resolved (see Round 8c). Original: League display name source.** Decide whether the league name is the full Google name or an editable display name (default: first name + initial). (Round 8c)
- **P-12 · North-star metric.** Confirm the primary KPI (candidate: % of DAU with a qualifying streak activity).
- **P-11 · Canonical deity list.** Confirm the final V1 deity list in doc 18 §4, including whether Sai Baba is included.
