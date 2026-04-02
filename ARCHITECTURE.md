# ARCHITECTURE.md — MySpeedCoach

Descriptive overview of the application. Read this alongside `CLAUDE.md` when working on new features or larger refactors.

---

## What the App Does

MySpeedCoach is a club management and training platform for competitive rope skipping clubs. It is used by:

- **Skippers** — athletes who track their own sessions, records, badges, and goals
- **Coaches** — club members with `isCoach: true` in a group, who can count sessions, post announcements, and view the live dashboard
- **Club admins** (`clubadmin` role) — manage groups, members, join requests, badges, seasons, and competitive labels for their club
- **Super admins** (`superadmin` role) — manage all clubs, users, and global disciplines across the platform

The primary club using the app is **Antwerp Ropes**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (Pages Router) |
| UI | React with inline CSS styles |
| Database | Firebase Firestore (structured data) + Firebase Realtime Database (live session data) |
| Auth | Firebase Authentication (email/password + Google OAuth) |
| Storage | Firebase Storage (badge images, club logos) |
| Deployment | Vercel |
| Push notifications | Web Push API + VAPID via `web-push` npm package |
| Pose detection | MediaPipe Tasks Vision (BlazePose Landmarker) — loaded dynamically in the browser |
| Charts | Recharts |
| Icons | lucide-react |

---

## Repository Structure

```
/
├── pages/                  # Next.js pages (routes)
│   ├── _app.js             # App shell: auth guard, role resolution, announcement badge
│   ├── index.js            # Home / profile page
│   ├── live.js             # Live Hub — entry point for counting & monitoring features
│   ├── skipper-select.js   # Unified skipper + session setup (for manual & camera counting)
│   ├── counter.js          # Manual step counter (individual, relay, triple under)
│   ├── ai-counter.js       # AI-powered step counter (MediaPipe BlazePose)
│   ├── heart-rate.js       # Full-screen Bluetooth HRM display
│   ├── dashboard.js        # Live monitoring dashboard for coaches
│   ├── announcements.js    # Announcements (read + compose)
│   ├── achievements.js     # Badges, records, goals (per skipper)
│   ├── history.js          # Session history with AI analysis
│   ├── badges.js           # Badge leaderboard (per group)
│   ├── badge-beheer.js     # Badge management (coach/admin)
│   ├── clubadmin.js        # Club management (Algemeen, Leden, Groepen, Seizoenen, Labels)
│   ├── superadmin.js       # Platform management (clubs, users, disciplines)
│   ├── settings.js         # User settings page (profile, notifications, membership, labels, zones)
│   ├── login.js            # Authentication
│   ├── register.js         # Multi-step registration flow
│   ├── verify-email.js     # Email verification gate
│   ├── no-club.js          # Shown to verified users without a club membership
│   ├── agenda.js           # Placeholder (not yet implemented)
│   └── api/                # Serverless API routes (firebase-admin, push, AI proxy)
│       ├── ai-analysis.js  # Proxy to Anthropic API for session coaching
│       ├── delete-user.js  # Firebase Auth user deletion (admin SDK)
│       └── push/           # Web Push subscribe / unsubscribe / send
├── components/
│   ├── AppLayout.js            # Navigation shell (sidebar desktop, bottom nav mobile)
│   ├── AnnouncementsWidget.js  # Home screen announcement preview
│   ├── ClubLogoUploader.js     # Club logo upload component (Firebase Storage)
│   ├── DisciplineSelector.js   # Reusable discipline toggle buttons
│   ├── HeartRateMonitor.js     # Bluetooth HRM connector (legacy, kept for reference)
│   ├── LabelGrid.js            # Competitive level (A/B/C) label assignment grid
│   ├── PushPermissionBanner.js # Push opt-in banner + settings toggle
│   ├── SeasonBanner.js         # Admin reminder banner when a new season is approaching
│   └── SeasonManager.js        # Season CRUD UI for clubadmin
├── constants/
│   └── dbSchema.js         # SCHEMA definition + all factory objects
├── contexts/
│   └── AuthContext.js      # Firebase Auth state, exposed via useAuth() hook
├── hooks/
│   ├── useCurrentSeason.js     # Resolves active season + banner logic for a club
│   ├── useDisciplines.js       # Module-cached discipline subscription
│   ├── usePushNotifications.js # Web Push lifecycle hook
│   └── useSkipperSelection.js  # Shared data-fetching for skipper/group/club selection flow
├── lib/
│   └── webpush.js          # Server-side web-push initialisation helper
├── utils/
│   └── renderBodyWithLinks.js  # Converts URLs in announcement body to <a> tags
└── public/
    ├── sw.js               # Custom service worker (push notifications)
    └── manifest.json       # PWA manifest
```

