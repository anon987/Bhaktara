# Bhaktara Product Requirements Document

> Version 2, aligned with `00_DECISION_LOG.md` (D-001 → D-045).
> Scope details: `02_PRODUCT_SCOPE.md`. Where this PRD and the decision log differ, the log wins.

## 1. Product summary

Bhaktara is an Android-first Sanatan/Bhakti app. V1 ships on Android. iOS follows later, after Android traction and revenue (D-009). It combines:
- devotional audio, wallpapers, ringtones and status videos
- a daily Sadhana practice
- a Virtual Mandir
- festivals
- Duolingo-style progression

It should feel like a **digital daily spiritual companion**, not merely a music or wallpaper app.

## 2. Problem

Users juggle separate apps for devotional audio, wallpapers/ringtones/statuses, festivals and daily practice. Most devotional apps are opened occasionally (a festival, a specific aarti) and then forgotten.

Bhaktara brings the common needs together and adds a daily habit loop: Sadhana → streak → XP → league. This gives users a reason to return every day.

## 3. Target users

**Primary**
- Hindi-first Indian users who engage with devotional content and daily prayer.
- Includes older users, which means simple UI, large tap targets and readable Devanagari.

**Secondary**
- Users seeking devotional wallpapers, ringtones and statuses (this is also the organic acquisition loop)
- Beginners wanting a guided daily practice
- Users motivated by streaks, badges and friendly competition

## 4. Product pillars (V1)

1. **Bhakti media:** bhajan, aarti, mantra, chalisa
2. **Expression:** wallpapers, devotional ringtones, status videos
3. **Sadhana:** jaap, meditation, prayer checklist
4. **Virtual Mandir**
5. **Festivals**
6. **Progression:** XP, levels/ranks, streak, challenges, badges, weekly leagues
7. **Personal library:** favorites, saved media

## 5. V1 features (summary — see doc 02 for the full matrix)

| Area | V1 |
|---|---|
| **Home** | Banner carousel at top (internal targets only), progress strip, shortcuts, Today's Sadhana, challenges, league preview, upcoming festivals, content rails, quote. Admin-configurable order. |
| **Content** | Bhajan, aarti, mantra, chalisa (audio, no lyrics); wallpapers; devotional ringtones; status videos |
| **Sadhana** | Daily plan: jaap (mala counter), meditation timer, prayer checklist. History heatmap. |
| **Mandir** | Choose deity; free diya, flowers, bell; aarti playback; special offerings unlocked per use by rewarded ad |
| **Festivals** | List and detail. Dates entered manually. |
| **Progression** | XP (only currency), levels 1–50+, ranks Jigyasu → Sadhak → Bhakt → Ananya Bhakt → Param Bhakt, streak (04:00 boundary), daily/weekly challenges, badges, weekly leagues from day 1 (signed-in only) |
| **Account** | Guest (anonymous) with full features except leagues; Google sign-in with progress kept or merged; never forced |
| **Search** | Title, deity, tags, transliterations (Firestore tokens) |
| **Notifications** | Daily reminder, streak at risk, league ending, festivals, new content. Maximum 2/day. |
| **Ads** | AdMob + Meta AN mediation; native (any screen, within compliance rules), banner, rewarded (saves and Mandir offerings). No interstitials. |
| **Admin CMS** | Single-operator CMS with checklist-gated workflow, import, scheduling, home/banner/challenge/festival/offering/notification/ad management |

## 6. Banner requirements

Every banner has:
- image
- title, subtitle and CTA {hi,en}
- priority
- start and end time
- active flag
- languages
- `target { route, params }` from the route whitelist

V1 supports internal targets only (D-015).

## 7. Content principles

- The product owner creates and checks all content with AI tools (D-001, D-010).
- Sacred-text audio must be generated from a stored verbatim source text and checked against it (doc 12).
- AI use is disclosed on the About/Credits page (D-013).
- There is no user-facing AI generation.

## 8. Monetization

- **Launch:** in-app ads (doc 11).
- **Later:** subscription (ad-free, ungated saves, premium content). The entitlement architecture exists from V1.
- **Principle:** revenue never outranks trust. Ads must respect ad-network placement policy (C-001).

## 9. Acquisition

- Google Ads and Meta Ads, after launch quality is verified at small spend.
- Organic sharing of statuses (WhatsApp share is never ad-gated — D-041).
- Referral: later.

## 10. Success metrics

- Installs, first-open → onboarding completion
- Activation (first play / Sadhana / Mandir on D0)
- D1/D7/D30 retention
- DAU/WAU
- Streak-qualifying DAU %
- Full Sadhana rate
- Challenge completion
- Guest → signed-in conversion
- League participation
- WhatsApp shares per DAU
- Rewarded completion and ARPDAU

North-star: to be confirmed (P-12).

## 11. Non-goals for V1

- Scriptures, stories, Gita, lessons, Stotra
- Lyrics
- Long videos / YouTube
- Panchang, Rashifal, Vrat, Muhurat
- Name ringtones (V1.x)
- iOS release (planned later — D-009; codebase stays iOS-ready)
- Subscription
- User-generated media, social feed, comments, community
- User-facing AI generation
- Temple marketplace, donations, payments, astrology predictions
- Interstitial ads

## 12. V1 acceptance

A new user can:
1. Install and choose a language.
2. Browse without signing in.
3. Play audio with background playback.
4. Preview and — after a rewarded ad — save or set a wallpaper, ringtone or status.
5. Share a status to WhatsApp for free.
6. Use the Mandir, including a special offering.
7. Complete jaap, meditation and prayer checklist tasks.
8. Earn XP and keep a streak across the 04:00 boundary.
9. Complete a challenge and unlock a badge.
10. Sign in with Google without losing progress (including the merge case).
11. Join and view a weekly league (signed-in).
12. Receive notifications within caps.
13. See CMS-driven banners and home sections.
14. Search in Hindi, English or transliteration.
15. Manage favorites and delete their account.
