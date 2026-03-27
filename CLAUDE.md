# CLAUDE.md — MySpeedCoach Development Rules

Read this file before writing or modifying any code.
If a request would require violating a rule below, say so before proceeding.

---

## 1. Database Access (Hard Rules)

- **ALL** Firestore and RTDB reads/writes go through factory methods in `constants/dbSchema.js`
- **Never** import `db`, `rtdb`, `auth`, or any Firebase SDK function directly in a page or component file
- The only file allowed to import from `firebaseConfig.js` is `constants/dbSchema.js` (and the two API route exceptions: `pages/api/` files which use firebase-admin, and `contexts/AuthContext.js` which uses `AuthFactory`)
- Every new Firestore collection must have:
  1. A schema entry in the `SCHEMA` const at the top of `dbSchema.js`
  2. A factory object with named methods below it
- Factory method naming convention:
  - `getX` / `getXOnce` — one-shot reads
  - `subscribeToX` / `getX(callback)` — real-time listeners that return an unsubscribe function
  - `createX` / `X.create` — writes
  - `updateX` / `X.update` — updates
  - `deleteX` / `X.delete` — deletes

---

## 2. Data Model Rules

- The `SCHEMA` const in `dbSchema.js` is the authoritative description of the database structure
- When adding a new field: update `SCHEMA` first → update the factory → update the UI
- **Member identity**: always use `memberId` (the ClubMember document ID under `clubs/{clubId}/members/{memberId}`)
- **User identity**: `uid` is the Firebase Auth UID, stored on `users/{uid}` — it is NOT the same as `memberId`
- The uid↔memberId bridge is exclusively `UserMemberLinkFactory` — never infer one from the other
- When saving a session, always persist BOTH `disciplineId` (Firestore doc ID) AND `disciplineName` (human-readable string) — badge matching and display both use the name, not the ID
- Also persist `ropeType` (`SR` or `DD`) on every session and badge trigger — it is required for badge matching

---

## 3. Roles & Access Control

Roles in ascending order of privilege:
```
user < coach (isCoach flag) < clubadmin < superadmin
```

- Role is stored on `users/{uid}.role` as `'user' | 'clubadmin' | 'superadmin'`
- Coach status is the `isCoach` boolean on the group membership doc (`clubs/{clubId}/groups/{groupId}/members/{memberId}.isCoach`) — it is NOT a role string on the user doc
- `_app.js` is the **single place** where role and `coachView` are resolved — do not re-derive them in pages or components
- `AppLayout.js` receives `userRole` and `coachView` as props and does not perform its own role lookups
- Client-side role checks are for UI gating only — Firestore Security Rules are the enforcement layer
- Never expose superadmin or clubadmin functionality to `user`-role users, even behind a hidden UI

---

## 4. React & Component Rules

- Pages in `pages/` own data fetching, subscriptions, and top-level state
- Reusable display logic goes in `components/` — components should not subscribe to Firestore directly unless they are explicitly self-contained widgets (e.g. `AnnouncementsWidget`)
- Every `onSnapshot` subscription started in a `useEffect` **must** return its unsubscribe function as the cleanup
- A component or page file over ~350 lines is a signal to extract sub-components
- Do not use `<form>` HTML elements — use `onClick`/`onChange` handlers instead
- All DB factory calls inside effects must handle the `cancelled` / cleanup pattern:
  ```js
  useEffect(() => {
    let cancelled = false;
    const unsub = SomeFactory.subscribe(data => {
      if (!cancelled) setState(data);
    });
    return () => { cancelled = true; unsub(); };
  }, [deps]);
  ```

---

## 5. Discipline System

- Disciplines are stored in the `disciplines` Firestore collection, managed by `DisciplineFactory`
- **Never hardcode** discipline names, durations, or IDs in pages or components
- Use the `useDisciplines()` hook to access discipline data in React components
- The fallback `FALLBACK_DISCIPLINES` in `hooks/useDisciplines.js` exists only for SSR/loading states
- `specialRule` values: `null` | `'triple_under'` | `'relay'`
- `sessionMode` in the counter is derived from `currentDisc.specialRule`:
  - no rule → `'individual'`
  - `'triple_under'` → `'triple_under'`
  - `'relay'` → `'relay'`

---

## 6. Announcements & Push System

- `AnnouncementFactory.subscribeForUser(groupIds, callback)` slices `groupIds` to 30 — this is a Firestore `array-contains-any` limit; do not pass more than 30
- Push notifications are triggered server-side only via `pages/api/push/send.js` — never call the web-push library from client code
- Broadcast tokens `__ALL_USERS__` and `__ALL_CLUBADMINS__` are special `groupId` values handled in the push API — treat them as reserved strings
- The `AnnouncementFactory` schema requires `startsAt` and `expiresAt` — the `isLive()` helper in both `announcements.js` and `AnnouncementsWidget.js` gates visibility

---

## 7. Known Footguns — Do Not Reintroduce

- **Stale closures in RAF/animation loops**: values that change during a running loop must be stored in refs (`useRef`), not state
- **`triggerPostSessionFlow` double-call**: guarded by `postSessionRunningRef.current` — do not remove this guard or call the function from more than one place
- **`createMediaElementSource` single-call**: the `BeepDetector` checks `_attached` before attaching to a video element — calling it twice on the same element throws a browser error
- **Badge `consecutiveWeeks` trigger**: the current implementation uses ISO week numbers without year boundaries — any change must account for year rollovers
- **`uid` vs `memberId` confusion**: passing a Firebase Auth UID where a ClubMember ID is expected (or vice versa) silently creates wrong data paths — always be explicit about which identifier you are using
- **React state batching in fast loops**: use refs for values written inside `requestAnimationFrame` callbacks and only call `setState` for UI updates at a controlled rate

---

## 8. API Routes

- `pages/api/` files use `firebase-admin` (server SDK) — never use the client SDK in API routes
- The Admin SDK is initialised with a guard: `if (!getApps().length)` — do not remove this
- Sensitive environment variables (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `VAPID_PRIVATE_KEY`) are server-only — never reference them in client-side code or expose them in responses
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is the only push-related variable safe for the client

---

## 9. Styling Conventions

- All styling is inline CSS objects (`style={{ }}`) — no Tailwind, no CSS modules, no external CSS files
- Background colour for pages: `#0f172a`
- Card/panel background: `#1e293b`
- Border colour: `#334155`
- The app uses Dutch UI strings — all user-facing text must be in Dutch
- Code identifiers, comments, and this rules file are in English

---

## 10. Deployment & File Structure

- Framework: Next.js with the **Pages Router** — do not use the App Router
- Deployment: Vercel — keep all environment variables in the Vercel dashboard and `.env.local`
- The GitHub online editor is the primary editing environment — keep changes focused and self-contained
- `next.config.js` uses `next-pwa` with a custom `swSrc: 'public/sw.js'` — do not let build tooling overwrite the service worker
