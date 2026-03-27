import { db, rtdb } from '../firebaseConfig';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc,
  deleteDoc, query, where, orderBy, serverTimestamp, addDoc, onSnapshot
} from "firebase/firestore";
import { ref, set, update, remove, onValue, runTransaction, push } from "firebase/database";

export const SCHEMA = {
  firestore: {
    users: {
      firstName: "string",
      lastName: "string",
      email: "string",
      role: "superadmin|clubadmin|user",
      lastVisited: "timestamp",
      assignedDevice: {
        deviceId: "string",
        deviceName: "string",
        lastConnection: "timestamp"
      },
      heartrateZones: [{ name: "string", min: "number", max: "number", color: "string" }],
    },

    // Feature 8.1
    "clubs/{clubId}/members/{memberId}": {
      firstName: "string",
      lastName: "string",
      birthDate: "timestamp|null",
      notes: "string",
      skipperType: "competitive|recreative|null",
      isStaff:     "boolean",
      createdAt: "timestamp",
      createdBy: "uid",
      sessionHistory: {
        discipline:     "string",   // Firestore discipline document ID
        disciplineName: "string",   // discipline.name — used for badge matching
        ropeType:       "SR|DD",    // discipline.ropeType — used for badge matching
        sessionType:    "string",
        score:          "number",
        avgBpm:         "number",
        maxBpm:         "number",
        sessionStart:   "timestamp",
        sessionEnd:     "timestamp",
        countedBy:      "string|null",
        countedByName:  "string|null",
        telemetry: [{ time: "number", steps: "number", heartRate: "number" }]
      },
      records: {
        discipline:     "string",
        disciplineName: "string",
        ropeType:       "SR|DD",
        sessionType:    "string",
        score:          "number",
        achievedAt:     "timestamp",
        telemetry: [{ time: "number", steps: "number", heartRate: "number" }]
      },
      earnedBadges: {
        badgeId:       "string",
        badgeName:     "string",
        badgeEmoji:    "string",
        badgeImageUrl: "string",
        badgeCategory: "string",
        earnedAt:      "timestamp",
        awardedBy:     "system|coachUid",
        awardedByName: "string",
        sessionId:     "string|null",
        note:          "string",
      },
      // Goals moved to sub-collection clubs/{clubId}/members/{memberId}/goals
      // managed exclusively through GoalFactory
    },

    // Feature 8.2
    userMemberLinks: {
      uid:          "string",
      clubId:       "string",
      memberId:     "string",
      relationship: "self|parent|guardian|other",
      canEdit:       "boolean",
      canViewHealth: "boolean",
      createdAt:    "timestamp",
      approvedBy:   "uid|null",
    },

    badges: {
      name:        "string",
      description: "string",
      emoji:       "string",
      imageUrl:    "string",
      type:        "automatic|manual",
      scope:       "global|club",
      clubId:      "string|null",
      category:    "speed|milestone|consistency|skill",
      trigger: {
        // New fields (discipline-name based)
        disciplineName: "string",   // discipline.name or 'any'
        ropeType:       "SR|DD|any",
        // Trigger kinds (one of these will be set)
        minScore:         "number|null",
        firstSession:     "boolean|null",
        totalSessions:    "number|null",
        consecutiveWeeks: "number|null",
        sessionType:      "Training|Wedstrijd|any",
      },
      isActive:  "boolean",
      createdAt: "timestamp",
    },

    disciplines: {
      name:                "string",
      ropeType:            "SR|DD",
      durationSeconds:     "number|null",
      teamSize:            "number",
      isIndividual:        "boolean",
      specialRule:         "null|'triple_under'|'relay'",
      skippersCount:       "number",
      isActive:            "boolean",
      hasCompetitiveLabel: "boolean",
      sortOrder:           "number",
      createdAt:           "timestamp",
    },

    clubs: {
      name:    "string",
      logoUrl: "string",
      groups: {
        name:    "string",
        useHRM:  "boolean",
        isActive:"boolean",
        members: {
          memberId:        "string",
          isSkipper:       "boolean",
          isCoach:         "boolean",
          startMembership: "timestamp",
          endMembership:   "timestamp"
        }
      }
    },

    // Goals sub-collection (managed by GoalFactory)
    "clubs/{clubId}/members/{memberId}/goals": {
      discipline:     "string",   // Firestore discipline document ID
      disciplineName: "string",   // human-readable name for display
      targetScore:    "number",
      targetDate:     "timestamp|null",
      achievedAt:     "timestamp|null",
      createdAt:      "timestamp",
    },

    "clubs/{clubId}/seasons/{seasonId}": {
      name:        "string",
      startDate:   "timestamp",
      endDate:     "timestamp",
      createdAt:   "timestamp",
      createdBy:   "uid",
      isAbandoned: "boolean",
    },
 
    "clubs/{clubId}/seasons/{seasonId}/memberLabels/{memberId}": {
      memberId:       "string",
      labelType:      "allround|per_discipline",
      allroundLabel:  "A|B|C|null",
      disciplines:    [{ disciplineId: "string", label: "A|B|C" }],
      updatedAt:      "timestamp",
      updatedBy:      "uid",
      seasonStartDay:   "number",   // 1–31
      seasonStartMonth: "number",   // 1–12
    },

    clubJoinRequests: {
      uid:             "string",
      firstName:       "string",
      lastName:        "string",
      email:           "string",
      clubId:          "string",
      clubName:        "string",
      message:         "string",
      status:          "pending|approved|rejected",
      rejectionReason: "string",
      createdAt:       "timestamp",
      resolvedAt:      "timestamp|null",
      hidden:          "boolean"
    },

    countedSessions: {
      counterUid:      "string",
      counterName:     "string",
      skipperMemberId: "string",
      skipperClubId:   "string",
      discipline:      "string",
      disciplineName:  "string",
      ropeType:        "SR|DD",
      sessionType:     "string",
      score:           "number",
      sessionEnd:      "timestamp",
    },

    // Feature 12.1
    announcements: {
      title:      "string",
      body:       "string",
      type:       "info|cancel|reminder|result",
      clubId:     "string",
      groupIds:   ["string"],
      authorUid:  "string",
      authorName: "string",
      pinned:     "boolean",
      expiresAt:  "timestamp|null",
      createdAt:  "timestamp",
      updatedAt:  "timestamp",
    },
  },
  rtdb: {
    live_sessions: {
      "$uid": {
        bpm: "number",
        lastHeartbeat: "timestamp",
        connectionStatus: "online|offline",
        session: {
          isActive:    "boolean",
          isFinished:  "boolean",
          startTime:   "timestamp",
          steps:       "number",
          discipline:  "string",
          sessionType: "training|wedstrijd",
          lastStepTime:"timestamp",
          telemetry: [{ time: "number", steps: "number", heartRate: "number" }]
        }
      }
    }
  }
};

