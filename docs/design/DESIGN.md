# Bhaktara UI foundation

Designed directly from the supplied Markdown specifications. No Stitch export or design images were available. Original files in `bhaktara_docs/` are preserved.

- Warm cream `#FBF7EF`, card `#FFFDFA`, dark brown text `#35251E`.
- Saffron actions `#AD461F`, decorative saffron `#DA702F`, gold `#B78A39`.
- Quiet practice cards: sage `#EAF0E7` with `#426650` text.
- Bundled DM Sans and Noto Sans Devanagari, regular/bold. Scalable text with 1.55 line height for Hindi matras.
- Spacing tokens: 4/8/12/16/24/32. Screen gutters 22; cards rounded 20; buttons rounded 16.
- Buttons at least 52 high, icon targets 48×48, chips at least 44 high. Lucide icons throughout.
- No autoplay carousel or decorative loops. Immediate press feedback and no stack animation.

Home: header → swipeable banners → sample progress → shortcuts → daily practice → content cards. Explore uses a virtualized list, search and category/deity filters. Mandir has first-visit deity selection and a free offering tray. Sadhana contains Today, Challenges, League and History, with focused jaap/meditation screens. Profile contains sample progress/badges and real local favorites/settings.

`DevotionalArt` resolves placeholder asset keys into original SVG lotus/diya art. These are abstract placeholders, not deity depictions. Replace with licensed R2 image variants behind the asset-key boundary. `assets/brand-icon.svg` is original code-drawn branding.

All screens support a shared catalog loading/error/retry/empty/offline preview. Developer state controls live in Profile. No real ad slots are rendered. Rewarded save/offering labels state an ad will play in the integrated app; the preview explicitly reports unavailable integration. WhatsApp remains free.
