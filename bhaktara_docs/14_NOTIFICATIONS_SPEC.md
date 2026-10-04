# Notifications Specification

> Decisions: D-021, D-024, D-043. V1 targets Android. The iOS phase later needs an APNs configuration and a separate permission prompt flow (D-009).

## 1. Permission

- Android 13+ requires the runtime permission. It is requested after the first completed Sadhana task, never on first launch (doc 03 §2).
- If the user declines, show a gentle Settings entry later. Never re-prompt in a loop.

## 2. Caps and timing [Decided cap; Rec default timing]

- **Maximum 2 push notifications per user per day (D-043)**, counted per local calendar day.
- **Quiet hours [Rec default]:** 21:30–05:30 local. Nothing is sent in this window, except the user's own reminder if they set it inside the window.

**Priority when the cap would be exceeded** (highest first):
1. Daily Sadhana reminder (user-chosen time)
2. Streak-at-risk
3. League ending
4. Festival
5. New content

## 3. Categories

| Category | Trigger | Default |
|---|---|---|
| **Daily reminder** | User's reminder time (default 06:00), only if not yet qualified today | On (after opt-in) |
| **Streak at risk** | 20:00 local, streak ≥ 3, not yet qualified today | On |
| **League ending** | Sunday 18:00 IST, signed-in users in a cohort near a promotion or relegation line | On |
| **Festival** | Day before and morning of featured festivals | On |
| **New content** | Operator campaign | On |

Users can switch each category on or off in Settings (`notificationPreferences`).

## 4. Copy rules

- Localized to the user's language. Warm and inviting. Never threatening.
  - Good: "Aapki 7 din ki Sadhana streak aapka intezaar kar rahi hai 🙏"
  - Avoid: "Abhi kholo warna sab kho doge!"
- Never state or imply spiritual judgment.

## 5. Delivery

- Tokens are stored in `users/{uid}/devices/{installationId}`. Refreshed on app start. Invalid tokens are removed on FCM error.
- Scheduled per user timezone through `dailyReminderFanout` (every 15 min).
- Campaigns go through `sendScheduledNotifications`.
- Anonymous (guest) users receive notifications too, since they have a UID and token.

## 6. Deep links

- Every notification carries `target { route, params }` from the route whitelist (doc 03 §9).
- Invalid targets open Home.

## 7. Analytics

Log the following events:
- `notification_received`
- `notification_open` (with category and campaignId)
- `notification_permission_prompt`
- `notification_permission_result`