// ==========================================
// 1. USER FACTORY
// ==========================================
export const UserFactory = {
  create: async (uid, userData) => {
    const defaultZones = [
      { name: 'Warm-up',   min: 0,   max: 120, color: '#94a3b8' },
      { name: 'Fat Burn',  min: 120, max: 145, color: '#22c55e' },
      { name: 'Aerobic',   min: 145, max: 165, color: '#facc15' },
      { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
      { name: 'Red Line',  min: 185, max: 250, color: '#ef4444' }
    ];
    return setDoc(doc(db, "users", uid), {
      ...userData,
      role: userData.role || 'user',
      heartrateZones: defaultZones,
      createdAt: serverTimestamp(),
      assignedDevice: { deviceId: "", deviceName: "", lastConnection: null }
    });
  },

  get: (uid) => getDoc(doc(db, "users", uid)),

  getAll: (callback) => onSnapshot(collection(db, "users"), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }),

  delete: async (uid) => {
    const clubsSnap = await getDocs(collection(db, "clubs"));
    for (const clubDoc of clubsSnap.docs) {
      const groupsSnap = await getDocs(collection(db, `clubs/${clubDoc.id}/groups`));
      for (const groupDoc of groupsSnap.docs) {
        await deleteDoc(doc(db, `clubs/${clubDoc.id}/groups/${groupDoc.id}/members`, uid));
      }
    }
    await deleteDoc(doc(db, "users", uid));
    try {
      const res = await fetch('/api/delete-user', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uid }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Failed to delete Auth account:', data.error || res.status);
      }
    } catch (err) {
      console.error('Error calling /api/delete-user:', err);
    }
  },

  updateProfile:   (uid, data)  => updateDoc(doc(db, "users", uid), data),
  updateZones:     (uid, zones) => updateDoc(doc(db, "users", uid), { heartrateZones: zones }),

  assignDevice: (uid, deviceId, deviceName) =>
    updateDoc(doc(db, "users", uid), {
      "assignedDevice.deviceId":       deviceId,
      "assignedDevice.deviceName":     deviceName,
      "assignedDevice.lastConnection": serverTimestamp()
    }),

  getLastVisited: async (uid) => {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data().lastVisited || null) : null;
  },

  updateLastVisited: (uid) =>
    updateDoc(doc(db, 'users', uid), { lastVisited: serverTimestamp() }),
};

// ==========================================
// 2. CLUB & GROUP FACTORIES
// ==========================================

export const ClubFactory = {
  create: (data) => addDoc(collection(db, "clubs"), { ...data, createdAt: serverTimestamp() }),
  getAll: (callback) => onSnapshot(collection(db, "clubs"), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }),
  getById: (clubId) => getDoc(doc(db, "clubs", clubId)),
  update:  (clubId, data) => updateDoc(doc(db, "clubs", clubId), data),
  delete:  async (clubId) => {
    const groupsSnap = await getDocs(collection(db, `clubs/${clubId}/groups`));
    for (const groupDoc of groupsSnap.docs) {
      const membersSnap = await getDocs(collection(db, `clubs/${clubId}/groups/${groupDoc.id}/members`));
      for (const memberDoc of membersSnap.docs) {
        await deleteDoc(doc(db, `clubs/${clubId}/groups/${groupDoc.id}/members`, memberDoc.id));
      }
      await deleteDoc(doc(db, `clubs/${clubId}/groups`, groupDoc.id));
    }
    return deleteDoc(doc(db, "clubs", clubId));
  }
};

