# Ads and Monetization

> Decisions: D-003, D-037, D-038, D-040, D-041, D-044, C-001.
> Tags: **[Decided]** · **[Rec default — adjustable]**

## 1. Acquisition vs monetization [Decided]

| | Channels | Purpose |
|---|---|---|
| **Acquisition** | Google Ads (App campaigns), Meta Ads | Buy installs. Configured outside the app. |
| **In-app monetization** | AdMob, with Meta Audience Network via AdMob mediation (bidding) — D-044 | Earn from app traffic |

Do not mix these in product configuration.

**[Rec default]** Start paid acquisition only after crash-free rate and D1 retention are verified at small spend (doc 16 M5).

## 2. Formats in V1 [Decided]

| Format | V1 | Where |
|---|---|---|
| **Native** | Yes | Allowed on any screen (D-037), within the placement rules in §3 |
| **Banner** | Yes | Selected screens, configurable |
| **Rewarded** | Yes | See §4 |
| **Interstitial** | **No** | Excluded from V1 (D-003) |
| **App open** | **No** | Not planned |

## 3. Placement rules

### Compliance rules (C-001) — mandatory
- Never place an ad adjacent to, overlapping, or within the same tap zone as repeated-tap targets:
  - the jaap counter button
  - the Mandir diya, flowers and bell
- Ads must never look like content. Always show an "Ad" / "विज्ञापन" label.
- Never place an ad where a scroll-stop or layout shift can cause a mis-tap, e.g. above a primary button that moves.

### Default placements [Rec default — all configurable in the CMS]

| Screen | Placement |
|---|---|
| Home | Native between content rails, starting after rail 2. None in the first viewport. |
| Explore lists | Native every 8 items |
| Content detail (audio) | Native below related items |
| Audio full player | Native card below the controls, outside the control area |
| Sadhana tab / Challenges / League | Native at the bottom of the list |
| Jaap and meditation screens | Banner at the bottom edge only, outside the counter zone (C-001) |
| Mandir | Banner at the bottom edge only, outside the offering tray (C-001) |

### Frequency [Rec default]
- At most 1 native ad visible per viewport.
- Minimum 30 s before the first ad in a session.

## 4. Rewarded ads [Decided: D-038, D-040, D-041]

| Unlock | Rule |
|---|---|
| Save wallpaper / ringtone / status to device | One rewarded ad per save. Controlled per item by `content.saveGate` (default REWARDED). |
| "Set as wallpaper / ringtone" | Treated as a save (the file must be written first) |
| Share status to WhatsApp | **Free, not gated** (D-041). Implementation: temporary cache file + share intent, without a gallery save. |
| Mandir special offering | One rewarded ad per single use (D-040). Basic diya, flowers and bell are always free. |

**Behaviour**
- Rewarded ads are always user-initiated. The button says "Ad dekhkar save karein".
- **No-fill fallback [Rec default]:** if no ad loads within 5 s, grant the unlock anyway. Never block the user because of ad inventory.
- Rewarded ads never grant XP or streak credit.
- Premium users (future) skip every gate (`premiumDisabled`).

## 5. Admin controls [Decided]

Stored in `adPlacements/{placementId}`, one doc per placement:

```text
enabled, format, screen, position, frequency, cooldownSeconds,
minActionsBeforeShow, premiumDisabled, countryRules, excludedZones[]
```

**Remote Config emergency switches**
- `ads_all_enabled`
- `ads_native_enabled`
- `ads_rewarded_enabled`
- a per-placement kill list

If rewarded ads are disabled, every gate opens (items become free).

## 6. Subscription (architecture only in V1)

- `entitlements/{uid}` exists from V1 (doc 06). No paywall in V1.
- Candidate benefits later: ad-free, ungated saves, premium content, offline library, exclusive Mandir offerings.

## 7. Revenue analytics

Track:
- impressions, clicks, fill rate, eCPM (via AdMob reporting)
- rewarded started / completed per unlock type
- no-fill fallbacks
- ARPDAU

Watch for rewarded-gate abandonment. It is the main risk to the share/virality loop.

## 8. UX rule

Revenue never outranks trust. If ads cause visible harm to D1/D7 retention or Play ratings, reduce density before anything else.