---

## Identity Model

Understanding the two separate identity spaces is critical:

```
Firebase Auth
  └── uid  (e.g. "abc123")
        │
        └── users/{uid}          ← Firestore user doc (role, name, zones, push subs)
              │
              └── userMemberLinks/{linkId}
                    ├── uid        = Firebase Auth uid
                    ├── clubId     = which club
                    ├── memberId   = ClubMember doc ID  ← the athletic identity
                    └── relationship = 'self' | 'parent' | 'guardian' | 'other'

Club data
  └── clubs/{clubId}/members/{memberId}   ← ClubMember (the athlete profile)
        ├── sessionHistory/
        ├── records/
        ├── earnedBadges/
        ├── goals/
        └── (seasons and labels live at clubs/{clubId}/seasons/{seasonId}/...)
```

**Rule**: session data, records, badges, and goals are always stored under the `ClubMember` path, not the `users/{uid}` path. `UserMemberLinkFactory.getUidForMember()` and `UserMemberLinkFactory.getForUser()` are the bridges between the two spaces.

---

## Authentication & Access Flow

```
User visits app
  → _app.js checks Firebase Auth state (AuthFactory.onAuthStateChanged)
  → if not logged in → redirect to /login
  → if logged in but email not verified → redirect to /verify-email
  → if verified but registrationDone = false and firstName missing → redirect to /register
  → if verified but no UserMemberLink → redirect to /no-club
  → otherwise → render AppLayout with resolved userRole + coachView
```

Registration wizard flow (`/register`):
  → Step 0: credentials (email + password) → Firebase Auth account created
      → registrationStep: 1 persisted to Firestore immediately
      → verification email sent via custom SMTP
  → Step 1: name entry → firstName + lastName + registrationStep: 2 + registrationDone: true saved in one update
  → Step 2: confirmation screen → redirect to /verify-email

Interrupted registration recovery:
  → register.js reads registrationStep from Firestore on every mount
  → registrationStep = 0 → show step 0 (credentials)
  → registrationStep ≥ 1 → show step 1 (name), regardless of whether browser was closed
  → registrationDone = true → redirect to /

Coach detection in `_app.js`:
1. Load all `UserMemberLink` records for the current user
2. For each club, load groups and group members
3. If the user's `memberId` appears in any group with `isCoach: true` → set `coachView = true`

This is stored in `sessionStorage` under key `msc_viewmode` and can be toggled on the home page by users who have both skipper and coach access.

---

## Registration Wizard

The registration page (`pages/register.js`) is a multi-step wizard with persistent progress
stored in Firestore. No session storage or local state is used for progress tracking.

| Step | Content | Firestore after completion |
|---|---|---|
| 0 | Email + password | `registrationStep: 1` written immediately after Firebase Auth account creation |
| 1 | First name + last name | `registrationStep: 2`, `registrationDone: true`, `firstName`, `lastName` written in a single update |
| 2 | Confirmation screen | — (redirects to `/verify-email`) |

**Key implementation details:**

- `registrationStep` in Firestore is the single source of truth for wizard progress
- After `AuthFactory.registerWithEmail()`, the code polls until the user document exists (max 10 × 300ms) before calling `updateProfile` — this prevents a race condition with `AuthContext.onAuthStateChanged` which creates the document asynchronously
- `_app.js` redirects users with `registrationDone: false` and no `firstName` back to `/register` on any page load or navigation, including after a hard refresh
- Admin roles (`clubadmin`, `superadmin`) are exempt from this check — they may exist in Firestore without having gone through the registration wizard
- Verification emails are sent via a custom SMTP server configured in Firebase Authentication → Settings → Custom SMTP

---

## Navigation Structure

**Bottom nav (mobile) / Sidebar (desktop)** — defined in `AppLayout.js`:

| Slot | All users |
|---|---|
| Home | `/` |
| Berichten | `/announcements` |
| Live (primary, large) | `/live` |
| Prestaties | `/achievements` |
| Meer (drawer trigger) | opens `SidebarDrawer` |

