# Gamification Specification

> Decisions: D-006, D-019, D-022, D-023, D-024, D-025, D-026, D-027.
> Tags: **[Decided]** · **[Rec default — adjustable]**
> All numeric values live in configuration (`appConfig/gamification`). They are read by Cloud Functions, never hard-coded in the client.

## 1. Philosophy [Decided]

- Gamification encourages consistent practice. It never claims to measure a person's spirituality.
- Ranks and leagues are app progression only.
- Reward consistency over volume.
- Never shame the user.
- XP is the only currency (D-023).
- Nothing is purchasable with XP, and XP is never sold.

**Mandatory copy on the rank info sheet**
> "Yeh ranks Bhaktara app mein aapki yatra ke padaav hain — aapki bhakti ka maap nahi."

## 2. Where XP comes from [Rec default values]

Direct XP comes only from practice and challenges. Consuming content (listening, saving, sharing) earns XP only through challenges.

| Activity | XP | Limits |
|---|---|---|
| Sadhana task complete (jaap / meditation / prayer checklist) | 10 | Once per task per day |
| Full daily Sadhana complete (all tasks) | +20 bonus | Once per day |
| Jaap: 1 mala (108) | 15 | Counts up to 5 malas/day. Minimum duration check (§8). |
| Meditation session ≥ 5 min | 10 | Up to 3 sessions/day |
| Virtual Mandir daily visit (diya lit) | 5 | Once per day |
| Daily challenge | 10–50 | Set per challenge |
| Weekly challenge | 50–150 | Set per challenge |
| Badge unlock | Set per badge | Once |
| **Daily XP cap** | **300** | Everything above the cap is logged but not awarded |

## 3. Streak [Decided: D-024, D-026]

**Qualifying activity:** any ONE of
- a completed Sadhana task
- a completed daily challenge
- one completed jaap mala

Opening the app does not count.

**Day boundary**
- Each day runs from 04:00 to 04:00 in the user's local time.
- The server computes `bhaktiDay = localDate(eventTime − 4h)` using the user's stored IANA timezone.

**Timezone handling [Rec default]**
- The client sends the device timezone.
- The server stores it.
- A timezone change is accepted at most once per 24 hours. This prevents manufacturing extra days.

**Stored fields:** `currentStreak`, `longestStreak`, `lastQualifyingDay`, `timezone`

**Streak break**
- Reset to 0 without shaming.
- Suggested copy: "Nayi shuruaat aaj se. Aapki sabse lambi streak: 21 din."
- Streak shield is post-V1 backlog.

## 4. Levels and ranks [Decided: D-027]

- Levels 1–50+. Thresholds are cumulative XP, stored in config.
- **[Rec default]** curve: `xpForLevel(n) = round(50 × n^1.6)`, to be tuned with real data.

| Levels | Rank |
|---|---|
| 1–4 | Jigyasu |
| 5–14 | Sadhak |
| 15–29 | Bhakt |
| 30–49 | Ananya Bhakt |
| 50+ | Param Bhakt |

Rank thresholds are configurable without an app release.

## 5. Weekly leagues [Decided: D-006, D-019, D-022]

- **Eligibility:** signed-in (non-anonymous) users only. Guests see a preview with a sign-in CTA.
- **Tiers:** Bronze → Silver → Gold → Diamond → Divine. Tier names can be localized.
- **League week [Rec default]:** Monday 04:00 IST → next Monday 04:00 IST. This is one global week, because the user base is India-first.
- **Score:** XP earned during the league week only (`weeklyXp`). Guest XP merged into an account does not count toward the current week (doc 21).

### Cohort formation [Rec default — small-user-base safe]

1. A user joins a cohort in their tier when they earn their first XP of the week (lazy assignment).
2. Target cohort size is 30. A new cohort opens when the current one is full.
3. Users with 0 XP in a week are not placed in that week's cohort. Their tier is kept.
4. No bots or fake participants, ever.

### Week-end promotion and relegation (deterministic, server-side)

| Cohort size | Promote | Relegate |
|---|---|---|
| ≥ 10 | Top 20% | Bottom 20% (users with 0 XP relegated first) |
| 5–9 | Top 2 | None |
| < 5 | Top 1, only if they earned at least the tier's minimum weekly XP | None |

- Bronze never relegates. Divine never promotes.
- **Tie-break:** whoever reached the tied XP first.
- A snapshot of final standings is saved (league history in Profile).

### Display

- The board shows rank, avatar, display name, level and weekly XP.
- Names are always shown (D-039). The name is the user's editable display name, defaulting to first name + last initial (D-042).
- Never label anyone "sabse bada bhakt" or similar. The board ranks weekly app activity only.

## 6. Challenges

**Types in V1:** daily and weekly.

