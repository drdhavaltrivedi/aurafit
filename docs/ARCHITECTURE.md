# AuraFit Technical Architecture

AuraFit is a cross-platform, gamified fitness platform engineered for high performance, offline resilience, and real-time RPG progression. This document outlines the system architecture, component topologies, data flow lifecycles, database entity relationships, security models, and deployment pipelines.

---

## 1. High-Level Architecture Overview

AuraFit is architected as an **npm workspaces monorepo** consisting of two client applications, a domain logic package, and a cloud-native backend built on Supabase (PostgreSQL with Row Level Security, Auth, and Storage).

```mermaid
graph TD
    subgraph Clients ["Client Layer"]
        WebClient["Next.js 15 PWA<br/>(React 19 / CSS Tokens / Web Workers)"]
        MobileClient["Expo React Native 0.76+<br/>(iOS & Android / Native Driver / Hermes)"]
    end

    subgraph SharedPackage ["Shared Domain Core"]
        SharedLib["@aurafit/shared<br/>(Types, Formulas, Streak Engine, API Contracts)"]
    end

    subgraph Gateway ["Application Gateway & Serverless API"]
        NextServer["Next.js 15 App Router<br/>(Middleware, Session Cookie Auth, Token Bucket Rate Limiter)"]
        ApiV1["API v1 Endpoints<br/>(/api/v1/me, /quests, /workouts, /drops, /leaderboard)"]
    end

    subgraph DatabaseLayer ["Supabase Cloud / PostgreSQL"]
        SupabaseAuth["Supabase Auth<br/>(JWT, PKCE OAuth, Password Hash)"]
        PostgresDB["PostgreSQL 15 Database<br/>(RLS, Idempotent Stored Procedures)"]
        PgCron["pg_cron Scheduler<br/>(Weekly Aura Reset, Streak Audits)"]
    end

    WebClient -->|Imports Domain Logic| SharedLib
    MobileClient -->|Imports Domain Logic| SharedLib
    NextServer -->|Imports Domain Logic| SharedLib

    WebClient -->|HTTP / Cookie Session| NextServer
    MobileClient -->|HTTP / Bearer Token| NextServer
    NextServer --> ApiV1

    NextServer -->|Service Role Client / RLS| PostgresDB
    NextServer -->|Auth Verification| SupabaseAuth
    PgCron -->|Scheduled Maintenance| PostgresDB
```

---

## 2. Monorepo Structure & Package Hierarchy

```
aurafit/
├── packages/
│   └── shared/               # @aurafit/shared (Single source of domain truth)
│       ├── src/
│       │   ├── index.ts      # Hunter ranks, stats, XP formulas, roles & permissions
│       │   ├── api.ts        # Strongly-typed HTTP API v1 request/response contracts
│       │   ├── streak.ts     # Idempotent calendar-day streak & shield state machine
│       │   ├── drops.ts      # Workout drop schema & validation engine
│       │   ├── limits.ts     # Input length & payload safety limits
│       │   └── icons.ts      # Canonical icon key mappings
│       ├── test/             # Vitest test suite (+ PGlite migration verification)
│       └── schema.sql        # Cumulative database schema concatenation
├── apps/
│   ├── web/                  # Next.js 15 App Router Progressive Web App
│   │   ├── src/app/          # Routes, layouts, and /api/v1/* route handlers
│   │   ├── src/components/   # Design system UI components (obsidian palette)
│   │   ├── src/lib/          # Server API handlers, auth validators, client SDK
│   │   └── public/           # Manifest, service worker, audio & visual assets
│   └── mobile/               # Expo SDK 52 (React Native) mobile application
│       ├── src/components/   # Mobile UI components (Hero cards, stat rows, tab bar)
│       ├── src/screens/      # Member home, Guild World Boss raid, Movement Snacks
│       ├── src/hooks/        # useGameStore (offline-first state), useApi query hooks
│       ├── src/theme/        # Obsidian theme tokens & WCAG high-contrast provider
│       └── assets/           # Local avatars, logo vectors, and splash assets
├── supabase/
│   ├── migrations/           # Versioned SQL migrations (source of truth)
│   └── seed/                 # Sample workout drops and creator profiles
└── docs/                     # Engineering, business logic, marketing & ASO specs
```