**Meer drawer / Desktop sidebar secondary items** — role-gated:

| Item | Who sees it |
|---|---|
| Badge leaderboard | Everyone |
| Geschiedenis | Everyone |
| Badge beheer | Coaches + admins |
| Dashboard | Coaches + admins |
| Clubbeheer | Admins (`clubadmin` / `superadmin`) |
| SuperAdmin | `superadmin` only |

Superadmin also gets `/superadmin` in the More drawer.

---

## Live Hub & Counter Flow

The `/live` page is the entry point for all real-time / counting features. It presents cards for:

- **Manueel tellen** → `/skipper-select?mode=manual&return=/counter`
- **Camera tellen (BETA)** → `/skipper-select?mode=camera&return=/ai-counter`
- **Video uploaden (BETA)** → `/ai-counter?mode=upload` (skips skipper-select)
- **Hartslag** → `/heart-rate` (full-screen Bluetooth HRM display)
- **Dashboard** → `/dashboard`
- **Live Training** (placeholder, coming soon)

### skipper-select.js

A unified setup screen used before both manual and camera counting. Handles:
- Club / group selection (via `useSkipperSelection` hook)
- Discipline selection via `DisciplineDropdown`
- Session type selection (Training / Wedstrijd)
- Individual skipper selection (chip grid)
- Relay team builder with drag-to-reorder (`RelayTeamBuilder`)

On confirm, navigates to the `return` URL with all context as URL params: `disciplineId`, `sessionType`, `clubId`, `groupId`, `memberId`, `firstName`, `lastName`, `rtdbUid`, `teamOrder` (JSON, relay only).

The "Nieuwe sessie" flow pre-fills the previous selection via a `prev` URL param (JSON-encoded).

### counter.js

Receives full context from URL params (set by `skipper-select.js`). Supports three session modes derived from `currentDisc.specialRule`:

- **`individual`** — standard timed counting; steps written to RTDB via `LiveSessionFactory.incrementSteps()`; session auto-stops after 15s idle
- **`relay`** — team of N skippers take turns; one RTDB node (`relaySession`) is written to the lead skipper's path; timer auto-advances the skipper when their duration expires
- **`triple_under`** — untimed, multiple attempts; a 15-second miss window resets the current attempt count; best attempt is saved

### ai-counter.js

Receives discipline/session/skipper context via URL parameters from `skipper-select.js`. Uses MediaPipe BlazePose (loaded dynamically via ESM import) to detect ankle position. Key features:
- Kalman filter (`AnkleKalmanFilter`) and custom peak detector (`StepDetector`)
- Optional beep detection via Web Audio API (`BeepDetector`) — persistent attach/poll/destroy architecture
- Post-session review timeline with interactive step-by-step Dutch explanations
- CSV export of signal data
- Mirrors step counts to RTDB so the dashboard shows AI sessions live

Camera mode auto-starts via `mode=camera` URL param. Upload mode uses `mode=upload`.

---

## useSkipperSelection Hook

`hooks/useSkipperSelection.js` centralises all data-fetching for the skipper/group/club selection flow (previously duplicated across `counter.js`, `ai-counter.js`, and `live.js`). Returns:

- `bootstrapDone`, `memberClubs`, `memberGroups`, `skippers`, `clubMembers`
- `selectedClubId`, `selectedGroupId`, setters
- `getMember(memberId)` — profile lookup
- `resolveSkipper(groupMember)` — async; returns `{ memberId, clubId, firstName, lastName, rtdbUid }`

Role-aware: superadmins see all clubs/groups; clubadmins see their clubs; regular users see only their own groups.

---

## Live Dashboard

`pages/dashboard.js` monitors skippers in real time:

- Subscribes to `live_sessions/{uid}` in RTDB for each selected skipper
- Builds a rolling chart from the telemetry data (BPM, steps, tempo)
- Shows a "ghost" overlay comparing current session to the skipper's personal best
- Supports relay monitoring: reads `live_sessions/{relayLeadUid}/relaySession` for team-level data, renders `RelayTotalCard` + `RelaySkipperCard` per team member
- Uses `computeRollingTempo()` (steps per 30 seconds over a 5-second window) for the tempo metric

---

## Badge System

