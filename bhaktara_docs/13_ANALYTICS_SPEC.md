# Analytics Event Specification

> All events go through the single analytics service. Firebase Analytics (GA4) is the sink.
> - Event names: snake_case, ≤ 40 characters. Parameters: ≤ 25 per event.
> - **Common user properties:** `language`, `is_guest`, `rank`, `league_tier`, `app_version`.

## 1. Acquisition and account

| Event | Parameters |
|---|---|
| `first_open` | Automatic |
| `onboarding_language_selected` | `language` |
| `onboarding_complete` | — |
| `sign_in_prompt_shown` | `moment`: first_sadhana \| streak_3 \| streak_7 \| league \| profile |
| `sign_in_prompt_dismissed` | `moment` |
| `sign_in_success` | `method`: google; `result`: linked \| merged \| new_session |
| `account_merge_complete` | `xp_added`, `badges_added` |
| `sign_out` | — |
| `account_delete` | — |

## 2. Content

| Event | Parameters |
|---|---|
| `content_impression` | Sampled; list and rail only |
| `content_view` | Detail open |
| `content_play` | |
| `content_complete` | ≥ 80% of duration |
| `content_favorite` | |
| `content_share` | `channel`: whatsapp \| other |
| `content_save_tap` | `content_type` |
| `content_save_success` | `content_type`, `via`: rewarded \| free \| fallback |
| `set_wallpaper` | `target`: home \| lock \| both |
| `set_ringtone` | `target`: ringtone \| notification \| alarm |
| `search` | `query_normalized`, `results_count` |
| `search_zero_result` | `query_normalized` |

**Common content parameters:** `content_id`, `content_type`, `deity_id`, `source` (home_rail \| explore \| search \| deity \| collection \| banner \| notification)

## 3. Sadhana and practice

- `sadhana_view`
- `jaap_start`, `jaap_mala_complete`, `jaap_session_complete`
- `meditation_start`, `meditation_complete` (`minutes`)
- `prayer_checklist_complete`
- `full_sadhana_complete`

## 4. Mandir

| Event | Parameters |
|---|---|
| `mandir_open` | |
| `mandir_deity_selected` | `deity_id` |
| `mandir_diya_lit` | |
| `mandir_flower_offered` | |
| `mandir_bell_rung` | |
| `mandir_aarti_play` | |
| `mandir_special_offering_tap` | `offering_id` |
| `mandir_special_offering_used` | `offering_id`, `via`: rewarded \| fallback |

## 5. Gamification

- `xp_earned` (`activity_type`, `xp`, `capped`)
- `level_up` (`level`, `rank`)
- `badge_unlocked` (`badge_id`)
- `streak_extended` (`streak`)
- `streak_lost` (`previous_streak`)
- `challenge_view`, `challenge_complete` (`challenge_id`, `period`)
- `league_view` (`is_guest`)
- `league_joined` (`tier`)
- `league_result` (`result`, `tier`, `rank`)
- `display_name_changed`

## 6. Ads

- `ad_request`, `ad_loaded`, `ad_failed`, `ad_impression`, `ad_clicked`
  - Parameters: `placement_id`, `format`, `network`
- `rewarded_started`, `rewarded_completed`, `rewarded_no_fill_fallback`
  - Parameter: `unlock_type`: save_wallpaper \| save_ringtone \| save_status \| mandir_offering

## 7. Notifications

- `notification_permission_prompt`
- `notification_permission_result` (`granted`)
- `notification_open` (`category`, `campaign_id`)

## 8. Product health

- `app_error`, `api_error` (`function`, `code`)
- `offline_mode`
- `save_failed`
- `media_load_failed` (`variant`)

## 9. KPI dashboards

| Area | KPIs |
|---|---|
| **Activation** | Onboarding complete, first content play, first Sadhana task, first Mandir visit — all within D0 |
| **Retention** | D1, D7, D30, WAU/MAU |
| **Habit** | % DAU qualifying for streak, streak ≥ 7 share, full Sadhana rate, challenge completion |
| **Account** | Guest → signed-in conversion by D7; prompt conversion by moment |
| **Competition** | League participation % of signed-in WAU; promotion/relegation distribution |
| **Monetization** | ARPDAU, rewarded completion rate per unlock type, no-fill fallback rate, save-tap → save-success drop-off |
| **Virality** | WhatsApp shares per DAU |

## 10. North-star metric

**Not yet decided.** Candidate: % of DAU with a qualifying streak activity. Confirm before launch.
