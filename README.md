# Coreva Driver

React Native (Expo) driver app for Coreva Logistics Brokerage. Companion to the
[web dashboard](https://github.com/cordovacarlos22/coreva_logistics_brokerage_dashboard) --
same Supabase project, same `profiles`/`loads`/`checklists` schema, same
navy/orange "Industrial Minimalism" design system (see
`../stitch_coreva_logistics_driver_hub/coreva_logistics/DESIGN.md`).

## What's here (Phase 1)

- Driver login (email/password via Supabase Auth), gated to `role = 'driver'`
  profiles -- other roles are told to use the web dashboard instead.
- Bottom tabs: **Home** (Active Load Dashboard), **Load** (Load Details),
  **History** (stub -- real content is later work).
- **Departure Checklist** -- digitizes the real Hub Group paper checklist
  Carlos hands in at the plant desk: sign for shipment, turn in the plant
  copy, secure the load, photograph the strapped load, seal the trailer.
  Placing a seal locks the checklist (matches the "once sealed, locked"
  rule in the main repo's `CLAUDE.md`).

Not built yet, on purpose: BOL photo capture + OCR, driver signature capture,
trailer verification, update-load-status, discrepancy/damage reporting,
submitted reports, signed BOL viewer, real load history, driver profile,
GPS tracking, biometric login.

## Setup

```bash
npm install
cp .env.example .env   # fill in the same Supabase URL/anon key as apps/web/.env
npm start
```

Requires Expo Go (SDK 57) or a dev build to run on a device/simulator.

## Database dependency

This app writes to the **same Supabase project** as the web dashboard
(`../coreva_logistics_brokerage_dashboard/supabase/schema.sql`). Before
testing the checklist flow end to end, make sure the following have been
applied to that project's SQL editor (all changes are already in
`schema.sql` -- if the project was set up before this app existed, re-run
the relevant pieces):

1. `checklists.plant_copy_turned_in_at` column (checklist step 2).
2. The `checklists_update` RLS policy fix -- the original `with check`
   clause required the *new* row to still have `status = 'in_progress'`,
   which made it impossible for a driver to ever seal/lock their own
   checklist. Re-run that policy's `create policy` statement.
3. Storage RLS policies for the `load-photos` bucket (checklist step 4's
   photo upload) -- the bucket itself must also exist (Storage → New bucket,
   private, name `load-photos`, per `supabase/README.md`).
4. At least one real driver account exists in Supabase Auth with a matching
   `profiles` row (`role = 'driver'`) -- see the dashboard repo's
   `supabase/seed.sql` DRIVERS section for the 3 demo accounts to create.

## Scripts

- `npm start` / `npm run ios` / `npm run android` / `npm run web`
- `npm run lint`

## Tech

Expo (managed) + expo-router (file-based routing) + NativeWind (Tailwind for
RN, tokens copied from `DESIGN.md`) + Supabase JS client (session persisted
via a `expo-secure-store` + `AsyncStorage` hybrid -- see
`lib/supabaseClient.js` for why). Plain JavaScript, no TypeScript, matching
the rest of the codebase.