export const GroupFactory = {
  create: (clubId, groupData) =>
    addDoc(collection(db, `clubs/${clubId}/groups`), { ...groupData, isActive: true }),

  update: (clubId, groupId, data) =>
    updateDoc(doc(db, `clubs/${clubId}/groups`, groupId), data),

  delete: async (clubId, groupId) => {
    const membersSnap = await getDocs(collection(db, `clubs/${clubId}/groups/${groupId}/members`));
    for (const memberDoc of membersSnap.docs) {
      await deleteDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, memberDoc.id));
    }
    return deleteDoc(doc(db, `clubs/${clubId}/groups`, groupId));
  },

  addMember: (clubId, groupId, memberId, memberData) =>
    setDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, memberId), {
      memberId,
      isSkipper:       memberData.isSkipper       ?? true,
      isCoach:         memberData.isCoach         ?? false,
      startMembership: memberData.startMembership || serverTimestamp(),
      endMembership:   memberData.endMembership   || null,
    }),

  updateMember: (clubId, groupId, memberId, data) =>
    updateDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, memberId), data),

  removeMember: (clubId, groupId, memberId) =>
    deleteDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, memberId)),

  getMemberCount: (clubId, groupId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/groups/${groupId}/members`), (snap) => {
      callback(snap.size);
    }),

  getGroupsByClub: (clubId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/groups`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  getMembersByGroup: (clubId, groupId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/groups/${groupId}/members`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  getSkippersByGroup: (clubId, groupId, callback) => {
    const q = query(
      collection(db, `clubs/${clubId}/groups/${groupId}/members`),
      where("isSkipper", "==", true)
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  getGroupsByClubOnce: async (clubId) => {
    const snap = await getDocs(collection(db, `clubs/${clubId}/groups`));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getMembersByGroupOnce: async (clubId, groupId) => {
    const snap = await getDocs(
      collection(db, `clubs/${clubId}/groups/${groupId}/members`)
    );
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};

// ==========================================
// 3. REALTIME DATABASE FACTORIES
// ==========================================

export const LiveSessionFactory = {
  syncHeartbeat: (uid, bpm, status = "online") =>
    update(ref(rtdb, `live_sessions/${uid}`), {
      bpm, lastHeartbeat: Date.now(), connectionStatus: status
    }),

  startCounter: (uid, discipline, sessionType) =>
    update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: false, isFinished: false, startTime: null,
      steps: 0, discipline, sessionType,
      lastStepTime: null, telemetry: []
    }),

  incrementSteps: (uid, currentBpm, firstTapTime) => {
    const stepRef = ref(rtdb, `live_sessions/${uid}/session/steps`);
    const stepPromise = runTransaction(stepRef, (current) => (current || 0) + 1);
    const now = Date.now();
    const metaUpdate = { lastStepTime: now };
    if (firstTapTime) { metaUpdate.startTime = firstTapTime; metaUpdate.isActive = true; }
    const metaPromise = update(ref(rtdb, `live_sessions/${uid}/session`), metaUpdate);
    const telPoint = { time: now, heartRate: currentBpm || 0 };
    const telPromise = push(ref(rtdb, `live_sessions/${uid}/session/telemetry`), telPoint);
    return Promise.all([stepPromise, metaPromise, telPromise]);
  },

  stopCounter: (uid) =>
    update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: false, isFinished: true, lastStepTime: Date.now()
    }),

  resetSession: (uid) =>
    update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: false, isFinished: false, steps: 0,
      startTime: null, lastStepTime: null, telemetry: []
    }),

  getSessionOnce: (uid) =>
    new Promise((resolve) => {
      onValue(ref(rtdb, `live_sessions/${uid}/session`), (snap) => resolve(snap.val()), { onlyOnce: true });
    }),

  getBpmOnce: (uid) =>
    new Promise((resolve) => {
      onValue(ref(rtdb, `live_sessions/${uid}/bpm`), (snap) => resolve(snap.val() || 0), { onlyOnce: true });
    }),

  subscribeToSession: (uid, callback) =>
    onValue(ref(rtdb, `live_sessions/${uid}/session`), (snap) => callback(snap.val())),

  subscribeToLive: (uid, callback) =>
    onValue(ref(rtdb, `live_sessions/${uid}`), (snap) => callback(snap.val())),
};

// ==========================================
// 4. CLUB JOIN REQUEST FACTORY
// ==========================================

export const ClubJoinRequestFactory = {
  create: (uid, userData, clubId, clubName, message = '') =>
    addDoc(collection(db, 'clubJoinRequests'), {
      uid, firstName: userData.firstName || '', lastName: userData.lastName || '',
      email: userData.email || '', clubId, clubName, message,
      status: 'pending', rejectionReason: '', hidden: false,
      createdAt: serverTimestamp(), resolvedAt: null,
    }),

  getByUser: (uid, callback) => {
    const q = query(collection(db, 'clubJoinRequests'), where('uid', '==', uid));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  getAllPending: (callback) => {
    const q = query(collection(db, 'clubJoinRequests'), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  getAll: (callback) =>
    onSnapshot(collection(db, 'clubJoinRequests'), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  approve: (requestId) =>
    updateDoc(doc(db, 'clubJoinRequests', requestId), {
      status: 'approved', rejectionReason: '', resolvedAt: serverTimestamp(),
    }),

  reject: (requestId, reason) =>
    updateDoc(doc(db, 'clubJoinRequests', requestId), {
      status: 'rejected', rejectionReason: reason || 'Geen reden opgegeven.',
      resolvedAt: serverTimestamp(),
    }),

  hide:   (requestId) => updateDoc(doc(db, 'clubJoinRequests', requestId), { hidden: true }),
  unhide: (requestId) => updateDoc(doc(db, 'clubJoinRequests', requestId), { hidden: false }),
  delete: (requestId) => deleteDoc(doc(db, 'clubJoinRequests', requestId)),
};

// ==========================================
// 5. BADGE FACTORY
// ==========================================

export const BadgeFactory = {

  create: (badgeData) =>
    addDoc(collection(db, 'badges'), {
      name:        badgeData.name        || '',
      description: badgeData.description || '',
      emoji:       badgeData.emoji       || '🏅',
      imageUrl:    badgeData.imageUrl    || '',
      type:        badgeData.type        || 'automatic',
      scope:       badgeData.scope       || 'global',
      clubId:      badgeData.clubId      || null,
      category:    badgeData.category    || 'skill',
      trigger:     badgeData.trigger     || null,
      isActive:    true,
      createdAt:   serverTimestamp(),
    }),

  update: (badgeId, data) => updateDoc(doc(db, 'badges', badgeId), data),
  delete: (badgeId)       => deleteDoc(doc(db, 'badges', badgeId)),

  getAll: (callback) =>
    onSnapshot(collection(db, 'badges'), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  getForClub: (clubId, callback) =>
    onSnapshot(collection(db, 'badges'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(all.filter(b => b.isActive && (b.scope === 'global' || b.clubId === clubId)));
    }),

  getGlobal: (callback) => {
    const q = query(
      collection(db, 'badges'),
      where('scope',    '==', 'global'),
      where('isActive', '==', true)
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  award: (clubId, memberId, badgeData, awardedBy = 'system', awardedByName = 'Systeem', sessionId = null, note = '') =>
    addDoc(collection(db, `clubs/${clubId}/members/${memberId}/earnedBadges`), {
      badgeId:       badgeData.id,
      badgeName:     badgeData.name,
      badgeEmoji:    badgeData.emoji    || '🏅',
      badgeImageUrl: badgeData.imageUrl || '',
      badgeCategory: badgeData.category || 'skill',
      earnedAt:      serverTimestamp(),
      awardedBy,
      awardedByName,
      sessionId,
      note,
    }),

  getEarned: (clubId, memberId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/members/${memberId}/earnedBadges`), (snap) => {
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.earnedAt?.seconds || 0) - (a.earnedAt?.seconds || 0));
      callback(sorted);
    }),

  getEarnedForMembers: async (members) => {
    const results = {};
    await Promise.all(members.map(async ({ clubId, memberId }) => {
      const snap = await getDocs(
        collection(db, `clubs/${clubId}/members/${memberId}/earnedBadges`)
      );
      results[memberId] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }));
    return results;
  },

  hasEarned: async (clubId, memberId, badgeId) => {
    const q = query(
      collection(db, `clubs/${clubId}/members/${memberId}/earnedBadges`),
      where('badgeId', '==', badgeId)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  },

  revokeEarned: (clubId, memberId, earnedBadgeId) =>
    deleteDoc(doc(db, `clubs/${clubId}/members/${memberId}/earnedBadges`, earnedBadgeId)),

  // ── Updated checkAndAward — matches on disciplineName + ropeType ──────────
  // sessionData must include: { score, discipline, disciplineName, ropeType, sessionType }
  // Falls back to matching on raw discipline ID for old sessions without disciplineName.
  checkAndAward: async (clubId, memberId, sessionData, sessionHistory) => {
    const badgesSnap = await getDocs(query(
      collection(db, 'badges'),
      where('isActive', '==', true),
      where('type',     '==', 'automatic')
    ));
    const allBadges = badgesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const awarded = [];

    for (const badge of allBadges) {
      if (!badge.trigger) continue;

      const alreadyHas = await BadgeFactory.hasEarned(clubId, memberId, badge.id);
      if (alreadyHas) continue;

      const t = badge.trigger;

      // ── Discipline matching ───────────────────────────────────────────────
      // Support both new (disciplineName) and legacy (discipline) trigger fields.
      const triggerName = t.disciplineName || t.discipline || 'any';
      const triggerRope = t.ropeType || 'any';

      const discMatch =
        triggerName === 'any' ||
        triggerName === sessionData.disciplineName ||
        triggerName === sessionData.discipline; // legacy fallback for old sessions

      const ropeMatch =
        triggerRope === 'any' ||
        triggerRope === sessionData.ropeType;

      const typeMatch =
        !t.sessionType ||
        t.sessionType === 'any' ||
        t.sessionType === sessionData.sessionType;

      let earned = false;

      // minScore trigger
      if (t.minScore != null) {
        if (discMatch && ropeMatch && typeMatch && (sessionData.score || 0) >= t.minScore) {
          earned = true;
        }
      }

      // firstSession trigger
      if (!earned && t.firstSession) {
        if (discMatch && ropeMatch && typeMatch) {
          const discSessions = sessionHistory.filter(s =>
            s.disciplineName === sessionData.disciplineName ||
            s.discipline     === sessionData.discipline
          );
          // Current session is already in history after save, so ≤1 means it's the first
          if (discSessions.length <= 1) earned = true;
        }
      }

      // totalSessions trigger
      if (!earned && t.totalSessions != null) {
        if (sessionHistory.length >= t.totalSessions) earned = true;
      }

      // consecutiveWeeks trigger
      if (!earned && t.consecutiveWeeks != null) {
        const getWeekNumber = (date) => {
          const d = new Date(date);
          const startOfYear = new Date(d.getFullYear(), 0, 1);
          return Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        };
        const weekNumbers = sessionHistory
          .map(s => s.sessionEnd?.seconds ? getWeekNumber(s.sessionEnd.seconds * 1000) : null)
          .filter(Boolean);
        const uniqueWeeks = [...new Set(weekNumbers)].sort((a, b) => a - b);
        let maxConsec = 1, curConsec = 1;
        for (let i = 1; i < uniqueWeeks.length; i++) {
          if (uniqueWeeks[i] === uniqueWeeks[i - 1] + 1) {
            curConsec++;
            maxConsec = Math.max(maxConsec, curConsec);
          } else {
            curConsec = 1;
          }
        }
        if (maxConsec >= t.consecutiveWeeks) earned = true;
      }

      if (earned) {
        try {
          await BadgeFactory.award(clubId, memberId, badge, 'system', 'Systeem', null);
          awarded.push(badge);
        } catch (e) {
          console.error('Failed to award badge:', badge.name, e);
        }
      }
    }
    return awarded;
  },

  // ── Full badge catalogue seeded from official IJRU disciplines ────────────
  // Thresholds are calibrated against real world records:
  //   SRSS WR = 119  |  SRSE (3 min) WR = 584  |  SRTU WR = 560
  //   SRSR WR ~450   |  SRDR WR = 190           |  DDSS WR ~130
  //   DDSR WR = 416
  // Running seedDefaults again is safe — badges are skipped if the name exists.
  seedDefaults: async () => {
    const existing = await getDocs(collection(db, 'badges'));
    const existingNames = new Set(existing.docs.map(d => d.data().name));

    const defaults = [

      // ── Milestone: first session per discipline ──────────────────────────
      {
        name: 'Eerste Sprong', emoji: '🌱',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste Speed Sprint sessie voltooid',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', firstSession: true, sessionType: 'any' },
      },
      {
        name: 'Eerste Uithouder', emoji: '🌿',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste Endurance 2 min sessie voltooid',
        trigger: { disciplineName: 'Endurance 2 min', ropeType: 'SR', firstSession: true, sessionType: 'any' },
      },
      {
        name: 'Eerste Marathonloper', emoji: '🌳',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste Endurance 3 min sessie voltooid',
        trigger: { disciplineName: 'Endurance 3 min', ropeType: 'SR', firstSession: true, sessionType: 'any' },
      },
      {
        name: 'Drievoudige Droom', emoji: '3️⃣',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste Triple Under poging geregistreerd',
        trigger: { disciplineName: 'Triple Under', ropeType: 'SR', firstSession: true, sessionType: 'any' },
      },
      {
        name: 'Teamspeler', emoji: '🤝',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste Speed Relay 4 sessie meegedaan',
        trigger: { disciplineName: 'Speed Relay 4', ropeType: 'SR', firstSession: true, sessionType: 'any' },
      },
      {
        name: 'Duo Debutant', emoji: '👯',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste Double Unders Relay sessie voltooid',
        trigger: { disciplineName: 'Double Under', ropeType: 'SR', firstSession: true, sessionType: 'any' },
      },
      {
        name: 'Dutch Courage', emoji: '🌀',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste Double Dutch Speed Sprint sessie voltooid',
        trigger: { disciplineName: 'DD Speed Sprint', ropeType: 'DD', firstSession: true, sessionType: 'any' },
      },
      {
        name: 'DD Teamlid', emoji: '🎪',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste Double Dutch Speed Relay sessie meegedaan',
        trigger: { disciplineName: 'DD Speed Relay', ropeType: 'DD', firstSession: true, sessionType: 'any' },
      },
      {
        name: 'Wedstrijddebutant', emoji: '🏟️',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: 'Eerste officiële wedstrijdsessie geregistreerd',
        trigger: { disciplineName: 'any', ropeType: 'any', firstSession: true, sessionType: 'Wedstrijd' },
      },

      // ── Milestone: total session counts ─────────────────────────────────
      {
        name: 'Beginner', emoji: '🔰',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: '5 sessies voltooid',
        trigger: { disciplineName: 'any', ropeType: 'any', totalSessions: 5 },
      },
      {
        name: 'Vaste Springer', emoji: '🔟',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: '10 sessies voltooid',
        trigger: { disciplineName: 'any', ropeType: 'any', totalSessions: 10 },
      },
      {
        name: 'Toegewijde', emoji: '💪',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: '25 sessies voltooid',
        trigger: { disciplineName: 'any', ropeType: 'any', totalSessions: 25 },
      },
      {
        name: 'Halfhonderd', emoji: '🏅',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: '50 sessies voltooid',
        trigger: { disciplineName: 'any', ropeType: 'any', totalSessions: 50 },
      },
      {
        name: 'Eeuweling', emoji: '🏆',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: '100 sessies voltooid',
        trigger: { disciplineName: 'any', ropeType: 'any', totalSessions: 100 },
      },
      {
        name: 'IJzeren Springer', emoji: '🦾',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: '200 sessies voltooid',
        trigger: { disciplineName: 'any', ropeType: 'any', totalSessions: 200 },
      },
      {
        name: 'Legende', emoji: '👑',
        category: 'milestone', type: 'automatic', scope: 'global',
        description: '500 sessies voltooid — ware toewijding',
        trigger: { disciplineName: 'any', ropeType: 'any', totalSessions: 500 },
      },

      // ── Consistency: consecutive weeks ───────────────────────────────────
      {
        name: 'Weekstarter', emoji: '📅',
        category: 'consistency', type: 'automatic', scope: 'global',
        description: '3 weken op rij getraind',
        trigger: { disciplineName: 'any', ropeType: 'any', consecutiveWeeks: 3 },
      },
      {
        name: 'Wekelijkse Krijger', emoji: '🗓️',
        category: 'consistency', type: 'automatic', scope: 'global',
        description: '5 weken op rij getraind',
        trigger: { disciplineName: 'any', ropeType: 'any', consecutiveWeeks: 5 },
      },
      {
        name: 'IJzeren Wil', emoji: '🔥',
        category: 'consistency', type: 'automatic', scope: 'global',
        description: '10 weken op rij getraind',
        trigger: { disciplineName: 'any', ropeType: 'any', consecutiveWeeks: 10 },
      },
      {
        name: 'Onstopbaar', emoji: '⚔️',
        category: 'consistency', type: 'automatic', scope: 'global',
        description: '20 weken op rij getraind',
        trigger: { disciplineName: 'any', ropeType: 'any', consecutiveWeeks: 20 },
      },
      {
        name: 'Seizoensveteraan', emoji: '🌟',
        category: 'consistency', type: 'automatic', scope: 'global',
        description: '40 weken op rij getraind — een heel seizoen',
        trigger: { disciplineName: 'any', ropeType: 'any', consecutiveWeeks: 40 },
      },

      // ── Speed Sprint (SRSS 1×30s) — IJRU WR = 119 ───────────────────────
      {
        name: 'Haas', emoji: '🐇',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '40 stappen in Speed Sprint — eerste echte snelheid',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 40, sessionType: 'any' },
      },
      {
        name: 'Vos', emoji: '🦊',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '50 stappen in Speed Sprint',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 50, sessionType: 'any' },
      },
      {
        name: 'Gazelle', emoji: '🦌',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '60 stappen in Speed Sprint — clubniveau',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 60, sessionType: 'any' },
      },
      {
        name: 'Cheetah', emoji: '🐆',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '70 stappen in Speed Sprint',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 70, sessionType: 'any' },
      },
      {
        name: 'Bliksem', emoji: '⚡',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '80 stappen in Speed Sprint — sterk regionaal niveau',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 80, sessionType: 'any' },
      },
      {
        name: 'Tornado', emoji: '🌪️',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '90 stappen in Speed Sprint — nationaal niveau',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 90, sessionType: 'any' },
      },
      {
        name: 'Raket', emoji: '🚀',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '100 stappen in Speed Sprint — top nationaal',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 100, sessionType: 'any' },
      },
      {
        name: 'Supersonisch', emoji: '💥',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '110 stappen in Speed Sprint — internationaal niveau',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 110, sessionType: 'any' },
      },
      {
        name: 'Lichtsnelheid', emoji: '💫',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '119 stappen in Speed Sprint — wereldrecordniveau',
        trigger: { disciplineName: 'Speed Sprint', ropeType: 'SR', minScore: 119, sessionType: 'any' },
      },

      // ── Endurance 2 min ──────────────────────────────────────────────────
      {
        name: 'Volhouder', emoji: '🏃',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '80 stappen in Endurance 2 min',
        trigger: { disciplineName: 'Endurance 2 min', ropeType: 'SR', minScore: 80, sessionType: 'any' },
      },
      {
        name: 'Loper', emoji: '🏃‍♂️',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '120 stappen in Endurance 2 min — clubniveau',
        trigger: { disciplineName: 'Endurance 2 min', ropeType: 'SR', minScore: 120, sessionType: 'any' },
      },
      {
        name: 'Doorzetter', emoji: '💚',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '160 stappen in Endurance 2 min',
        trigger: { disciplineName: 'Endurance 2 min', ropeType: 'SR', minScore: 160, sessionType: 'any' },
      },
      {
        name: 'Marathonvlieg', emoji: '🪰',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '200 stappen in Endurance 2 min — sterk regionaal',
        trigger: { disciplineName: 'Endurance 2 min', ropeType: 'SR', minScore: 200, sessionType: 'any' },
      },
      {
        name: 'Marathonraket', emoji: '🛸',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '240 stappen in Endurance 2 min — nationaal niveau',
        trigger: { disciplineName: 'Endurance 2 min', ropeType: 'SR', minScore: 240, sessionType: 'any' },
      },
      {
        name: 'Marathonlegende', emoji: '🌠',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '290 stappen in Endurance 2 min — internationaal niveau',
        trigger: { disciplineName: 'Endurance 2 min', ropeType: 'SR', minScore: 290, sessionType: 'any' },
      },

      // ── Endurance 3 min (SRSE 1×180s) — IJRU WR = 584 ───────────────────
      {
        name: 'IJzersterk', emoji: '💪',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '120 stappen in Endurance 3 min',
        trigger: { disciplineName: 'Endurance 3 min', ropeType: 'SR', minScore: 120, sessionType: 'any' },
      },
      {
        name: 'Stalen Benen', emoji: '🦿',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '180 stappen in Endurance 3 min — clubniveau',
        trigger: { disciplineName: 'Endurance 3 min', ropeType: 'SR', minScore: 180, sessionType: 'any' },
      },
      {
        name: 'Titanium', emoji: '🔩',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '240 stappen in Endurance 3 min',
        trigger: { disciplineName: 'Endurance 3 min', ropeType: 'SR', minScore: 240, sessionType: 'any' },
      },
      {
        name: 'Onverwoestbaar', emoji: '🛡️',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '320 stappen in Endurance 3 min — sterk regionaal',
        trigger: { disciplineName: 'Endurance 3 min', ropeType: 'SR', minScore: 320, sessionType: 'any' },
      },
      {
        name: 'Fenomeen', emoji: '🌟',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '400 stappen in Endurance 3 min — nationaal niveau',
        trigger: { disciplineName: 'Endurance 3 min', ropeType: 'SR', minScore: 400, sessionType: 'any' },
      },
      {
        name: 'Endurance Elite', emoji: '👁️',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '500 stappen in Endurance 3 min — internationale top',
        trigger: { disciplineName: 'Endurance 3 min', ropeType: 'SR', minScore: 500, sessionType: 'any' },
      },
      {
        name: 'Wereldklasse', emoji: '🌍',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '584 stappen in Endurance 3 min — wereldrecordniveau',
        trigger: { disciplineName: 'Endurance 3 min', ropeType: 'SR', minScore: 584, sessionType: 'any' },
      },

      // ── Triple Under (SRTU untimed) — WR = 560 ───────────────────────────
      {
        name: 'Eerste Drie', emoji: '3️⃣',
        category: 'skill', type: 'automatic', scope: 'global',
        description: '1 Triple Under gelukt — een zeldzame vaardigheid',
        trigger: { disciplineName: 'Triple Under', ropeType: 'SR', minScore: 1, sessionType: 'any' },
      },
      {
        name: 'Triple Talent', emoji: '🎯',
        category: 'skill', type: 'automatic', scope: 'global',
        description: '10 Triple Unders aaneengesloten',
        trigger: { disciplineName: 'Triple Under', ropeType: 'SR', minScore: 10, sessionType: 'any' },
      },
      {
        name: 'Triple Twintig', emoji: '🔮',
        category: 'skill', type: 'automatic', scope: 'global',
        description: '20 Triple Unders aaneengesloten',
        trigger: { disciplineName: 'Triple Under', ropeType: 'SR', minScore: 20, sessionType: 'any' },
      },
      {
        name: 'Triple Master', emoji: '🏅',
        category: 'skill', type: 'automatic', scope: 'global',
        description: '50 Triple Unders aaneengesloten — uitzonderlijk',
        trigger: { disciplineName: 'Triple Under', ropeType: 'SR', minScore: 50, sessionType: 'any' },
      },
      {
        name: 'Triple Honderd', emoji: '💯',
        category: 'skill', type: 'automatic', scope: 'global',
        description: '100 Triple Unders — nationaal topper',
        trigger: { disciplineName: 'Triple Under', ropeType: 'SR', minScore: 100, sessionType: 'any' },
      },
      {
        name: 'Triple Legende', emoji: '👑',
        category: 'skill', type: 'automatic', scope: 'global',
        description: '300 Triple Unders — wereld top 10',
        trigger: { disciplineName: 'Triple Under', ropeType: 'SR', minScore: 300, sessionType: 'any' },
      },
      {
        name: 'Triple Immortal', emoji: '⚗️',
        category: 'skill', type: 'automatic', scope: 'global',
        description: '560 Triple Unders — wereldrecordniveau',
        trigger: { disciplineName: 'Triple Under', ropeType: 'SR', minScore: 560, sessionType: 'any' },
      },

      // ── Speed Relay 4×30 (SRSR) — WR ~450 ───────────────────────────────
      {
        name: 'Relayteam', emoji: '🤜',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '160 stappen in Speed Relay 4×30 — teamstart',
        trigger: { disciplineName: 'Speed Relay 4', ropeType: 'SR', minScore: 160, sessionType: 'any' },
      },
      {
        name: 'Snelle Wissel', emoji: '🔄',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '220 stappen in Speed Relay 4×30 — clubniveau',
        trigger: { disciplineName: 'Speed Relay 4', ropeType: 'SR', minScore: 220, sessionType: 'any' },
      },
      {
        name: 'Relayraketten', emoji: '🚀',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '300 stappen in Speed Relay 4×30 — regionaal niveau',
        trigger: { disciplineName: 'Speed Relay 4', ropeType: 'SR', minScore: 300, sessionType: 'any' },
      },
      {
        name: 'Relay Elite', emoji: '🥇',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '380 stappen in Speed Relay 4×30 — nationaal niveau',
        trigger: { disciplineName: 'Speed Relay 4', ropeType: 'SR', minScore: 380, sessionType: 'any' },
      },
      {
        name: 'Relay Champions', emoji: '🏆',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '450 stappen in Speed Relay 4×30 — wereldrecordniveau',
        trigger: { disciplineName: 'Speed Relay 4', ropeType: 'SR', minScore: 450, sessionType: 'any' },
      },

      // ── Double Unders Relay (SRDR 2×30s) — WR = 190 ─────────────────────
      {
        name: 'Duo Starter', emoji: '👯‍♂️',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '40 stappen in Double Unders Relay',
        trigger: { disciplineName: 'Double Under', ropeType: 'SR', minScore: 40, sessionType: 'any' },
      },
      {
        name: 'Duo Kracht', emoji: '💪',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '80 stappen in Double Unders Relay — clubniveau',
        trigger: { disciplineName: 'Double Under', ropeType: 'SR', minScore: 80, sessionType: 'any' },
      },
      {
        name: 'Duo Snelheid', emoji: '⚡',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '120 stappen in Double Unders Relay — regionaal',
        trigger: { disciplineName: 'Double Under', ropeType: 'SR', minScore: 120, sessionType: 'any' },
      },
      {
        name: 'Duo Champions', emoji: '🎖️',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '160 stappen in Double Unders Relay — nationaal',
        trigger: { disciplineName: 'Double Under', ropeType: 'SR', minScore: 160, sessionType: 'any' },
      },
      {
        name: 'Duo Wereldtop', emoji: '🌍',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '190 stappen in Double Unders Relay — wereldrecord',
        trigger: { disciplineName: 'Double Under', ropeType: 'SR', minScore: 190, sessionType: 'any' },
      },

      // ── DD Speed Sprint (DDSS 1×60s) — WR ~130 ──────────────────────────
      {
        name: 'DD Debutant', emoji: '🌀',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '25 stappen in DD Speed Sprint — welkom in de draden',
        trigger: { disciplineName: 'DD Speed Sprint', ropeType: 'DD', minScore: 25, sessionType: 'any' },
      },
      {
        name: 'DD Ritme', emoji: '🎵',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '40 stappen in DD Speed Sprint',
        trigger: { disciplineName: 'DD Speed Sprint', ropeType: 'DD', minScore: 40, sessionType: 'any' },
      },
      {
        name: 'DD Specialist', emoji: '🎪',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '60 stappen in DD Speed Sprint — clubniveau',
        trigger: { disciplineName: 'DD Speed Sprint', ropeType: 'DD', minScore: 60, sessionType: 'any' },
      },
      {
        name: 'DD Artiest', emoji: '🎭',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '80 stappen in DD Speed Sprint — regionaal niveau',
        trigger: { disciplineName: 'DD Speed Sprint', ropeType: 'DD', minScore: 80, sessionType: 'any' },
      },
      {
        name: 'DD Kampioen', emoji: '🏅',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '100 stappen in DD Speed Sprint — nationaal niveau',
        trigger: { disciplineName: 'DD Speed Sprint', ropeType: 'DD', minScore: 100, sessionType: 'any' },
      },
      {
        name: 'DD Elite', emoji: '💎',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '120 stappen in DD Speed Sprint — internationale top',
        trigger: { disciplineName: 'DD Speed Sprint', ropeType: 'DD', minScore: 120, sessionType: 'any' },
      },
      {
        name: 'DD Wereldster', emoji: '🌠',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '130 stappen in DD Speed Sprint — wereldrecordniveau',
        trigger: { disciplineName: 'DD Speed Sprint', ropeType: 'DD', minScore: 130, sessionType: 'any' },
      },

      // ── DD Speed Relay (DDSR 4×30s) — WR = 416 ──────────────────────────
      {
        name: 'DD Relay Start', emoji: '🌀',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '120 stappen in DD Speed Relay — teamwork begint',
        trigger: { disciplineName: 'DD Speed Relay', ropeType: 'DD', minScore: 120, sessionType: 'any' },
      },
      {
        name: 'DD Relay Vlam', emoji: '🔥',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '200 stappen in DD Speed Relay — clubniveau',
        trigger: { disciplineName: 'DD Speed Relay', ropeType: 'DD', minScore: 200, sessionType: 'any' },
      },
      {
        name: 'DD Relay Kracht', emoji: '⚡',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '280 stappen in DD Speed Relay — regionaal niveau',
        trigger: { disciplineName: 'DD Speed Relay', ropeType: 'DD', minScore: 280, sessionType: 'any' },
      },
      {
        name: 'DD Relay Elite', emoji: '🥇',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '350 stappen in DD Speed Relay — nationaal niveau',
        trigger: { disciplineName: 'DD Speed Relay', ropeType: 'DD', minScore: 350, sessionType: 'any' },
      },
      {
        name: 'DD Relay Champions', emoji: '🏆',
        category: 'speed', type: 'automatic', scope: 'global',
        description: '416 stappen in DD Speed Relay — wereldrecordniveau',
        trigger: { disciplineName: 'DD Speed Relay', ropeType: 'DD', minScore: 416, sessionType: 'any' },
      },
    ];

    for (const badge of defaults) {
      if (!existingNames.has(badge.name)) {
        await addDoc(collection(db, 'badges'), {
          ...badge,
          imageUrl:  '',
          isActive:  true,
          createdAt: serverTimestamp(),
        });
      }
    }
  },
};

