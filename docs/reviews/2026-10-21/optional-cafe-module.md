# Optional cafe module per clinic

The existing business settings document now accepts a boolean `cafeEnabled`. Missing configuration retains the existing enabled behavior. Only the owner can edit business settings under the existing RLS policies. The Business screen exposes the switch, waits for persistence before claiming success, preserves unrelated settings and reloads catalogs when the module changes.

## User experience

When disabled, public desktop/mobile navigation, footer, cart and cafe routes disappear or redirect to therapy. Home, About and Contact use clinic-focused copy. The location selector and booking form stop offering coffee regardless of a location's stored cafe preference, and the booking payload sends `wantsCoffee: false`. The cart is cleared if the module becomes disabled. Configured business names are used in the public header/footer; names are not automatically rewritten when disabling the module.

The admin removes the cafe section and operational dashboard cards. Historical accounting remains accessible with the existing permissions, including cafe accounting roles. A barista can still access personal account security. Cafe catalog queries and the order realtime subscription are skipped while disabled. Historical orders remain loaded for authorized accounting, rather than being deleted or filtered out of financial history.

Structured data stops advertising `CafeOrCoffeeShop` after settings load. Static prerendered route titles/descriptions still use the existing build-time branding; tenant-specific metadata and full branding remain a separate product task. A disabled module is not a claim that historical cafe data becomes private beyond its existing RLS rules.

## Database enforcement

Migration 0047 validates the settings document and boolean flag. Legacy settings updates that omit an existing flag preserve it, rather than silently re-enabling the module. A trigger-only definer reads the settings for the affected tenant and blocks new orders and all order-item mutations while disabled. Deletes are blocked to prevent legacy delete-then-insert clients from erasing historical lines before a rejected replacement. Order header deletion is also blocked; status changes and historical payment workflows retain their existing authorization.

New clinic appointments are still accepted through the atomic RPC and record consent; requests for coffee are normalized to false. Existing appointment preferences are preserved when unrelated fields change. Settings are locked for share during the operation so a concurrent toggle cannot change that existing row mid-write. No table data is removed or rewritten by installing the migration.

## Validation and rollout

`npm run verify` passed lint, QA, 63 Node-reported tests, 90 component tests and production build. New component/API tests cover hidden navigation, legacy cafe URL redirects, retained cafe behavior, owner save success/failure, accounting/security destinations, skipped cafe table reads and clinic bookings without coffee.

The disposable PostgreSQL suite passed all 34 SQL files plus the two-connection concurrency test. New cases cover invalid flags/documents, non-owner updates, legacy settings edits, direct public order attempts, protection of historical orders/items, independent clinics, atomic clinic booking with consent and reactivation.

A local fixture with synthetic data was inspected using temporary Chrome profiles at exact 390 px and 1440 px viewports. Both reported no horizontal overflow and no cafe links. No real clinic configuration, orders or patients were changed. The fixture and development processes were removed after inspection.

Apply 0047 before publishing the frontend with this control. The implementation branch is `feature/optional-cafe-module`; frontend releases are published through `main`. Existing clinics stay enabled until their owner explicitly disables the module. The migration does not rename the business, delete historical records or remove old cafe roles.

0047 was applied to BrainPsiSaaS after verifying all 46 earlier migration checksums. Its checksum and the settings trigger plus three module triggers were verified independently. The trigger-only definer is not executable directly by anon or authenticated. The remote configuration check showed zero disabled clinics; no owner preferences were changed during deployment.