---

## 3. Client Architecture & State Management

### 3.1 Dual-Mode Operation (Offline Demo vs. Server Sync)

Both clients support two operational modes:
1. **Demo Mode (Zero-Config / Offline-First)**:
   - Operates entirely locally with pre-seeded hunter profiles, daily quests, and workout drops.
   - Mobile persists state to `@react-native-async-storage/async-storage` via an immutable action reducer (`useGameStore`).
   - Web persists state to browser `localStorage`.
   - Allows users to test role switching (`MEMBER`, `CREATOR`, `ADMIN`) and all RPG mechanics without network connectivity.
2. **Server-Connected Mode**:
   - Authenticated against Supabase Auth using session cookies (Web) or Bearer access tokens (Mobile).
   - Queries and mutations interact with `/api/v1/*` endpoints.
   - Synchronizes offline progress upon re-establishing connection.

```mermaid
sequenceDiagram
    autonumber
    actor Hunter as Hunter (Mobile / Web)
    participant ClientState as Local Client Store<br/>(AsyncStorage / State)
    participant ApiServer as Next.js API Gateway<br/>(/api/v1/quests/:id/complete)
    participant RateLimiter as In-Memory Token Bucket
    participant DB as Supabase PostgreSQL<br/>(complete_quest())

    Hunter->>ClientState: Complete Daily Push-Ups (5 Sets)
    ClientState->>ClientState: Optimistic UI Update (Aura +150, STR +2)

    ClientState->>ApiServer: POST /api/v1/quests/{id}/complete (Bearer JWT)
    ApiServer->>RateLimiter: Check Request Rate (Burst 10, 1/2s)
    alt Rate Limit Exceeded
        RateLimiter-->>ApiServer: 429 Too Many Requests
        ApiServer-->>Hunter: Return 429 (Retry-After: N)
    else Within Allowed Quota
        RateLimiter->>ApiServer: Allow
        ApiServer->>DB: CALL public.complete_quest(p_user_id, p_quest_id, p_today_utc)
        DB->>DB: Lock Profile Row (FOR UPDATE)
        DB->>DB: Check Idempotency (Already completed today?)
        alt Already Completed Today
            DB-->>ApiServer: Raise Exception (ALREADY_COMPLETED)
            ApiServer-->>Hunter: 409 Conflict
        else First Completion Today
            DB->>DB: Calculate Streak Bonus (+5% / day)
            DB->>DB: Increment Aura Points & STR Stat
            DB->>DB: Insert into quest_completions
            DB-->>ApiServer: Return Updated Profile & Rewards
            ApiServer-->>Hunter: 200 OK (AuraEarned, StatGain, Profile)
        end
    end
```

---

## 4. Database Architecture & Entity Relationships

The database is built on PostgreSQL with Row Level Security (RLS) enabled on every public table. Business mutations occur via `SECURITY DEFINER` stored procedures granted strictly to the `service_role`.

```mermaid
erDiagram
    PROFILES ||--o{ QUEST_COMPLETIONS : "completes"
    PROFILES ||--o{ WORKOUT_COMPLETIONS : "logs"
    PROFILES ||--o{ WORKOUT_DROPS : "creates"
    PROFILES }o--|| SQUADS : "belongs to"
    QUESTS ||--o{ QUEST_COMPLETIONS : "logged in"
    WORKOUT_DROPS ||--o{ WORKOUT_COMPLETIONS : "recorded in"

    PROFILES {
        uuid id PK
        uuid auth_id FK
        text username
        text handle
        text role
        integer aura_points
        text rank
        integer level
        integer str
        integer agi
        integer end
        integer rec
        integer streak_days
        integer streak_shields
        date last_active_date
        uuid squad_id FK
    }

    QUESTS {
        text id PK
        text title
        text category
        integer aura_reward
        text stat_reward_stat
        integer stat_reward_amount
        integer target_count
        text unit
    }

    QUEST_COMPLETIONS {
        uuid id PK
        uuid profile_id FK
        text quest_id FK
        date date_key
        integer aura_awarded
        timestamp created_at
    }

    WORKOUT_DROPS {
        uuid id PK
        uuid creator_id FK
        text title
        text vibe_tag
        integer duration_minutes
        numeric aura_multiplier
        integer xp_points
        text difficulty
        jsonb exercises
    }

    WORKOUT_COMPLETIONS {
        uuid id PK
        uuid profile_id FK
        uuid drop_id FK
        date date_key
        integer aura_awarded
        timestamp created_at
    }

    SQUADS {
        uuid id PK
        text name
        text tag
        uuid leader_id FK
        integer total_aura
        integer member_count
        integer streak_days
    }
```