// ==========================================
// 6. COUNTER BADGE FACTORY
// ==========================================

export const CounterBadgeFactory = {
  getCountedSessions: async (counterUid) => {
    const q = query(collection(db, 'countedSessions'), where('counterUid', '==', counterUid));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  checkAndAward: async (counterUid, newSession) => {
    const allCounted = await CounterBadgeFactory.getCountedSessions(counterUid);
    const awarded = [];
    const badgesSnap = await getDocs(query(
      collection(db, 'badges'),
      where('isActive', '==', true),
      where('type',     '==', 'automatic'),
      where('scope',    '==', 'counter')
    ));
    const counterBadges = badgesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    for (const badge of counterBadges) {
      const alreadyHas = await getDocs(query(
        collection(db, `users/${counterUid}/earnedBadges`),
        where('badgeId', '==', badge.id)
      )).then(s => !s.empty);
      if (alreadyHas) continue;

      const t = badge.trigger;
      let earned = false;
      if (t?.totalSessionsCounted != null && allCounted.length >= t.totalSessionsCounted) earned = true;
      if (!earned && t?.firstSessionCounted) {
        const discCounted = allCounted.filter(s =>
          s.disciplineName === newSession.disciplineName ||
          s.discipline     === newSession.discipline
        );
        if (discCounted.length <= 1) earned = true;
      }

      if (earned) {
        try {
          await addDoc(collection(db, `users/${counterUid}/earnedBadges`), {
            badgeId: badge.id, badgeName: badge.name, badgeEmoji: badge.emoji || '🏅',
            badgeImageUrl: badge.imageUrl || '', badgeCategory: badge.category || 'skill',
            earnedAt: serverTimestamp(), awardedBy: 'system', awardedByName: 'Systeem',
            sessionId: null, note: '',
          });
          awarded.push(badge);
        } catch (e) {
          console.error('Failed to award counter badge:', badge.name, e);
        }
      }
    }
    return awarded;
  },
};

// ==========================================
// 7. CLUB MEMBER FACTORY
// ==========================================

export const ClubMemberFactory = {
  create: (clubId, data, createdByUid) =>
    addDoc(collection(db, `clubs/${clubId}/members`), {
      firstName: data.firstName || '',
      lastName:  data.lastName  || '',
      birthDate: data.birthDate || null,
      notes:     data.notes     || '',
      createdAt: serverTimestamp(),
      createdBy: createdByUid   || null,
    }),

  getById: (clubId, memberId) =>
    getDoc(doc(db, `clubs/${clubId}/members`, memberId)),

  getAll: (clubId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/members`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  search: (clubId, nameQuery, callback) => {
    const lower = nameQuery.toLowerCase().trim();
    return onSnapshot(collection(db, `clubs/${clubId}/members`), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(lower ? all.filter(m => `${m.firstName} ${m.lastName}`.toLowerCase().includes(lower)) : all);
    });
  },

  update: (clubId, memberId, data) =>
    updateDoc(doc(db, `clubs/${clubId}/members`, memberId), data),

  delete: async (clubId, memberId) => {
    const groupsSnap = await getDocs(collection(db, `clubs/${clubId}/groups`));
    for (const groupDoc of groupsSnap.docs) {
      const memberRef = doc(db, `clubs/${clubId}/groups/${groupDoc.id}/members`, memberId);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) await deleteDoc(memberRef);
    }
    const linksSnap = await getDocs(
      query(collection(db, 'userMemberLinks'), where('clubId', '==', clubId), where('memberId', '==', memberId))
    );
    for (const linkDoc of linksSnap.docs) await deleteDoc(linkDoc.ref);
    return deleteDoc(doc(db, `clubs/${clubId}/members`, memberId));
  },

  // ── Session history — now stores disciplineName + ropeType ───────────────
  saveSessionHistory: (clubId, memberId, sessionData) => {
    const historyPromise = addDoc(
      collection(db, `clubs/${clubId}/members/${memberId}/sessionHistory`),
      {
        discipline:     sessionData.discipline,
        disciplineName: sessionData.disciplineName || sessionData.discipline,
        ropeType:       sessionData.ropeType       || 'SR',
        sessionType:    sessionData.sessionType,
        score:          sessionData.score,
        avgBpm:         sessionData.avgBpm   ?? 0,
        maxBpm:         sessionData.maxBpm   ?? 0,
        sessionStart:   sessionData.sessionStart || null,
        sessionEnd:     serverTimestamp(),
        countedBy:      sessionData.countedBy     || null,
        countedByName:  sessionData.countedByName || null,
        telemetry:      sessionData.telemetry     || [],
      }
    );

    if (sessionData.countedBy) {
      addDoc(collection(db, 'countedSessions'), {
        counterUid:      sessionData.countedBy,
        counterName:     sessionData.countedByName || '',
        skipperMemberId: memberId,
        skipperClubId:   clubId,
        discipline:      sessionData.discipline,
        disciplineName:  sessionData.disciplineName || sessionData.discipline,
        ropeType:        sessionData.ropeType || 'SR',
        sessionType:     sessionData.sessionType,
        score:           sessionData.score,
        sessionEnd:      serverTimestamp(),
      });
    }
    return historyPromise;
  },

  getSessionHistory: (clubId, memberId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/members/${memberId}/sessionHistory`), (snap) => {
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.sessionEnd?.seconds || 0) - (a.sessionEnd?.seconds || 0));
      callback(sorted);
    }),

  getSessionHistoryOnce: async (clubId, memberId) => {
    const snap = await getDocs(collection(db, `clubs/${clubId}/members/${memberId}/sessionHistory`));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.sessionEnd?.seconds || 0) - (a.sessionEnd?.seconds || 0));
  },

  addRecord: (clubId, memberId, recordData) =>
    addDoc(collection(db, `clubs/${clubId}/members/${memberId}/records`), {
      discipline:     recordData.discipline,
      disciplineName: recordData.disciplineName || recordData.discipline,
      ropeType:       recordData.ropeType       || 'SR',
      sessionType:    recordData.sessionType,
      score:          recordData.score,
      achievedAt:     serverTimestamp(),
      telemetry:      recordData.telemetry || [],
    }),

  getBestRecord: async (clubId, memberId, discipline, sessionType) => {
    const q = query(
      collection(db, `clubs/${clubId}/members/${memberId}/records`),
      where('discipline', '==', discipline),
      where('sessionType', '==', sessionType)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .reduce((best, r) => (!best || r.score > best.score) ? r : best, null);
  },

  subscribeToRecords: (clubId, memberId, discipline, sessionType, callback) => {
    const q = query(
      collection(db, `clubs/${clubId}/members/${memberId}/records`),
      where('discipline', '==', discipline),
      where('sessionType', '==', sessionType)
    );
    return onSnapshot(q, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const best = records.reduce((b, r) => (!b || r.score > b.score) ? r : b, null);
      callback(best);
    });
  },

  getGoals: (clubId, memberId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/members/${memberId}/goals`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  markGoalAchieved: (clubId, memberId, goalId) =>
    updateDoc(doc(db, `clubs/${clubId}/members/${memberId}/goals`, goalId), { achievedAt: serverTimestamp() }),

  updateMemberType: (clubId, memberId, skipperType, isStaff) =>
    updateDoc(doc(db, `clubs/${clubId}/members`, memberId), {
      skipperType: skipperType ?? null,
      isStaff:     isStaff     ?? false,
    }),
 
  getCompetitive: (clubId, callback) =>
    onSnapshot(
      query(
        collection(db, `clubs/${clubId}/members`),
        where('skipperType', '==', 'competitive')
      ),
      (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    ),
};

// ==========================================
// 8. USER MEMBER LINK FACTORY
// ==========================================

export const UserMemberLinkFactory = {
  create: (uid, clubId, memberId, relationship = 'self', options = {}, approvedByUid = null) =>
    addDoc(collection(db, 'userMemberLinks'), {
      uid, clubId, memberId, relationship,
      canEdit:       options.canEdit       ?? (relationship === 'self'),
      canViewHealth: options.canViewHealth ?? false,
      createdAt:     serverTimestamp(),
      approvedBy:    approvedByUid,
    }),

  delete: (linkId) => deleteDoc(doc(db, 'userMemberLinks', linkId)),

  getForUser: (uid, callback) => {
    const q = query(collection(db, 'userMemberLinks'), where('uid', '==', uid));
    return onSnapshot(q, async (snap) => {
      const links = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const joined = await Promise.all(
        links.map(async (link) => {
          if (!link.memberId) return null;
          const memberSnap = await getDoc(doc(db, `clubs/${link.clubId}/members`, link.memberId));
          if (!memberSnap.exists()) return null;
          return { link, member: { id: memberSnap.id, clubId: link.clubId, ...memberSnap.data() } };
        })
      );
      callback(joined.filter(Boolean));
    });
  },

  getForMember: (clubId, memberId, callback) => {
    const q = query(
      collection(db, 'userMemberLinks'),
      where('clubId',   '==', clubId),
      where('memberId', '==', memberId)
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  updatePermissions: (linkId, permissions) =>
    updateDoc(doc(db, 'userMemberLinks', linkId), permissions),

  approve: (linkId, approvedByUid) =>
    updateDoc(doc(db, 'userMemberLinks', linkId), { approvedBy: approvedByUid }),

  getForUserInClub: async (uid, clubId) => {
    const q = query(
      collection(db, 'userMemberLinks'),
      where('uid',    '==', uid),
      where('clubId', '==', clubId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  getUidForMember: async (clubId, memberId) => {
    const q = query(
      collection(db, 'userMemberLinks'),
      where('clubId',       '==', clubId),
      where('memberId',     '==', memberId),
      where('relationship', '==', 'self')
    );
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].data().uid;
  }
};

// ==========================================
// 9. GOAL FACTORY
// ==========================================
// All goal CRUD goes through this factory — no direct Firestore calls in pages.
// Path: clubs/{clubId}/members/{memberId}/goals/{goalId}

export const GoalFactory = {
  create: (clubId, memberId, data) =>
    addDoc(collection(db, `clubs/${clubId}/members/${memberId}/goals`), {
      discipline:     data.discipline     || '',
      disciplineName: data.disciplineName || data.discipline || '',
      targetScore:    data.targetScore    || 0,
      targetDate:     data.targetDate     || null,
      achievedAt:     null,
      createdAt:      serverTimestamp(),
    }),

  update: (clubId, memberId, goalId, data) =>
    updateDoc(doc(db, `clubs/${clubId}/members/${memberId}/goals`, goalId), data),

  delete: (clubId, memberId, goalId) =>
    deleteDoc(doc(db, `clubs/${clubId}/members/${memberId}/goals`, goalId)),

  getAll: (clubId, memberId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/members/${memberId}/goals`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  markAchieved: (clubId, memberId, goalId) =>
    updateDoc(doc(db, `clubs/${clubId}/members/${memberId}/goals`, goalId), {
      achievedAt: serverTimestamp(),
    }),
};

