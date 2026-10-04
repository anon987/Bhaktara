# Product Scope and Feature Matrix

> Source of truth for WHAT ships WHEN. Decisions are referenced by ID from `00_DECISION_LOG.md`.
> Status tags: **[Decided]** · **[Pending: P-xx]** · **[Backlog]**

## Platform

- **V1: Android only.** iOS is planned for later, after the Android app is successful and generating revenue (D-009).
- The codebase must stay iOS-ready. Platform-specific features go behind abstractions (doc 05).
- No iOS build, iOS QA or App Store submission is required before the iOS phase.

## Release definitions

| Release | Meaning |
|---|---|
| **V1** | First public Play Store release. Content + habit layer + competition + ads (D-002). |
| **V1.x** | Updates shipped shortly after V1, without architectural change. |
| **Post-V1 backlog** | Planned features. Order and release to be decided after V1 data. |

---

## V1 — First public release

### App shell
- Onboarding
- Home (CMS-configurable). Banners use internal targets only; there is no YouTube target in V1 (D-015).
- Explore
- Content detail
- Audio player
- Video player (status videos)
- Search
- Profile
- Settings

### Content types (D-004)
| Type | V1 | Notes |
|---|---|---|
| Bhajan | Yes | Audio |
| Aarti | Yes | Audio. No lyrics in V1 (D-011). |
| Mantra | Yes | Audio. Accuracy safeguards are in `12_CONTENT_OPERATIONS.md`. |
| Chalisa | Yes | Audio |
| Stotra | No | Post-V1 (D-045) |
| Wallpapers | Yes | View, save to gallery, set as wallpaper |
| Devotional ringtones | Yes | Preview, save, set as ringtone (Android `WRITE_SETTINGS` flow) |
| Status videos | Yes | Play, save, share (WhatsApp share intent) |
| Name ringtones | No | V1.x (D-008) |
| Scriptures / stories / Gita | No | Post-V1 backlog |
| Meditation ambient audio | Optional | Used only inside the meditation timer, not a browsable content type |
| Long devotional videos | No | Not in V1 (D-012). Status videos are the only video content. |

### Sadhana
- Daily Sadhana
- Jaap counter
- Meditation timer
- Prayer checklist
- Completion state
- Sadhana history
- Meditation task (replaces the reading task — D-025)

### Gamification
- XP
- Levels
- Daily streak
- Daily challenges
- Weekly challenges
- Badges
- Weekly leagues with promotion/relegation (D-006). Launch activation **[Pending: P-01]**.

### Virtual Mandir (D-007, D-040)
- Choose deity
- Light diya (free)
- Offer flowers (free)
- Ring bell (free)
- Play aarti audio
- Special offerings (ornaments, special flowers, festival items): one rewarded ad unlocks one use

### Utilities (D-005, D-033)
- Festival list with upcoming festivals and a festival detail page (D-034). Dates are entered manually in the CMS.
- Not in V1: Aaj ka Panchang card (D-033), full Panchang screen, Rashifal, Vrat, Muhurat.

### Personal library
- Favorites
- Saved media (wallpapers, ringtones, statuses saved to the device)

### Monetization (D-003)
- AdMob with Meta Audience Network via mediation (D-044).
- Native ads may appear on any screen (D-037), subject to compliance rule C-001.
- Banner ads on selected screens.
- Rewarded ads for saving wallpapers, ringtones and statuses (D-038), and for Mandir special offerings (D-040). WhatsApp status share stays free (D-041).
- No interstitial ads in V1.
- Admin ad controls and a Remote Config kill switch are required at launch.

### Notifications
- Daily Sadhana reminder
- Streak at risk
- New content
- Festival reminders
- League ending
- Maximum 2 per user per day (D-043)

### Backend
- Firebase Auth
- Firestore
- Storage
- Cloud Functions
- FCM
- Analytics
- Crashlytics
- Remote Config
- App Check

### Admin CMS (single operator — D-001)
- Login and roles
- Dashboard
- Content CRUD
- Media upload
- Banner manager
- Home section manager
- Challenge manager
- Badge manager
- Festival manager
- Mandir offerings manager
- Import tool
- Virtual Mandir deity config
- Notification manager
- Ad configuration
- User lookup
- Audit log

---

## V1.x

- Name ringtones (D-008)

## Post-V1 backlog (order to be decided after V1 data)

- Scriptures, stories, Bhagavad Gita, lessons, quizzes, Stotra
- Lyrics/text display with audio
- Long devotional videos and the YouTube banner target
- User-facing "report issue" on content
- Aaj ka Panchang card, full Panchang, Rashifal, Vrat, Muhurat, regional calendars (engine and licensing to be decided then)
- Offline audio library (distinct from saving media — see note below)
- Streak shield
- Festival challenges (release not yet decided)
- Subscription, premium content, ad-free tier
- Referral system
- Personalized home and recommendations
- Friends, friend challenges, groups, moderated discussion
- iOS release: after Android traction/revenue (D-009). See doc 05 for iOS-readiness rules and known iOS differences.
- Multilingual expansion beyond Hindi/English
- Web presence / SEO

---

## Terminology rule: "Save" vs "Offline"

These are two separate features and must be kept separate in code, copy and analytics:

- **Save / Set:** a wallpaper, ringtone or status is written to the device's gallery or ringtone storage. This is V1.
- **Offline:** audio is cached inside the app for playback without internet. This is post-V1.

## Priority rule

A feature that does not improve any of the following must not delay V1:
- daily usage
- content discovery
- devotional practice
- retention
- monetization
- content operations for a single operator
