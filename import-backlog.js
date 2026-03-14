#!/usr/bin/env node
/**
 * MySpeedCoach — GitHub Backlog Importer
 *
 * Usage:
 *   node import-backlog.js --token ghp_xxx --repo owner/repo-name
 *
 * Requirements:
 *   node >= 18  (uses native fetch)
 *
 * What it does:
 *   1. Creates all labels (skips if already exists)
 *   2. Creates all issues with labels, in dependency order
 *   3. Prints a summary with the created issue URLs
 */

// ─── Parse CLI args ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};

const TOKEN = getArg('--token');
const REPO  = getArg('--repo');  // e.g. "myorg/myspeedcoach"

if (!TOKEN || !REPO) {
  console.error('Usage: node import-backlog.js --token <PAT> --repo <owner/repo>');
  process.exit(1);
}

const API = 'https://api.github.com';
const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

// ─── Helper ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gh(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    // 422 on label create = already exists, that's fine
    if (res.status === 422 && path.includes('/labels')) return null;
    throw new Error(`GitHub API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ─── Labels ────────────────────────────────────────────────────────────────────
const LABELS = [
  { name: 'epic',            color: '0052CC', description: 'Top-level feature group' },
  { name: 'feature',         color: '0075CA', description: 'Concrete buildable feature' },
  { name: 'user story',      color: 'CFE2FF', description: 'End-user scenario' },
  { name: 'auth',            color: 'E4B8F0', description: 'Authentication related' },
  { name: 'calendar',        color: 'B2DFDB', description: 'Agenda / events' },
  { name: 'badges',          color: 'FFD700', description: 'Badge system' },
  { name: 'disciplines',     color: 'C8E6C9', description: 'Rope skipping disciplines' },
  { name: 'counter',         color: 'FFECB3', description: 'Counting session flow' },
  { name: 'user-management', color: 'FCE4EC', description: 'Users, athletes, guardians' },
  { name: 'coach',           color: 'FFF3E0', description: 'Coach-specific features' },
  { name: 'S',               color: 'E1F5FE', description: 'Small — 1-2 days' },
  { name: 'M',               color: 'FFF9C4', description: 'Medium — 3-5 days' },
  { name: 'L',               color: 'FFE0B2', description: 'Large — 1-2 weeks' },
  { name: 'XL',              color: 'FFCDD2', description: 'Extra large — needs breakdown' },
];

// ─── Issues ────────────────────────────────────────────────────────────────────
// Each issue: { title, body, labels[] }
// Body uses GitHub markdown — checkboxes render natively.
const ISSUES = [

  // ══════════════════════════════════════════════════════
  // EPIC 1 — User Authentication
  // ══════════════════════════════════════════════════════
  {
    title: '🔐 EPIC: User Authentication',
    labels: ['epic', 'auth'],
    body: `Replace the current cookie-based "pick your name" login with real accounts. Users log in with email + password (or OAuth). This unblocks privacy, multi-device use and parental account linking.

**Contains:**
- Feature 1.1 — Email & password authentication
- Feature 1.2 — Google / OAuth SSO
- User Story 1.3 — Returning user recognised across devices
- User Story 1.4 — Club admin can invite users by email`,
  },

  {
    title: 'Feature 1.1 — Email & password authentication',
    labels: ['feature', 'auth', 'M'],
    body: `Introduce Firebase Authentication so each user has a verified identity tied to their Firestore \`users\` document.

## Acceptance criteria
- [ ] User can register with first name, last name, email and password
- [ ] User can log in with email + password
- [ ] User can reset their password via email link
- [ ] On successful login the existing \`msc_uid\` cookie is replaced by the Firebase Auth UID
- [ ] \`UserFactory.create\` is called on first login to provision the Firestore document if it does not yet exist
- [ ] Logout clears the Firebase Auth session and the cookie
- [ ] All existing pages redirect to \`/login\` when no authenticated session is present`,
  },

  {
    title: 'Feature 1.2 — Google / OAuth single sign-on',
    labels: ['feature', 'auth', 'S'],
    body: `Add Google Sign-In as an alternative login method.

**Depends on:** Feature 1.1

## Acceptance criteria
- [ ] "Sign in with Google" button appears on the login screen
- [ ] On first OAuth login a new Firestore user document is provisioned
- [ ] On subsequent logins the existing document is loaded
- [ ] Email is pre-filled and read-only if provided by the OAuth provider`,
  },

  {
    title: 'User Story 1.3 — Returning user is recognised across devices',
    labels: ['user story', 'auth', 'S'],
    body: `**Depends on:** Feature 1.1

> *As a skipper, I want my profile, records and badges to be available on any device I log into, so that I am not locked to one phone.*

## Acceptance criteria
- [ ] Logging in on a second device shows the same profile, records and session history
- [ ] HRM device assignment persists per user, not per browser`,
  },

  {
    title: 'User Story 1.4 — Club admin can invite users by email',
    labels: ['user story', 'auth', 'coach', 'M'],
    body: `**Depends on:** Feature 1.1

> *As a club admin, I want to invite new members by email so they can create their account and be automatically linked to my club.*

## Acceptance criteria
- [ ] Superadmin / clubadmin can enter an email address and send an invite
- [ ] Invited user receives an email with a sign-up link that pre-fills their club
- [ ] After registration the user appears in the join requests list as pre-approved
- [ ] Invite link expires after 7 days`,
  },

  // ══════════════════════════════════════════════════════
  // EPIC 2 — Calendar & Agenda
  // ══════════════════════════════════════════════════════
  {
    title: '📅 EPIC: Calendar & Agenda',
    labels: ['epic', 'calendar'],
    body: `Give skippers and coaches a shared calendar for upcoming trainings and events. This fills the current placeholder \`/agenda\` page.

**Contains:**
- Feature 2.1 — Calendar data model & Firestore schema
- Feature 2.2 — Monthly calendar view
- Feature 2.3 — Event creation & editing (coach / admin)
- User Story 2.4 — Skipper sees upcoming training on home screen`,
  },

  {
    title: 'Feature 2.1 — Calendar data model & Firestore schema',
    labels: ['feature', 'calendar', 'S'],
    body: `Define the Firestore schema for events and wire it into \`dbSchema.js\`.

## Schema
\`\`\`
events/{eventId}
  title: string
  description: string
  type: "training" | "competition" | "other"
  clubId: string
  groupIds: string[]
  startTime: timestamp
  endTime: timestamp
  location: string
  createdBy: uid
  createdAt: timestamp
\`\`\`

## Acceptance criteria
- [ ] \`EventFactory\` added to \`dbSchema.js\` with \`create\`, \`update\`, \`delete\`, \`getByClub\`, \`getByGroup\` and \`subscribeUpcoming\` methods
- [ ] Firestore security rules allow clubadmin / superadmin to write, members to read their group's events`,
  },

  {
    title: 'Feature 2.2 — Monthly calendar view',
    labels: ['feature', 'calendar', 'M'],
    body: `Replace the \`/agenda\` placeholder with a real monthly calendar UI.

**Depends on:** Feature 2.1

## Acceptance criteria
- [ ] Calendar renders the current month with week rows
- [ ] Events appear as coloured pills on their date (training = blue, competition = orange, other = gray)
- [ ] Tapping / clicking an event opens a detail sheet (title, time, location, description)
- [ ] User can navigate to previous / next month
- [ ] Only events for the user's groups are shown
- [ ] Empty state shown when no events exist for the month`,
  },

  {
    title: 'Feature 2.3 — Event creation & editing (coach / admin)',
    labels: ['feature', 'calendar', 'coach', 'M'],
    body: `Club admins and coaches can create, edit and delete events from the calendar.

**Depends on:** Feature 2.2

## Acceptance criteria
- [ ] "Add event" button is visible only to users with coach or admin role
- [ ] Creation form includes: title, type, date, start/end time, location, description, target groups
- [ ] Edited events update in real time for all members
- [ ] Deleted events are removed immediately
- [ ] Confirmation dialog is shown before deletion`,
  },

  {
    title: 'User Story 2.4 — Skipper sees upcoming training on home screen',
    labels: ['user story', 'calendar', 'S'],
    body: `**Depends on:** Feature 2.2

> *As a skipper, I want to see my next scheduled training on my home screen so I always know when to show up.*

## Acceptance criteria
- [ ] Home page (\`/\`) shows a "Next training" card if an event exists in the next 7 days
- [ ] Card shows date, time and location
- [ ] Tapping the card navigates to the full agenda
- [ ] Card is hidden if no upcoming events exist`,
  },

  // ══════════════════════════════════════════════════════
  // EPIC 3 — Badge Management by Coaches
  // ══════════════════════════════════════════════════════
  {
    title: '🎖️ EPIC: Badge Management by Coaches',
    labels: ['epic', 'badges', 'coach'],
    body: `Allow coaches to award manual badges to skippers directly from the counter page and from a dedicated view, without needing superadmin access.

**Contains:**
- Feature 3.1 — Coach badge award flow in counter page
- Feature 3.2 — Coach badge management screen
- User Story 3.3 — Skipper is notified when a badge is awarded`,
  },

  {
    title: 'Feature 3.1 — Coach badge award flow in counter page',
    labels: ['feature', 'badges', 'coach', 'S'],
    body: `After finishing a counted session, the coach can immediately award a manual badge to the skipper.

## Acceptance criteria
- [ ] A "Badge uitreiken" button appears on the post-session screen in \`/counter\`
- [ ] Button is only shown when the counting user has \`isCoach: true\` for that group
- [ ] Tapping the button opens the existing \`AwardBadgeModal\` pre-filled with the skipper's name
- [ ] Only badges scoped to \`manual\` and active are shown
- [ ] Success confirmation is shown after awarding`,
  },

  {
    title: 'Feature 3.2 — Coach badge management screen',
    labels: ['feature', 'badges', 'coach', 'M'],
    body: `A dedicated screen where a coach can see all skippers in their group and award or revoke manual badges.

**Depends on:** Feature 3.1

## Acceptance criteria
- [ ] Accessible from the "More" sidebar for users with coach access
- [ ] Lists all skippers in the coach's group(s)
- [ ] For each skipper, shows their earned badges and an "Uitreiken" button
- [ ] Coach can revoke a manually awarded badge with a confirmation step
- [ ] Coach cannot award or revoke automatic (system) badges
- [ ] Superadmin retains full badge management in the existing \`/superadmin\` panel`,
  },

  {
    title: 'User Story 3.3 — Skipper is notified when a badge is awarded',
    labels: ['user story', 'badges', 'S'],
    body: `**Depends on:** Feature 3.1

> *As a skipper, I want to see a celebration notification the next time I open the app after a coach awards me a badge, so the moment feels meaningful.*

## Acceptance criteria
- [ ] Manual badge awards trigger the existing \`CelebrationOverlay\` on the home page on next visit
- [ ] The overlay shows the badge image / emoji, name, and the coach's name
- [ ] Works for both self-earned (automatic) and coach-awarded badges`,
  },

  // ══════════════════════════════════════════════════════
  // EPIC 4 — Extended Badge Library
  // ══════════════════════════════════════════════════════
  {
    title: '🏅 EPIC: Extended Badge Library',
    labels: ['epic', 'badges'],
    body: `Expand the badge catalogue with more variety and difficulty tiers to keep motivation high over time.

**Contains:**
- Feature 4.1 — Seed additional default badges
- Feature 4.2 — Badge rarity / tier display`,
  },

  {
    title: 'Feature 4.1 — Seed additional default badges',
    labels: ['feature', 'badges', 'S'],
    body: `Extend \`BadgeFactory.seedDefaults()\` with new badge definitions.

## New badges

| Badge | Discipline | Trigger | Emoji |
|---|---|---|---|
| Eerste 2 min | 2min | firstSession | 🌿 |
| Eerste 3 min | 3min | firstSession | 🌳 |
| 25 Sessies | any | totalSessions: 25 | 🔆 |
| 200 Sessies | any | totalSessions: 200 | 🦅 |
| 10 Weken op rij | any | consecutiveWeeks: 10 | 🔥 |
| Vlieg (2min ≥ 120) | 2min | minScore: 120 | 🪰 |
| Raket (2min ≥ 140) | 2min | minScore: 140 | 🚀 |
| Komeet (3min ≥ 180) | 3min | minScore: 180 | ☄️ |
| Supernova (3min ≥ 200) | 3min | minScore: 200 | 💥 |
| Wedstrijddebutant | Wedstrijd | firstSession, type: Wedstrijd | 🏟️ |
| Podium | Wedstrijd | score ≥ personal best | 🥇 |

## Acceptance criteria
- [ ] All new badges added to \`seedDefaults()\`
- [ ] Running \`seedDefaults()\` again is idempotent (check by name before inserting)
- [ ] New badges appear in the \`/achievements\` badge tab`,
  },

  {
    title: 'Feature 4.2 — Badge rarity / tier display',
    labels: ['feature', 'badges', 'S'],
    body: `Add a \`rarity\` field to the badge schema and show a visual indicator on earned badges.

**Depends on:** Feature 4.1

## Acceptance criteria
- [ ] \`rarity\` field added to badge schema: \`common | rare | epic | legendary\` (default: \`common\`)
- [ ] Badge item component shows a coloured ring matching rarity: gray / blue / purple / gold
- [ ] Rarity label shown in the badge tooltip
- [ ] Filter chip added to badge tab: "Legendary" etc.`,
  },

  // ══════════════════════════════════════════════════════
  // EPIC 5 — Extended Disciplines
  // ══════════════════════════════════════════════════════
  {
    title: '🪢 EPIC: Extended Disciplines',
    labels: ['epic', 'disciplines'],
    body: `Add Double Unders, Triple Unders and a free-form "Vrije Sessie" discipline.

**Contains:**
- Feature 5.1 — Data model changes for new disciplines
- Feature 5.2 — New disciplines selectable in counter & config modal
- Feature 5.3 — New disciplines in goals & records`,
  },

  {
    title: 'Feature 5.1 — Data model changes for new disciplines',
    labels: ['feature', 'disciplines', 'S'],
    body: `Extend discipline constants and ensure all pages that reference them are updated.

## Changes required
- Add \`'du'\` (Double Unders), \`'tu'\` (Triple Unders), \`'free'\` (Vrije Sessie) to \`DISCIPLINE_DURATION\`
- \`free\` has no fixed duration (open-ended)
- Update \`DISC_LABELS\`: \`{ du: 'Double Unders', tu: 'Triple Unders', free: 'Vrij' }\`
- No Firestore migration needed — discipline is already a free-form string

## Acceptance criteria
- [ ] Constants updated in all pages referencing \`DISCIPLINE_DURATION\` and \`DISC_LABELS\`
- [ ] Existing sessions are unaffected
- [ ] \`free\` discipline renders without a countdown timer`,
  },

  {
    title: 'Feature 5.2 — New disciplines selectable in counter & config modal',
    labels: ['feature', 'disciplines', 'counter', 'S'],
    body: `**Depends on:** Feature 5.1

## Acceptance criteria
- [ ] Double Unders, Triple Unders and Vrije Sessie appear in the discipline toggle in \`/counter\`
- [ ] For Vrije Sessie the timer shows elapsed time (counting up) instead of a countdown
- [ ] Session type (Training / Wedstrijd) still applies to all new disciplines
- [ ] Records and history correctly label sessions with the new discipline names`,
  },

  {
    title: 'Feature 5.3 — New disciplines in goals & records',
    labels: ['feature', 'disciplines', 'S'],
    body: `**Depends on:** Feature 5.2

## Acceptance criteria
- [ ] Goal creation on \`/achievements\` lists all disciplines including new ones
- [ ] Records table on \`/achievements\` shows rows for Double Unders and Triple Unders
- [ ] Vrije Sessie shows "Beste score" as a simple metric (no fixed duration benchmark)`,
  },

  // ══════════════════════════════════════════════════════
  // EPIC 6 — Auto-stop at Time Limit
  // ══════════════════════════════════════════════════════
  {
    title: '⏱️ EPIC: Auto-stop Counting Session at Time Limit',
    labels: ['epic', 'counter'],
    body: `When the discipline's time limit is reached the session should stop automatically.

**Contains:**
- Feature 6.1 — Client-side auto-stop at discipline duration
- Feature 6.2 — Countdown warning in final 5 seconds`,
  },

  {
    title: 'Feature 6.1 — Client-side auto-stop at discipline duration',
    labels: ['feature', 'counter', 'S'],
    body: `When elapsed time reaches \`DISCIPLINE_DURATION[discipline]\`, the session stops automatically.

## Acceptance criteria
- [ ] A \`useEffect\` watches elapsed time against \`DISCIPLINE_DURATION\`
- [ ] When elapsed time ≥ duration, \`LiveSessionFactory.stopCounter\` is called automatically
- [ ] Session transitions to \`isFinished: true\` and UI shows "KLAAR"
- [ ] Brief visual cue (screen flash) and \`navigator.vibrate\` signal auto-stop
- [ ] Manual STOP before the limit still works as before
- [ ] Vrije Sessie is explicitly excluded from auto-stop`,
  },

  {
    title: 'Feature 6.2 — Countdown warning in final 5 seconds',
    labels: ['feature', 'counter', 'S'],
    body: `Give the skipper / counter a visual warning in the last 5 seconds.

**Depends on:** Feature 6.1

## Acceptance criteria
- [ ] Timer text turns orange when ≤ 5 seconds remain
- [ ] Timer text turns red and pulses when ≤ 3 seconds remain
- [ ] Warning state is visible on both the counter page and the live dashboard card`,
  },

  // ══════════════════════════════════════════════════════
  // EPIC 7 — Improved Member & User Handling
  // ══════════════════════════════════════════════════════
  {
    title: '👨‍👧 EPIC: Improved Member & User Handling (Guardian / Athlete)',
    labels: ['epic', 'user-management'],
    body: `Allow a single parent / guardian account to manage profiles for multiple athletes (e.g. underage children).

**Contains:**
- Feature 7.1 — Athlete profile schema
- Feature 7.2 — Guardian can add and switch between athlete profiles
- Feature 7.3 — Counting a session for an athlete
- User Story 7.4 — Parent can review child's progress

> **Note before building:** Consider giving each athlete a top-level \`users\` document with a \`guardianUid\` field instead of a sub-collection. This avoids changes to existing factory methods since all paths already start with \`users/{uid}\`.`,
  },

  {
    title: 'Feature 7.1 — Athlete profile schema',
    labels: ['feature', 'user-management', 'M'],
    body: `Introduce athlete profiles that are managed by a guardian user but have no login of their own.

## Proposed schema
\`\`\`
users/{guardianUid}/athletes/{athleteId}
  firstName: string
  lastName: string
  birthDate: timestamp
  notes: string
  createdAt: timestamp
\`\`\`

## Acceptance criteria
- [ ] \`AthleteFactory\` added to \`dbSchema.js\` with \`create\`, \`update\`, \`delete\`, \`getAll\` methods
- [ ] An athlete has no Firebase Auth account of their own
- [ ] Session history, records and badges stored under the athlete's path`,
  },

  {
    title: 'Feature 7.2 — Guardian can add and switch between athlete profiles',
    labels: ['feature', 'user-management', 'M'],
    body: `On the home screen, a guardian can see and switch between their own profile and any athlete profiles they manage.

**Depends on:** Feature 7.1

## Acceptance criteria
- [ ] "Mijn atleten" section appears on home screen when user has at least one athlete
- [ ] Guardian can add a new athlete (first name, last name, birthdate)
- [ ] Guardian can tap an athlete card to view that athlete's stats, records and badges
- [ ] An "active profile" indicator shows whose data is currently displayed
- [ ] Switching profiles updates all stats without a full reload
- [ ] Guardian can edit or delete an athlete profile (with confirmation)`,
  },

  {
    title: 'Feature 7.3 — Counting a session for an athlete',
    labels: ['feature', 'user-management', 'counter', 'M'],
    body: `When a guardian is selected in the counter's skipper selection screen, their managed athletes should also appear as selectable.

**Depends on:** Feature 7.2

## Acceptance criteria
- [ ] In \`/counter\` skipper grid, athletes managed by a guardian appear alongside regular skippers
- [ ] Athletes are visually distinguished (e.g. "via [guardian name]" subtitle)
- [ ] Session data is saved under the athlete's path
- [ ] Badge checks and record comparisons run against the athlete's data, not the guardian's`,
  },

  {
    title: 'User Story 7.4 — Parent can review child\'s progress',
    labels: ['user story', 'user-management', 'S'],
    body: `**Depends on:** Feature 7.2

> *As a parent, I want to switch to my child's profile and see their badges, records and session history so I can follow their progress without them needing their own phone.*

## Acceptance criteria
- [ ] Switching to an athlete profile shows that athlete's achievements, records and history
- [ ] Home screen greeting updates to show the athlete's name
- [ ] All tabs (Achievements, History) reflect the athlete's data while in that profile
- [ ] A clear "Terug naar mijn profiel" button returns to the guardian's own view`,
  },
];

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 MySpeedCoach backlog importer`);
  console.log(`   Repo: ${REPO}`);
  console.log(`   Issues to create: ${ISSUES.length}\n`);

  // 1. Create labels
  console.log('📌 Creating labels...');
  for (const label of LABELS) {
    const result = await gh('POST', `/repos/${REPO}/labels`, label);
    if (result === null) {
      console.log(`   ↩  Label already exists: ${label.name}`);
    } else {
      console.log(`   ✓  Created label: ${label.name}`);
    }
    await sleep(100);
  }

  // 2. Create issues
  console.log('\n📝 Creating issues...');
  const created = [];
  for (const issue of ISSUES) {
    const result = await gh('POST', `/repos/${REPO}/issues`, {
      title: issue.title,
      body: issue.body,
      labels: issue.labels,
    });
    console.log(`   ✓  #${result.number} — ${issue.title}`);
    console.log(`       ${result.html_url}`);
    created.push({ number: result.number, title: issue.title, url: result.html_url });
    // Stay well within GitHub's rate limit (secondary: 30 requests/min for issue creation)
    await sleep(2200);
  }

  // 3. Summary
  console.log('\n✅ Done! Created issues:\n');
  for (const i of created) {
    console.log(`  #${i.number.toString().padStart(3, ' ')}  ${i.url}`);
  }
  console.log(`\nNext step: open your GitHub Project board and add the issues from the backlog column.`);
  console.log(`           You can bulk-add them via: Project → + Add items → search "is:issue"\n`);
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