// ==========================================
// 10. AUTH FACTORY
// ==========================================

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  updatePassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from '../firebaseConfig';

export const AuthFactory = {
  onAuthStateChanged: (callback) => onAuthStateChanged(auth, callback),
  getCurrentUser:     () => auth.currentUser,

  signInWithEmail:  (email, password) => signInWithEmailAndPassword(auth, email, password),
  signInWithGoogle: () => signInWithPopup(auth, new GoogleAuthProvider()),
  registerWithEmail:(email, password) => createUserWithEmailAndPassword(auth, email, password),

  sendEmailVerification: () => {
    const user = auth.currentUser;
    if (!user) return Promise.reject(new Error('No current user'));
    return sendEmailVerification(user);
  },

  isEmailVerified: () => auth.currentUser?.emailVerified ?? false,
  signOut:         () => signOut(auth),
  sendPasswordReset:(email) => sendPasswordResetEmail(auth, email),
  updatePassword:  (newPassword) => updatePassword(auth.currentUser, newPassword),
};

// ==========================================
// 11. ANNOUNCEMENT FACTORY
// ==========================================

export const AnnouncementFactory = {
  create: (data, authorUid, authorName) =>
    addDoc(collection(db, 'announcements'), {
      title:      data.title      || '',
      body:       data.body       || '',
      type:       data.type       || 'info',
      clubId:     data.clubId     || '',
      groupIds:   data.groupIds   || [],
      authorUid,
      authorName,
      pinned:     data.pinned     || false,
      startsAt:   data.startsAt   || null,
      expiresAt:  data.expiresAt  || null,
      createdAt:  serverTimestamp(),
      updatedAt:  serverTimestamp(),
    }),

  update: (announcementId, data) =>
    updateDoc(doc(db, 'announcements', announcementId), {
      ...data,
      updatedAt: serverTimestamp(),
    }),

  delete: (announcementId) => deleteDoc(doc(db, 'announcements', announcementId)),

  pin: (announcementId, pinned) =>
    updateDoc(doc(db, 'announcements', announcementId), { pinned, updatedAt: serverTimestamp() }),

  getForUser: async (groupIds) => {
    if (!groupIds || groupIds.length === 0) return [];
    const snap = await getDocs(
      query(
        collection(db, 'announcements'),
        where('groupIds', 'array-contains-any', groupIds.slice(0, 30))
      )
    );
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
  },

  subscribeForUser: (groupIds, callback) => {
    if (!groupIds || groupIds.length === 0) { callback([]); return () => {}; }
    return onSnapshot(
      query(
        collection(db, 'announcements'),
        where('groupIds', 'array-contains-any', groupIds.slice(0, 30))
      ),
      (snap) => {
        const items = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
        callback(items);
      },
      (err) => { console.error('AnnouncementFactory.subscribeForUser error:', err); callback([]); }
    );
  },

  subscribeForGroup: (clubId, groupId, callback) =>
    onSnapshot(
      query(
        collection(db, 'announcements'),
        where('clubId',   '==', clubId),
        where('groupIds', 'array-contains', groupId)
      ),
      (snap) => {
        const items = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
        callback(items);
      },
      (err) => { console.error('AnnouncementFactory.subscribeForGroup error:', err); callback([]); }
    ),
};