---

## 5. Security & Access Control Model

### 5.1 Role-Based Permissions Matrix

Permissions are validated both at the client boundary (via `@aurafit/shared:hasPermission`) and enforced strictly at the database/API layer.

| Permission | `MEMBER` | `CREATOR` | `ADMIN` | Purpose |
|---|:---:|:---:|:---:|---|
| `DO_QUESTS` | Yes | Yes | Yes | Execute daily quests and claim stat boosts |
| `START_WORKOUT` | Yes | Yes | Yes | Complete workout drops and gain aura |
| `JOIN_SQUAD` | Yes | Yes | Yes | Participate in squads and guild raids |
| `VIEW_GYM_LEADERBOARD` | Yes | Yes | Yes | Read regional and global leaderboards |
| `PUBLISH_WORKOUT_DROP` | No | Yes | Yes | Author and publish community workouts |
| `VIEW_CREATOR_ANALYTICS` | No | Yes | Yes | Access engagement metrics on published drops |
| `MANAGE_SQUAD_MEMBERS` | No | Yes | Yes | Invite, promote, or kick squad members |
| `MANAGE_GYM_AFFILIATION`| No | No | Yes | Manage affiliated gyms and commercial badges |
| `AUDIT_ANTI_CHEAT` | No | No | Yes | Inspect suspicious aura surges & bot activity |
| `ADJUST_AURA_ECONOMY` | No | No | Yes | Modify base rewards and tier multipliers |
| `ASSIGN_USER_ROLES` | No | No | Yes | Elevate users to CREATOR or ADMIN |

### 5.2 Network & Header Security
- **Content Security Policy (CSP)**: Strict origin whitelisting in `apps/web/next.config.mjs` restricting scripts, frames, and connect endpoints.
- **Strict Transport Security (HSTS)**: 2-year max-age with preload directive.
- **Frame Busting**: `X-Frame-Options: DENY` and `frame-ancestors 'none'` to protect against clickjacking.
- **In-Memory Token Bucket**: Every mutating API endpoint (`POST /quests`, `POST /workouts`, `POST /drops`) is wrapped with an IP/User-based rate limiter (Burst: 10, sustained: 1 request / 2 seconds).

---

## 6. Build & Deployment Lifecycle

```mermaid
graph LR
    subgraph Source ["Source Control (GitHub)"]
        GitCommit["git push origin main"]
    end

    subgraph CI ["GitHub Actions CI Pipeline"]
        LintTest["npm ci<br/>build:shared<br/>typecheck<br/>vitest (237 tests)"]
        DockerBuild["Docker Build<br/>Standalone PWA Image<br/>Health Check Smoke Test"]
        ExpoDoctor["Expo Doctor Check<br/>Dependency Alignment"]
    end

    subgraph DeployTargets ["Production Deployments"]
        VercelOrDocker["Web: Vercel / Cloud Run<br/>(Next.js Standalone Container)"]
        EASBuild["Mobile: EAS Cloud Build<br/>(iOS .ipa / Android .aab)"]
        SupabaseCloud["DB: Supabase Migrations<br/>(pg_cron / RLS / Auth)"]
    end

    GitCommit --> LintTest
    GitCommit --> DockerBuild
    GitCommit --> ExpoDoctor

    LintTest --> VercelOrDocker
    LintTest --> EASBuild
    LintTest --> SupabaseCloud
```
