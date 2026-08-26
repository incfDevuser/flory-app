# Flory — agent notes

Expo SDK 54 app (React Native 0.81, React 19, expo-router v6). Product is a
plant-care app for Chile: the plant "talks" to the user in first person.

**Expo has changed. Read https://docs.expo.dev/versions/v54.0.0/ before writing
Expo/RN code — do not rely on pre-SDK-50 memory.**

## Commands

| Task      | Command                                       |
| --------- | --------------------------------------------- |
| Dev       | `npm start` (`npm run ios` / `android` / `web`) |
| Lint      | `npm run lint` (= `expo lint`)                 |
| Typecheck | `npx tsc --noEmit` (no npm script exists)      |

- Verification loop is `npx tsc --noEmit` then `npm run lint`. There is **no test
  runner and none is wanted** — do not scaffold Jest.
- **Never run `npm run reset-project`.** `scripts/reset-project.js` does not exist
  and the script is designed to wipe `app/`.

## Layout & current state

- Navigation, auth gating and design tokens exist. Every screen body is still a
  placeholder built on `components/screen.tsx` — the product work is unbuilt.
- `@/*` maps to the repo root (`tsconfig.json`), so `@/lib/supabase` resolves to
  `./lib/supabase`.

```
app/            routes only
  (auth) (onboarding) (tabs)   route groups
  plant/ diagnostico/ reserva/ ajustes/   siblings of (tabs) → push OVER the tab bar
components/
  navigation/   tab bar: tabs.config.ts is the single source for order/labels/icons
  ui/           button, field
lib/            supabase, session, query, auth-errors
theme/tokens.ts RN re-expression of FLORY-DESIGN-SYSTEM.md values
```

- `(tabs)/index.tsx` owns `/`. Do **not** recreate `app/index.tsx` — two files
  resolving to `/` is a route collision.
- Anything that must cover the tab bar goes at the root of `app/`, not inside
  `(tabs)/`.
- Reference docs (Spanish, read before product work):
  - `Flory.md` — product intent, voice rules, hard constraints. Highest authority.
  - `flory-roadmap.md` — build order by week.
  - `FLORY-DESIGN-SYSTEM.md` — full token set (color, type, spacing, motion).
  - `tables.sql` / `species_feed.sql` / `security.sql` — backend, **already applied**
    to Supabase. Treat as the deployed contract; changes need a new migration file.
  - `plantas_chile.json` — the 206-species source data behind `species_feed.sql`.

## Toolchain gotchas

- `app.json` enables `typedRoutes` and `reactCompiler`. Route types are generated
  into `.expo/types` by the dev server — if `<Link href>` types look wrong, start
  `npm start` once instead of casting. Once generated, `npx tsc --noEmit` really
  does reject unknown hrefs.
- Router v6 renamed `initialRouteName` to `unstable_settings.anchor`. An anchor
  naming a route that doesn't exist throws while building the route tree.
- Navigator screen names for nested dirs without a layout are the full path:
  `<Stack.Screen name="plant/[id]/index" />`, not `plant/[id]`. A wrong name only
  warns at runtime, so it is easy to miss.
- A custom `tabBar` silently breaks `useBottomTabBarHeight()`: the height is
  seeded by `getTabBarHeight()` and only corrected by the default `BottomTabBar`
  (`BottomTabView.tsx:217-228`). Our bar reports its measured height through
  `BottomTabBarHeightCallbackContext` — keep that if you rewrite it.
- Platform differences live in `tab-bar.ios.tsx` / `tab-bar.android.tsx`, resolved
  by Metro. Split at the **component** level, never by forking routes, so the
  route tree and deep links stay identical across platforms.
- Android has `edgeToEdgeEnabled: true`, so any bottom chrome must add
  `insets.bottom`. Test with gesture nav *and* 3-button nav; the inset differs.
- `expo-env.d.ts` and `.expo/` are generated and gitignored. Don't hand-edit.
- Reanimated 4 + `react-native-worklets` are installed. `babel-preset-expo` injects
  `react-native-worklets/plugin` automatically — **do not create a `babel.config.js`**
  and do not add `react-native-reanimated/plugin` (removed in v4).
- Session storage: `expo-secure-store` is installed and registered as a plugin;
  `@react-native-async-storage/async-storage` is **not**. `lib/supabase.ts` has a
  SecureStore adapter that chunks values — SecureStore caps at ~2048 bytes and a
  Supabase session exceeds it, so an unchunked adapter fails silently on Android.
- Icons: `lucide-react-native` (+ `react-native-svg`) is the icon set per the
  design system. Fonts (Baloo 2 display / Nunito body) are **not** installed yet —
  add `@expo-google-fonts/*` + `expo-font` when typography lands.
