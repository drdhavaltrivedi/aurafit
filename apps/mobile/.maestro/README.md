# Maestro E2E flows (Expo Go, iOS Simulator)

Run with Metro started (`npx expo start`) and Expo Go installed on a booted simulator:

```sh
maestro test -e METRO_URL=exp://127.0.0.1:8081 01_welcome.yaml
maestro test -e METRO_URL=exp://127.0.0.1:8081 -e EMAIL=... -e PASSWORD=... 04_login.yaml
```

- Flows that sign in need a **disposable, confirmed** account passed via `EMAIL` / `PASSWORD`
  (`05_member.yaml` claims quests; `06_account_delete.yaml` permanently deletes the account).
  Never commit credentials.
- Simulator setup: turn off *Settings → General → AutoFill & Passwords → Suggest Strong Passwords*,
  otherwise iOS covers new-password fields with a system sheet that Maestro cannot type into.
- `subflows/start.yaml` relaunches Expo Go, opens the dev server, dismisses the Expo Go onboarding sheet
  and returns to the Welcome screen (signing out / leaving demo mode if needed).

## Onboarding (`10_onboarding.yaml`)

- Needs an account whose profile has **not** finished onboarding (`profiles.onboarded_at IS NULL`,
  e.g. a fresh sign-up made after `20261014100000_onboarding.sql`). The flow completes onboarding;
  reset the account between runs (see the header of the flow).
- `subflows/skip_intros.yaml` (used by `subflows/login.yaml`, `08_demo.yaml` and `09_dark_mode_tour.yaml`)
  gets past the one-time demo intro and completes onboarding with defaults for fresh accounts, so the
  older flows keep landing on the main shell. Pass `-e KEEP_ONBOARDING=true` to stop on onboarding instead.
