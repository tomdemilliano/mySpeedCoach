# ARCHITECTURE.md — MySpeedCoach

Descriptive overview of the application. Read this alongside `CLAUDE.md` when working on new features or larger refactors.

---

## What the App Does

MySpeedCoach is a club management and training platform for competitive rope skipping clubs. It is used by:

- **Skippers** — athletes who track their own sessions, records, badges, and goals
- **Coaches** — club members with `isCoach: true` in a group, who can count sessions, post announcements, and view the live dashboard
- **Club admins** (`clubadmin` role) — manage groups, members, join requests, and badges for their club
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
│   ├── counter.js          # Manual step counter (individual, relay, triple under)
│   ├── ai-counter.js       # AI-powered step counter (MediaPipe BlazePose)
│   ├── dashboard.js        # Live monitoring dashboard for coaches
│   ├── announcements.js    # Announcements (read + compose)
│   ├── achievements.js     # Badges, records, goals (per skipper)
│   ├── history.js          # Session history with AI analysis
│   ├── badges.js           # Badge leaderboard (per group)
│   ├── badge-beheer.js     # Badge management (coach/admin)
│   ├── clubadmin.js        # Club management (groups, members, join requests)
│   ├── superadmin.js       # Platform management (clubs, users, disciplines)
│   ├── login.js            # Authentication
│   ├── register.js         # Registration flow
│   ├── verify-email.js     # Email verification gate
│   ├── no-club.js          # Shown to verified users without a club membership
│   ├── agenda.js           # Placeholder (not yet implemented)
│   └── api/                # Serverless API routes (firebase-admin, push, AI proxy)
│       ├── ai-analysis.js  # Proxy to Anthropic API for session coaching
│       ├── delete-user.js  # Firebase Auth user deletion (admin SDK)
│       └── push/           # Web Push subscribe / unsubscribe / send
├── components/
│   ├── AppLayout.js        # Navigation shell (sidebar desktop, bottom nav mobile)
│   ├── AnnouncementsWidget.js  # Home screen announcement preview
│   ├── DisciplineSelector.js   # Reusable discipline toggle buttons
│   ├── HeartRateMonitor.js     # Bluetooth HRM connector (legacy, kept for reference)
│   └── PushPermissionBanner.js # Push opt-in banner + settings toggle
├── constants/
│   └── dbSchema.js         # SCHEMA definition + all factory objects
├── contexts/
│   └── AuthContext.js      # Firebase Auth state, exposed via useAuth() hook
├── hooks/
│   ├── useDisciplines.js   # Module-cached discipline subscription
│   └── usePushNotifications.js # Web Push lifecycle hook
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
        └── goals/
```

**Rule**: session data, records, badges, and goals are always stored under the `ClubMember` path, not the `users/{uid}` path. `UserMemberLinkFactory.getUidForMember()` and `UserMemberLinkFactory.getForUser()` are the bridges between the two spaces.

---

## Authentication & Access Flow

```
User visits app
  → _app.js checks Firebase Auth state (AuthFactory.onAuthStateChanged)
  → if not logged in → redirect to /login
  → if logged in but email not verified → redirect to /verify-email
  → if verified but no UserMemberLink → redirect to /no-club
  → otherwise → render AppLayout with resolved userRole + coachView
```

Coach detection in `_app.js`:
1. Load all `UserMemberLink` records for the current user
2. For each club, load groups and group members
3. If the user's `memberId` appears in any group with `isCoach: true` → set `coachView = true`

This is set in `sessionStorage` under key `msc_viewmode` and can be toggled on the home page.

---

## Navigation Structure

**Bottom nav (mobile) / Sidebar (desktop)** — defined in `AppLayout.js`:

| Slot | Regular user | Coach / Admin |
|---|---|---|
| Home | `/` | `/` |
| Secondary | `/counter` | `/counter` |
| Primary (large) | `/achievements` | `/dashboard` |
| Messages | `/announcements` | `/announcements` |
| More drawer | badges, history | + achievements, badge-beheer, clubadmin |

Superadmin also gets `/superadmin` in the More drawer.

---

## Counter System

The counter (`pages/counter.js`) supports three session modes determined by the selected discipline's `specialRule`:

- **`individual`** — standard timed counting; steps are written to RTDB via `LiveSessionFactory.incrementSteps()`; session is auto-stopped after 15s idle
- **`relay`** — team of N skippers take turns; one RTDB node (`relaySession`) is written to the lead skipper's path; the timer advances the skipper automatically when their duration expires
- **`triple_under`** — untimed, multiple attempts; a 15-second miss window resets the current attempt count; best attempt is saved

The AI counter (`pages/ai-counter.js`) is a separate page that:
1. Receives discipline/session/skipper context via URL parameters from `counter.js`
2. Uses MediaPipe BlazePose (loaded dynamically via ESM import) to detect ankle position
3. Applies a Kalman filter (`AnkleKalmanFilter`) and a custom peak detector (`StepDetector`)
4. Optionally detects start/stop beeps via Web Audio API (`BeepDetector`)
5. Mirrors step counts to RTDB so the dashboard shows AI sessions live

---

## Live Dashboard

`pages/dashboard.js` monitors skippers in real time:

- Subscribes to `live_sessions/{uid}` in RTDB for each selected skipper
- Builds a rolling chart from the telemetry data (BPM, steps, tempo)
- Shows a "ghost" overlay comparing current session to the skipper's personal best
- Supports relay monitoring: reads `live_sessions/{relayLeadUid}/relaySession` for team-level data
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
- `consecutiveWeeks` — trained in N consecutive calendar weeks

`BadgeFactory.checkAndAward()` is called in three places:
1. `counter.js` — after individual and relay sessions complete
2. `ai-counter.js` — after an AI-counted session is saved
3. `index.js` — on app load, checks for badges earned since last visit

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

---

## Discipline Configuration

Disciplines are fully dynamic, stored in the `disciplines` Firestore collection:

| Field | Type | Notes |
|---|---|---|
| `name` | string | Human-readable, used in badge matching |
| `ropeType` | `'SR'` \| `'DD'` | Single Rope or Double Dutch |
| `durationSeconds` | number \| null | null = untimed (Triple Under) |
| `teamSize` | number | Total team members including turners |
| `skippersCount` | number | Actual jumpers (used to enforce relay team size) |
| `isIndividual` | boolean | false = relay/team discipline |
| `specialRule` | `null` \| `'triple_under'` \| `'relay'` | Drives counter session mode |
| `sortOrder` | number | Display order in selectors |
| `isActive` | boolean | Hidden from UI when false |

Default disciplines are seeded by `DisciplineFactory.seedDefaults()` (called from superadmin page).

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