**Festival challenges:** not in V1. Release is not yet decided.

**Metrics enum (server-computed)**
- `SADHANA_TASKS_COMPLETED`
- `FULL_SADHANA_DAYS`
- `JAAP_MALAS`
- `MEDITATION_MINUTES`
- `CONTENT_LISTEN_COMPLETE` (optional filter: content type, deity, collection)
- `MANDIR_VISITS`
- `STREAK_DAYS`

**Configuration per challenge**
- metric
- target
- filters
- XP reward
- badge (optional)
- start and end time
- audience (all / signed-in)

**Operations**
- The single operator should create challenge templates and schedule them in advance.
- Target: 8 weeks queued at launch (doc 18).

## 7. Badges (V1 set) [Rec default]

**Practice**
- Pehli Sadhana (first Sadhana)
- 7-day streak
- 21-day streak
- 108-day streak

**Jaap**
- Pehli Mala (first mala)
- 108 Malas
- 1008 Malas

**Meditation**
- 60 minutes total
- 500 minutes total

**Timing**
- Brahma Muhurta Sadhak: a Sadhana task completed between 04:00 and 06:00 local time on 7 days

**Mandir**
- 7 Mandir visits
- 30 Mandir visits

**Challenges**
- 10 challenges completed
- 50 challenges completed

**League**
- First promotion
- Reached Gold
- Reached Divine

**Milestones**
- 1,000 XP
- 10,000 XP

Removed from the original list: Gita Beginner and 10 Lessons (no scriptures or lessons in V1).

## 8. Rewards

Rewards are cosmetic and unlocked by achievement. There is no shop.

- **Profile frames:** unlocked at each rank change and by selected badges.
- **Special titles:** shown on the profile, unlocked by badges.
- Themes and exclusive wallpapers as rewards: post-V1.

## 9. Anti-cheat [Decided principles, Rec default values]

- All XP is awarded by Cloud Functions and written to `rewardTransactions` with a unique `(userId, type, sourceId)` key.
- **Jaap/meditation sessions:** the client calls `startSession`, and the server records the start time.
  - Completion is rejected if it arrives earlier than the minimum duration.
  - Minimum per mala: 60 s. Meditation: the claimed minutes.
- Daily XP cap (§2).
- Per-function rate limits.
- **Impossible-progress flags:** for example, more than 20 malas per hour. Flagged users are reviewed in the admin, and their XP is not deleted automatically.
- Client-reported content listens count only toward challenges, and are capped per day.

## 10. Configuration location

- `appConfig/gamification` holds: XP table, caps, level curve, rank thresholds, league rules, session minimums.
- The config is versioned. Every change is audit-logged (doc 09).

## Implementation checkpoint — 2026-10-06 (puja offerings, D-054)

The prayer task is a puja (D-053, D-054). Offerings per deity live in `src/domain/puja.ts`; the tray items and which of them are required live in `appConfig/sadhana.prayerItems` (`kind`, `required`, `label`, optional Sanskrit `line`). Only the required items (pushp, dhoop, naivedya, deep, shankh) are sent to `completePrayerChecklist`.

Sources used for the order and the offerings:
- Panchopachar order (gandha, pushpa, dhoop, deep, naivedya, then aarti): [panditsnearme](https://panditsnearme.com/blog/panchopchar-puja-vidhi-and-mantra), [The Sanatan Tales](https://thesanatantales.com/panchopchar-pujan/), [Hindu Janajagruti Samiti](https://www.hindujagruti.org/hinduism/daily-puja-vidhi).
- Flowers by deity: [AstroVed](https://www.astroved.com/articles/10-hindu-gods-and-their-favorite-flowers), [FlowerAura](https://www.floweraura.com/blog/10-divine-flowers-which-are-favorites-hindu-gods); flowers not offered: [The Conversation](https://theconversation.com/why-some-flowers-are-so-pleasing-for-hindu-gods-and-goddesses-235153), [mPanchang on ketaki](https://www.mpanchang.com/articles/astrology/ketaki-flower/).
- Bhog by deity: [VedicFeed](https://vedicfeed.com/naivedhya-favorite-food-offerings-to-gods/), [AstroVed](https://www.astroved.com/blogs/top-10-hindu-gods-and-their-favorite-foods).
- Ghanti and shankh: [Bhakti Marga](https://bhaktimarga.ie/why-do-we-ring-the-ghanta-in-puja/), [Hindu Janajagruti Samiti](https://www.hindujagruti.org/hinduism/knowledge/article/why-is-shankh-blown-before-start-of-puja.html); aarti movement: [ramshyam](https://ramshyam.in/2023/10/12/how-and-how-many-times-should-we-rotate-the-aarti/).

These are content choices made by the operator's direction and should be reviewed when the canonical deity list (P-11) is fixed.