Badges are stored in the top-level `badges` collection. They have two scopes:

- **`global`** — available to all clubs, managed by superadmin
- **`club`** — available to one specific club, managed by clubadmin/coach

Badge types:

- **`automatic`** — awarded by `BadgeFactory.checkAndAward()` after every session save
- **`manual`** — awarded by a coach via `BadgeFactory.award()` in badge-beheer or clubadmin

Automatic trigger kinds (one per badge):
- `minScore` — score ≥ threshold for a specific discipline/ropeType/sessionType
- `firstSession` — first ever session for a discipline
- `totalSessions` — cumulative session count reaches threshold
- `consecutiveWeeks` — trained in N consecutive calendar weeks (ISO 8601 year-week strings to handle year rollovers)

`BadgeFactory.checkAndAward()` is called in three places:
1. `counter.js` — after individual, relay, and triple-under sessions complete
2. `ai-counter.js` — after an AI-counted session is saved
3. `index.js` — on app load, checks for badges earned since last visit

Badge triggers match on `disciplineName` (string) + `ropeType`, with a legacy fallback to the raw discipline ID for old sessions.

---

## Announcement System

Announcements target one or more groups within a club (`groupIds` array). Special broadcast tokens:
- `__ALL_USERS__` — send to every user (superadmin only)
- `__ALL_CLUBADMINS__` — send to all clubadmin users (superadmin only)

Push notifications are fired server-side when a new announcement is created:
1. `announcements.js` → POST `/api/push/send` with `{title, body, groupIds, clubId}`
2. API resolves group members → user UIDs → push subscriptions in Firestore
3. Sends via `web-push` library with VAPID credentials from environment variables
4. Cleans up expired subscriptions (HTTP 410 responses)

Push subscriptions are stored at `users/{uid}/pushSubscriptions/{endpointHash}`.

Editing an existing announcement does **not** trigger a push notification (only new announcements do).

---

## Discipline Configuration

Disciplines are fully dynamic, stored in the `disciplines` Firestore collection:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Human-readable, used in badge matching |
| `ropeType` | `'SR'` \| `'DD'` | Single Rope or Double Dutch |
| `durationSeconds` | number \| null | null = untimed (Triple Under) |
| `teamSize` | number | Total team members including turners |
| `skippersCount` | number | Actual jumpers (used to enforce relay team size in `RelayTeamBuilder`) |
| `isIndividual` | boolean | false = relay/team discipline |
| `specialRule` | `null` \| `'triple_under'` \| `'relay'` | Drives counter session mode |
| `hasCompetitiveLabel` | boolean | Whether A/B/C labels apply to this discipline |
| `sortOrder` | number | Display order in selectors |
| `isActive` | boolean | Hidden from UI when false |

Default disciplines are seeded by `DisciplineFactory.seedDefaults()` (called from superadmin page). Relay and DD disciplines have `hasCompetitiveLabel: false`; individual SR disciplines have `hasCompetitiveLabel: true`.

---

## Season & Label System

### Seasons

Seasons are stored at `clubs/{clubId}/seasons/{seasonId}`. Managed via `SeasonFactory` and the `SeasonManager` component (embedded in `clubadmin.js` → Seizoenen tab).

Each season has:
- `name` (e.g. "2025-2026"), `startDate`, `endDate`, `isAbandoned`
- Name auto-derives from start date; end date auto-sets to start + 1 year − 1 day

`useCurrentSeason(clubId, club)` hook resolves:
- `currentSeason` — season whose date range covers today
- `seasons` — all non-abandoned seasons
- `showBanner` / `upcomingStart` — drives `SeasonBanner` (shown ~30 days before the next season start day configured on the club)

### Competitive Labels

Labels are stored at `clubs/{clubId}/seasons/{seasonId}/memberLabels/{memberId}`. Managed via `MemberLabelFactory` and the `LabelGrid` component (embedded in `clubadmin.js` → Labels tab, and read-only in `settings.js` → Niveaulabels tab).

Each label document has:
- `memberId`, `labelType` (`'allround'` | `'per_discipline'`), `allroundLabel` (`'A'|'B'|'C'|null`), `disciplines` (array of `{disciplineId, label}`)

Only `ClubMember` documents with `skipperType === 'competitive'` appear in `LabelGrid`. Labels are season-scoped and visible to skippers on their settings page.

---

