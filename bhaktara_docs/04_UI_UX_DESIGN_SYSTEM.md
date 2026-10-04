# UI/UX Design System

> **Design source:** Google Stitch via MCP (D-046).
> - The exported `docs/design/DESIGN.md` defines the tokens, which are implemented once in `src/theme/tokens.ts`.
> - Stitch output is web code and serves as a visual reference for React Native.
> - Doc 23 §3 lists the checks Stitch does not cover (Devanagari, Hindi string length, tap targets, ad zones, states, low-end devices).

## Visual direction

The product should feel: - devotional - peaceful - premium - modern -
warm - approachable - energetic when showing gamification

Reference visual direction: - cream/off-white surfaces -
saffron/orange/gold accents - deep brown/navy text - subtle gradients -
temple/deity imagery - rounded cards - soft shadows - clear iconography

## Typography

Use a highly readable modern sans-serif for UI.

Support Devanagari cleanly. Do not use a font that looks good in English
but renders Hindi poorly.

Hierarchy: - Display - H1 - H2 - H3 - body - secondary - caption -
button

## Components

Build reusable: - AppHeader - HeroBannerCarousel - ShortcutGrid -
ContentCard - HorizontalContentRail - AudioPlayer - VideoCard -
ProgressCard - StreakCard - XPCard - ChallengeCard - LeaderboardCard -
BadgeCard - EmptyState - ErrorState - LoadingSkeleton - BottomSheet -
DownloadButton - FavoriteButton - ShareButton - AdSlot (native/banner)

## Motion

Use motion sparingly: - progress completion - XP gain - badge unlock -
streak milestone - carousel transitions - button feedback

Avoid constant animation.

## Accessibility

-   minimum 44x44 logical tap target
-   readable contrast
-   scalable text where practical
-   screen-reader labels
-   do not communicate meaning through color alone
-   provide pause/stop for moving content

## Content density

Home can be content-rich, but each section needs strong hierarchy. Do
not place every feature above the fold.

## Ads

See doc 11.

- Ads must visually fit the product without being disguised as content.
- Always labelled "Ad" / "विज्ञापन".
- No interstitials in V1.
- Keep every ad out of the tap zone of the jaap counter and the Mandir offerings (C-001).
- Rewarded-unlock buttons clearly state that an ad will play.

## Components (additions)

- `RewardedUnlockButton`
- `MandirScene`
- `OfferingTray`
- `JaapCounter`
- `MeditationTimer`
- `LeagueBoard`
- `StreakHeatmap`
- `MiniPlayer`

## States

Every screen needs: - initial loading - populated - empty - error -
offline - retry - permission denied where relevant
