# AuraFit: App Store (iOS) listing kit

Everything needed to fill in the App Store Connect version page for **AuraFit** (app id `6824422797`, bundle `com.brilworks.aurafit`). The Google Play listing is in [`../STORE_LISTING.md`](../STORE_LISTING.md).

## Assets in this folder

| Folder | Size | App Store Connect slot |
|---|---|---|
| [`iphone-6.9/`](iphone-6.9) | 1320 × 2868 (7 shots) | Previews and Screenshots → **iPhone 6.9" display** (View All Sizes in Media Manager) |
| [`iphone-6.3/`](iphone-6.3) | 1206 × 2622 (7 shots) | Previews and Screenshots → **iPhone with Dynamic Island (medium display)** |
| [`ipad-13/`](ipad-13) | 2064 × 2752 (8 shots) | **iPad 13" display**: only needed while the selected build supports iPad |
| [`header/`](header) | 3840 × 1646 and 5244 × 2950 | **Header** (Header and Search Results). Do not put portrait screenshots here; it rejects them |

Upload the shots in file-name order (1-home first).

**How they were made:**
- **iPhone:** from the iPhone 17 Pro Max simulator running the app in Expo Go, signed in with a real account. The 6.3" set is the 6.9" set resized.
- **iPad:** from an iPad Pro 13" (M5) simulator in **demo mode**, which is why a "Demo mode · Sample data" banner shows. The Expo loading spinner was painted out of the bottom-right corner.
- **Headers:** run `make_header.py` (needs Pillow: `python3 -m pip install pillow`) to rebuild them from `iphone-6.9/` and the app icon.

To retake the shots, use the Maestro flows described in [`../../apps/mobile/.maestro`](../../apps/mobile/.maestro):
1. With Metro running, open the app in the simulator.
2. Turn off Expo Go's "Tools button" in the dev menu.
3. Override the status bar: `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100`.
4. Run a flow that taps through the tabs (`tab-home`, `tab-quests`, `tab-workouts`, `tab-guild`, `hunter-card`, `qa-leaderboard`, `qa-rewards`) using `takeScreenshot`.

Maestro saves the images under `~/.maestro/tests/<run>/`.

> **iPad:** the app is iPhone-only from build **8** onward (`supportsTablet: false`). Select build 8 or later on the version page and the iPad screenshot requirement disappears. Build 7 still allows iPad.

## Text fields

### Name (30 max)
"AuraFit" is taken on the App Store. Use for example `AuraFit: Level Up Workouts`. The temporary name is "AuraFit (55cbd6)".

### Subtitle (27 / 30)
```
Daily quests, XP and squads
```

### Promotional Text (124 / 170)
```
Turn every workout into XP. Clear daily quests, keep your streak alive, climb the ranks with your squad and claim your aura.
```

### Keywords (98 / 100)
Comma-separated, no spaces after the commas.
```
workout,fitness,gym,streak,quests,xp,level up,rank,squad,home workout,habit,challenge,exercise,rpg
```

### Description (1,728 / 4,000)
```
Level up your body. Claim your aura.

AuraFit turns fitness into a game you actually want to play. Every rep, every workout and every streak day earns XP, raises your rank and grows your aura. No complicated plans, just show up, clear your quests and watch yourself level up.

DAILY QUESTS
Get a fresh set of quests every day. Complete them to earn XP and keep your streak going. Short on time? Movement snacks give you quick sessions you can finish anywhere.

GUIDED WORKOUT SESSIONS
Follow clear, step-by-step workouts with timers and rest periods. Start with the built-in starter library, from beginner bodyweight routines to tougher sessions as you grow stronger.

WORKOUT DROPS FROM CREATORS
Discover new workouts released by creators. Follow the creators you like, see what is new and take on their latest drops.

YOUR HUNTER CARD
Your profile card shows your level, rank, aura and stats at a glance. Share your rank card with friends and show how far you have come.

ACHIEVEMENTS AND RANKS
Unlock achievements as you train, rise through the ranks and keep a record of every milestone.

SQUADS
Train together. Create or join a squad with an invite code, compete on the squad leaderboard and keep each other accountable.

STREAK REMINDERS
Optional reminders help you protect your streak before the day ends.

A SAFE COMMUNITY
Report content or squads that break the rules. Our moderation team reviews every report.

Your account works on both the app and the web, so your progress follows you everywhere.

AuraFit is not a medical service. Talk to a doctor before starting a new exercise program, and stop if you feel pain or discomfort.

Privacy Policy: https://aurafit-alpha-one.vercel.app/privacy
Terms of Use: https://aurafit-alpha-one.vercel.app/terms
```

### URLs and copyright

| Field | Value |
|---|---|
| Marketing URL | `https://aurafit-alpha-one.vercel.app` |
| Privacy Policy URL (App Privacy page) | `https://aurafit-alpha-one.vercel.app/privacy` |
| Support URL | `https://aurafit-alpha-one.vercel.app/support` (contact: digital@brilworks.com) |
| Copyright | `2026 Brilworks Technology Private Limited` |

## App information

| Field | Answer |
|---|---|
| Primary category | Health & Fitness |
| Secondary category | Lifestyle |
| Content Rights | Yes, it contains third-party content (creator workout drops); "I have the necessary rights" (the terms must grant a licence to user content) |
| License Agreement | Apple's Standard License Agreement |

### Age rating answers (expected result: 13+)

| Question | Answer |
|---|---|
| Violence, sexual content, profanity, horror, drugs, alcohol, tobacco, gambling, contests | None / No |
| Medical or treatment information | No |
| Health or wellness topics | Yes |
| User-generated content | Yes (creator drops, squads, profiles; users can report, admins moderate) |
| Messaging and chat | No (squads have no chat) |
| Advertising | No |
| Unrestricted web access | No |
| Parental controls / age assurance | No |

The app has no in-app purchases, no ads and no third-party tracking.

### App Privacy ("Yes, we collect data"; none of it is used for tracking)

| Data type | Purpose | Linked to user |
|---|---|---|
| Contact Info → Email Address | App Functionality | Yes |
| Contact Info → Name | App Functionality | Yes |
| Health & Fitness → Fitness | App Functionality | Yes |
| User Content → Other User Content | App Functionality | Yes |
| Identifiers → User ID | App Functionality | Yes |
| Identifiers → Device ID (push token) | App Functionality | Yes |

### App Review Information
Contact details: first and last name, phone and email. The app requires sign-in, so give Apple a **demo account** that has already finished onboarding. Do not use a personal or admin account.

## Errors we hit and what fixed them

| App Store Connect error | Fix |
|---|---|
| "File dimensions are invalid" in the Header slot | Screenshots were dropped in the Header box. Use `header/` there and put the screenshots under Previews and Screenshots |
| Medium display slot rejects 1320 × 2868 | Use `iphone-6.3/` (1206 × 2622) |
| "You must upload a screenshot for 13-inch iPad displays" | Select build 8+ (iPhone-only), or upload `ipad-13/` |
| "You must enter a Privacy Policy URL in App Privacy" | App Privacy → Privacy Policy URL |
| "You must complete the Contact Information section" | App Review Information → contact fields |