- Plant photos: `expo-image-picker` + `expo-image-manipulator` + `expo-file-system`
  are installed; the picker plugin holds the ES permission strings in `app.json`.
  `plants.photo_url` stores the **private bucket path** (`{user_id}/{plant_id}/{uuid}.jpg`),
  never a URL — the `plant-photos` bucket is private. `lib/plant-photo.ts` owns
  upload/sign/delete: `useSignedPhotoUrl(path)` mints a 1 h signed URL (re-signs on
  path change), uploads go to a **new** path so a failed write never destroys the old
  photo, and the previous file is deleted only after the row points at the new one.
  `HomePlant.photoPath` and `PlantDetail.photoPath` are paths; sign before rendering.
- `FLORY-DESIGN-SYSTEM.md` describes a CSS/JSX web bundle (`tokens/`, `components/`,
  `ui_kits/`). Those directories do not exist here and CSS cannot be imported in
  React Native. Use the doc for **values only**; re-express as RN `StyleSheet`.

## Hard product rules (from `Flory.md`, non-negotiable)

- All user-facing copy is Spanish, tuteo, first person as the plant. Never scolds,
  never blames the user, never fakes certainty. ~6 rotating variants per state.
  Exception: payment/account screens use neutral, corporate tone.
- Three states only: `bien` / `atencion` / `urgente`. **Never use red** — urgent is
  coral/orange.
- No raw numbers in the UI (no %, lux, charts). Day counts only.
- The watering engine is Postgres arithmetic (`compute_interval`,
  `apply_watering_feedback` trigger). **Do not reimplement it client-side.**
- Only photo identification and photo diagnosis call a model, each through its own
  Supabase Edge Function. The OpenAI key and `service_role` key must never reach the
  client bundle — the app gets the `anon` key only, protected by RLS. Identification
  does not consume diagnosis quota.
- Pet toxicity has three values including `no_listado_aspca` (44 species). It must
  render as "no data", never as "non-toxic". A plant with no `species_id` has no
  toxicity data either — it gets the same "no data" copy, never "non-toxic".
- `species.common_problems` is a jsonb array of **plain strings**, despite the
  `[{sintoma, causa, accion}]` comment on `tables.sql:205`. Code against the data.
  `care_notes`, `difficulty` and `image_url` are empty for all 206 species.
- Species not in the catalog get provisional archetype values; the UI must visibly
  flag them as approximate.

## Supabase specifics

- Client-callable RPCs are exactly: `plant_summary(uuid)`,
  `recompute_plant_interval(uuid)`, `find_species(text,int)`,
  `complete_plant_onboarding(...)`, `create_plant(...)`, `delete_my_account()`. The
  onboarding RPC is transactional and idempotent; it is the only client path that may
  create the first plant and set `profiles.onboarded_at` together. **It returns the
  existing plant instead of creating another**, so every plant after the first goes
  through `create_plant`, which shares the same arithmetic without touching
  `onboarded_at`. `compute_interval` is revoked from the client, so there is no
  supported way to insert a plant row directly.
  `create_provisional_species(text,text,text,plant_category,text[],jsonb)` is also
  service_role-only and may be called only by `confirm-identification` after the user
  confirms an out-of-catalog proposal. `identification_attempts` and the 15-row
  `care_archetypes` table are deployed remote contracts not yet represented in local SQL.
  Everything else (`check_diagnosis_quota`, `find_duplicate_diagnosis`,
  `weather_context`, `can_notify`, `refresh_plant_statuses`, …) had EXECUTE revoked
  in `security.sql` and is service_role-only. Calling them from the app will 403.
- `plants_due_for_watering`, `retention_cohorts`, `mvp_health`, `ai_cost_monthly`
  and the other job/analytics views are revoked from `anon`/`authenticated` too.
- Clients cannot write `profiles.plan`, `plan_expires_at` or `founding_user`; a
  trigger silently reverts them.
- If re-running the schema on a fresh project, order is
  `tables.sql` → `species_feed.sql` → `security.sql` →
  `migrations/20260825_onboarding.sql` →
  `migrations/20260825_profile_display_name.sql` →
  `migrations/20260825_create_plant.sql` →
  `migrations/20260825_recompute_sin_especie.sql`. `species_feed.sql` *alters*
  the `species` table (`suitable_outdoor`, `frost_sensitive`, `toxic_to_pets`
  become 3-value enums), so `tables.sql` alone is stale.
  `20260825_create_plant.sql` also fixes a hygiene gap in `security.sql`: it grants
  `delete_my_account()` to `authenticated` without revoking it from `PUBLIC` first,
  so `anon` could call it (harmless today — `auth.uid()` is null and the delete
  matches no rows).
- Daily job order matters: weather fetch → `apply_rain_events()` →
  `apply_heat_stress()` → `refresh_plant_statuses()` → notifications.
- Section 21 of `tables.sql` (real plan limits) is commented out on purpose —
  do not enable it.
