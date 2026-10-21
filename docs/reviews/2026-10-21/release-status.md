# Release verification

The reviewed work was integrated into `main` by fast-forward at `9c2c026` and pushed without force. Vercel successfully published https://brainpsi.vercel.app/. The live entry bundle changed to `/assets/index-s9NlxaXH.js` and contains `create_public_booking`.

Chrome with a temporary profile rendered the home page with the live service catalog, prices and available times. `/reservar` rendered the location selector with Lincoln and San Nicolas. Desktop screenshots and rendered DOM were inspected. No booking was submitted and no patient or MFA factor was changed during frontend validation. The embedded browser runtime failed to initialize, so this validation used standalone headless Chrome without existing cookies or browser profiles.

Supabase migration 0046 and invite-staff version 10 were already deployed and verified independently. The frontend publication completes the compatibility requirement for the RPC-only booking path. These smoke checks do not constitute a successful end-to-end booking or authenticated admin test.

## CI startup race

The first CI run on main failed before applying migrations: the disposable PostgreSQL server reported that database `bpc` did not exist. The readiness loop used `pg_isready` against the Unix socket, which could report an accepting server during image initialization before the requested database existed.

The test harness now waits for a successful `SELECT 1` against `bpc` over TCP. This checks the requested database on the final server, rather than the temporary socket-only initialization server. A timeout fails explicitly and prints the last container log lines. The change affects only disposable tests, not hosted Supabase configuration.

Local validation passed shell syntax, diff checks, all 33 SQL files and the two-connection booking concurrency test. The fix is included in this release; its remote CI result is checked separately after publication.