// ==========================================
// 12. DISCIPLINE FACTORY
// ==========================================

export const DisciplineFactory = {
  create: (data) =>
    addDoc(collection(db, 'disciplines'), {
      name:            data.name            || '',
      ropeType:        data.ropeType        || 'SR',
      durationSeconds: data.durationSeconds ?? null,
      teamSize:        data.teamSize        ?? 1,
      isIndividual:    data.isIndividual    ?? true,
      specialRule:     data.specialRule     || null,
      skippersCount:   data.skippersCount   ?? 1,
      isActive:        data.isActive        ?? true,
      sortOrder:       data.sortOrder       ?? 999,
      hasCompetitiveLabel: data.hasCompetitiveLabel ?? false,
      createdAt:       serverTimestamp(),
    }),

  update: (disciplineId, data) => updateDoc(doc(db, 'disciplines', disciplineId), data),
  delete: (disciplineId)       => deleteDoc(doc(db, 'disciplines', disciplineId)),

  getAll: (callback) =>
    onSnapshot(collection(db, 'disciplines'), (snap) => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      callback(docs);
    }),

  getActive: (callback) =>
    onSnapshot(collection(db, 'disciplines'), (snap) => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => d.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      callback(docs);
    }),

  getActiveOnce: async () => {
    const snap = await getDocs(collection(db, 'disciplines'));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.isActive !== false)
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  },

  seedDefaults: async () => {
    const existing = await getDocs(collection(db, 'disciplines'));
    const existingNames = new Set(existing.docs.map(d => d.data().name));

    const defaults = [
      { name: 'Speed Sprint',    ropeType: 'SR', durationSeconds: 30,  teamSize: 1, isIndividual: true,  specialRule: null,         skippersCount: 1, sortOrder: 1, hasCompetitiveLabel: true },
      { name: 'Endurance 2 min', ropeType: 'SR', durationSeconds: 120, teamSize: 1, isIndividual: true,  specialRule: null,         skippersCount: 1, sortOrder: 2, hasCompetitiveLabel: true },
      { name: 'Endurance 3 min', ropeType: 'SR', durationSeconds: 180, teamSize: 1, isIndividual: true,  specialRule: null,         skippersCount: 1, sortOrder: 3, hasCompetitiveLabel: true },
      { name: 'Triple Under',    ropeType: 'SR', durationSeconds: null, teamSize: 1, isIndividual: true,  specialRule: 'triple_under', skippersCount: 1, sortOrder: 4, hasCompetitiveLabel: true },
      { name: 'Speed Relay 2',   ropeType: 'SR', durationSeconds: 30,  teamSize: 2, isIndividual: false, specialRule: 'relay',      skippersCount: 2, sortOrder: 5 },
      { name: 'Speed Relay 4',   ropeType: 'SR', durationSeconds: 30,  teamSize: 4, isIndividual: false, specialRule: 'relay',      skippersCount: 4, sortOrder: 6 },
      { name: 'Double Under',    ropeType: 'SR', durationSeconds: 30,  teamSize: 2, isIndividual: false, specialRule: 'relay',      skippersCount: 2, sortOrder: 7 },
      { name: 'DD Speed Relay',  ropeType: 'DD', durationSeconds: 30,  teamSize: 4, isIndividual: false, specialRule: 'relay',      skippersCount: 4, sortOrder: 8 },
      { name: 'DD Speed Sprint', ropeType: 'DD', durationSeconds: 60,  teamSize: 3, isIndividual: false, specialRule: null,         skippersCount: 1, sortOrder: 9 },
      { name: 'Freestyle',       ropeType: 'SR', durationSeconds: null, teamSize: 1, isIndividual: true, specialRule: null,         skippersCount: 1, sortOrder: 10, hasCompetitiveLabel: true},
    ];

    for (const disc of defaults) {
      if (!existingNames.has(disc.name)) {
        await addDoc(collection(db, 'disciplines'), {
          ...disc, isActive: true, createdAt: serverTimestamp(),
        });
      }
    }
  },
};