## ClubMember Profile Fields

The `ClubMember` document (`clubs/{clubId}/members/{memberId}`) now includes:

| Field | Type | Notes |
|---|---|---|
| `firstName`, `lastName` | string | |
| `birthDate` | timestamp \| null | |
| `notes` | string | Optional free text |
| `skipperType` | `'competitive'` \| `'recreative'` \| null | Controls label eligibility |
| `isStaff` | boolean | Coaches, guides, etc. |
| `createdAt`, `createdBy` | timestamp, uid | |

`ClubMemberFactory.updateMemberType()` updates `skipperType` and `isStaff` together.

---

## Club Admin Page Structure

`clubadmin.js` is organised into five tabs (in order):

1. **Algemeen** — club name, logo (`ClubLogoUploader`), contact info, season start day/month
2. **Leden** — member list + CRUD (`ClubMemberFormModal`), with sub-tabs:
   - **Leden** — full member list with group tags, type badges, award/edit/delete actions
   - **Aanvragen** — join request approval flow (`ApproveMemberModal`, reject modal)
3. **Groepen** — group list with drag-and-drop member assignment; group detail shows membership table with skipper/coach toggles
4. **Seizoenen** — `SeasonManager` component; create/abandon seasons with prefill logic
5. **Labels** — `LabelGrid` component; assign A/B/C competitive labels per member per season

---

## Settings Page

`pages/settings.js` is a full page (replaced the modal that was previously embedded in `index.js`). Five tabs:

1. **Algemeen** — name and email
2. **Meldingen** — push notification toggle (`PushSettingsToggle`)
3. **Lidmaatschap** — view active memberships, manage join requests, submit new requests
4. **Niveaulabels** — read-only view of the skipper's competitive labels per season
5. **Hartslagzones** — BPM zone boundaries editor

---

## Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Client + server | Public VAPID key for push subscriptions |
| `VAPID_PRIVATE_KEY` | Server only | Private VAPID key — never expose to client |
| `VAPID_SUBJECT` | Server only | `mailto:` contact for VAPID |
| `FIREBASE_CLIENT_EMAIL` | Server only | Admin SDK service account |
| `FIREBASE_PRIVATE_KEY` | Server only | Admin SDK private key (escape `\n` in Vercel) |
| `ANTHROPIC_API_KEY` | Server only | Used by `/api/ai-analysis` proxy |

---

## PWA & Service Worker

The app is a PWA. `public/sw.js` is a hand-written service worker (not generated by next-pwa) that handles:
- Receiving push events and showing notifications
- Notification click → focus existing window or open `/announcements`

`next.config.js` sets `swSrc: 'public/sw.js'` to prevent next-pwa from overwriting it. The service worker is registered manually in `hooks/usePushNotifications.js`, not automatically.

---

## Factory Summary

All Firestore and RTDB access goes through factory objects in `constants/dbSchema.js`. Current factories:

| # | Factory | Collection / Path |
|---|---|---|
| 1 | `UserFactory` | `users/{uid}` — bevat `registrationStep` (0\|1\|2) en `registrationDone` (boolean) for recorverable registrationwizard |
| 2 | `ClubFactory` | `clubs/{clubId}` |
| 2 | `GroupFactory` | `clubs/{clubId}/groups/{groupId}/members/` |
| 3 | `LiveSessionFactory` | RTDB `live_sessions/{uid}` |
| 4 | `ClubJoinRequestFactory` | `clubJoinRequests` |
| 5 | `BadgeFactory` | `badges`, `clubs/{clubId}/members/{memberId}/earnedBadges` |
| 6 | `CounterBadgeFactory` | `countedSessions`, `users/{uid}/earnedBadges` |
| 7 | `ClubMemberFactory` | `clubs/{clubId}/members/{memberId}` and sub-collections |
| 8 | `UserMemberLinkFactory` | `userMemberLinks` |
| 9 | `GoalFactory` | `clubs/{clubId}/members/{memberId}/goals` |
| 10 | `AuthFactory` | Firebase Auth SDK |
| 11 | `AnnouncementFactory` | `announcements` |
| 12 | `DisciplineFactory` | `disciplines` |
| 13 | `SeasonFactory` | `clubs/{clubId}/seasons` |
| 14 | `MemberLabelFactory` | `clubs/{clubId}/seasons/{seasonId}/memberLabels` |
