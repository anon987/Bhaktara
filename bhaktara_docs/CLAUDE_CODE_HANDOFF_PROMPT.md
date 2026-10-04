# Claude Code Handoff Prompt — Bhaktara

You are taking over development of **Bhaktara**, a React Native Android-first Sanatan/Bhakti super-app.

I am providing you with a complete Markdown documentation pack. **Read all of the `.md` files before making major implementation decisions.** These documents are the source of truth for the product, architecture, UX, Firebase schema/security, CMS, gamification, monetization, analytics, notifications, testing, and roadmap.

## Product

**Brand:** Bhaktara

Bhaktara is an **Android-first** React Native devotional app. V1 ships on Android. iOS comes later, so keep the code iOS-ready (doc 05 "Platform strategy"). **V1** contains:
- bhajan, aarti, mantra and chalisa audio (no lyrics)
- wallpapers, devotional ringtones and status videos
- daily Sadhana: jaap, meditation, prayer checklist
- a Virtual Mandir with free offerings plus rewarded-ad special offerings
- a festival list
- progression: XP, levels/ranks, streak, daily/weekly challenges, badges, weekly leagues
- a single-operator admin CMS

**Not in V1:** scriptures/stories/Gita, Stotra, lyrics, long videos/YouTube, Panchang/Rashifal, name ringtones (V1.x), iOS release (later; code stays iOS-ready), subscription, community.

## Important product decisions (full list: `00_DECISION_LOG.md`)

1. **Brand is Bhaktara.** Do not use any previous working name.
2. **Stack:** React Native + TypeScript, Android-first, iOS-ready. Firebase (Auth, Firestore, Functions, FCM, Analytics, Crashlytics, App Check, Remote Config, Hosting). Cloud Run for media processing. Cloudflare R2 + CDN for media.
3. **Auth:** anonymous guest on first launch, plus Google Sign-In. Guests get every feature except leagues. On sign-in the account is linked, or merged on collision (doc 21). Phone auth later, via linking with the same UID. Never force sign-in.
4. **XP is the only currency.** Ranks are Jigyasu → Sadhak → Bhakt → Ananya Bhakt → Param Bhakt, and are app progression only, never a judgment of spirituality.
5. **Streak day starts at 04:00 local.** Qualifying activity is any one Sadhana task, daily challenge or jaap mala.
6. **Leagues are live from day 1**, signed-in users only, with small-cohort-safe rules (doc 10).
7. **Home is CMS-driven.** The banner carousel is at the top. Banners use internal whitelisted routes only.
8. **Monetization:** AdMob + Meta AN mediation. Native ads on any screen, banner ads, rewarded ads for saving wallpaper/ringtone/status and for Mandir special offerings. WhatsApp status share is free. No interstitials. Never place ads in repeated-tap zones (C-001).
9. **No user-facing AI generation.** The product owner produces all content with AI tools. Sacred-text audio must have stored source text and pass the checklist (doc 12).
10. **Subscription** entitlement structure exists from V1, with no paywall.
11. **Tooling:** use Stitch MCP (design), Firebase MCP and Cloudflare MCP under the guardrails in `23_DEV_TOOLING_AND_MCP.md`:
    - dev by default
    - confirm before any prod or destructive action
    - Stitch output is a visual reference, not RN code

## How I want you to work

Before writing code:

1. Inspect the existing repository and understand its current state.
2. Read `CLAUDE.md`, then `00_DECISION_LOG.md`, then `02_PRODUCT_SCOPE.md`.
3. Read the relevant specification documents, and for major work read the entire documentation pack.
4. Identify what has already been implemented before creating new architecture.
5. Follow milestones M0 → M5 in `16_RELEASE_ROADMAP.md`. Do not build out-of-scope features.
6. Do not invent Firestore collections, fields, APIs, routes or business rules that contradict the documentation.
7. If a **technical** detail is unspecified, choose a sensible scalable approach and document it. If a **product** behavior is unspecified, propose options and ask. Check the Pending list in the decision log first.

During implementation:

- Use TypeScript strict mode.
- Prefer feature-based architecture.
- Keep Firebase access behind repositories/services.
- Keep navigation routes centralized.
- Keep authoritative XP, rewards, leaderboard calculations and premium entitlements server-controlled.
- Never expose Firebase Admin credentials in the client.
- Add loading, empty, error, retry and offline states to data-driven screens.
- Use pagination and lazy loading for large content collections.
- Use thumbnails/optimized media rather than unnecessarily loading original assets.
- Centralize analytics events.
- Write tests for important business rules.

After each meaningful implementation step:

1. Run the relevant type checks, tests and linting.
2. Fix errors before moving on.
3. Report exactly what changed, which files changed, what was tested, and any remaining risks.

## UI direction

Use the documented Bhaktara design system. The intended visual language is modern devotional: warm cream/off-white surfaces, saffron/orange/gold accents, devotional imagery, rounded cards, generous spacing, modern typography, subtle gradients and restrained motion.

Avoid visual clutter, excessive orange, aggressive advertising, unnecessary autoplay, disrespectful gamification and hard-coded festival dates.

## CMS/content model

The CMS is built for a single operator. It supports:
- workflow `DRAFT → READY → SCHEDULED → PUBLISHED → ARCHIVED` (READY is gated by the QA checklist)
- bulk import from a manifest
- scheduling

It manages:
- content (bhajan, aarti, mantra, chalisa, wallpaper, ringtone, status)
- deities/categories/collections
- home layout, banners
- festivals (manual dates)
- Mandir offerings
- challenges, badges/frames
- gamification and Sadhana config
- notifications, ad placements
- users, license records, audit log

Firestore holds metadata. Media lives in R2 and is referenced by asset keys (doc 22).

## First task

Do **not** immediately start coding the whole product. First:

1. Read the documentation pack.
2. Inspect the repository.
3. Give me a concise implementation assessment containing:
   - current repository state
   - what already exists
   - what is missing
   - the recommended first milestone (M0) according to `16_RELEASE_ROADMAP.md`
   - any contradictions or missing decisions you find in the documentation
   - the exact files/modules you expect to create or modify for that first stage

Then wait for my confirmation before making large architectural changes. For small setup/fix tasks I explicitly request, implement them directly.

Treat the attached Markdown files as the primary specification. Do not replace their product decisions with generic assumptions.