// ==========================================
// 13. SEASON FACTORY
// ==========================================
 
export const SeasonFactory = {
  create: (clubId, data) =>
    addDoc(collection(db, `clubs/${clubId}/seasons`), {
      name:        data.name        || '',
      startDate:   data.startDate   || null,
      endDate:     data.endDate     || null,
      createdAt:   serverTimestamp(),
      createdBy:   data.createdBy   || null,
      isAbandoned: false,
    }),
 
  update: (clubId, seasonId, data) =>
    updateDoc(doc(db, `clubs/${clubId}/seasons`, seasonId), data),
 
  delete: (clubId, seasonId) =>
    deleteDoc(doc(db, `clubs/${clubId}/seasons`, seasonId)),
 
  getAll: (clubId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/seasons`), (snap) => {
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.startDate?.seconds || 0) - (a.startDate?.seconds || 0));
      callback(sorted);
    }),
 
  getById: (clubId, seasonId) =>
    getDoc(doc(db, `clubs/${clubId}/seasons`, seasonId)),
 
  // Returns the season whose date range covers today, if any
  getCurrent: async (clubId) => {
    const snap = await getDocs(collection(db, `clubs/${clubId}/seasons`));
    const now  = Date.now();
    const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return all.find(s => {
      if (s.isAbandoned) return false;
      const start = s.startDate?.seconds ? s.startDate.seconds * 1000 : null;
      const end   = s.endDate?.seconds   ? s.endDate.seconds   * 1000 : null;
      return start && end && start <= now && now <= end;
    }) || null;
  },
};

// ==========================================
// 14. MEMBERLABEL FACTORY
// ==========================================
 
export const MemberLabelFactory = {
  // memberId is used as the document ID for O(1) lookups
  upsert: (clubId, seasonId, memberId, data) =>
    setDoc(
      doc(db, `clubs/${clubId}/seasons/${seasonId}/memberLabels`, memberId),
      {
        memberId,
        labelType:      data.labelType      || 'per_discipline',
        allroundLabel:  data.allroundLabel  || null,
        disciplines:    data.disciplines    || [],
        updatedAt:      serverTimestamp(),
        updatedBy:      data.updatedBy      || null,
      },
      { merge: true }
    ),
 
  getForMember: async (clubId, seasonId, memberId) => {
    const snap = await getDoc(
      doc(db, `clubs/${clubId}/seasons/${seasonId}/memberLabels`, memberId)
    );
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },
 
  getForSeason: (clubId, seasonId, callback) =>
    onSnapshot(
      collection(db, `clubs/${clubId}/seasons/${seasonId}/memberLabels`),
      (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    ),
 
  delete: (clubId, seasonId, memberId) =>
    deleteDoc(
      doc(db, `clubs/${clubId}/seasons/${seasonId}/memberLabels`, memberId)
    ),
 
  // Convenience: get labels for a member across all seasons (for history view)
  getForMemberAllSeasons: async (clubId, memberId) => {
    const seasonsSnap = await getDocs(collection(db, `clubs/${clubId}/seasons`));
    const seasons = seasonsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const results = [];
    await Promise.all(seasons.map(async season => {
      const labelSnap = await getDoc(
        doc(db, `clubs/${clubId}/seasons/${season.id}/memberLabels`, memberId)
      );
      if (labelSnap.exists()) {
        results.push({ season, label: { id: labelSnap.id, ...labelSnap.data() } });
      }
    }));
    return results.sort((a, b) => (b.season.startDate?.seconds || 0) - (a.season.startDate?.seconds || 0));
  },
};
