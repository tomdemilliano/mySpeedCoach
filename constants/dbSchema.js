import { db, rtdb } from '../firebaseConfig';
import {
  collection, doc, setDoc, getDoc, getDocs, updateDoc,
  deleteDoc, query, where, serverTimestamp, addDoc, onSnapshot
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
      records: {
        sessionType: "string",
        discipline: "string",
        score: "number",
        achievedAt: "timestamp",
        telemetry: [{ time: "number", steps: "number", heartRate: "number" }]
      },
      goals: {
        discipline: "string", targetScore: "number", targetDate: "timestamp", achievedAt: "timestamp|null"
      },
      sessionHistory: {
        discipline: "string",
        sessionStart: "timestamp",
        sessionEnd: "timestamp",
        score: "number",
        avgBpm: "number",
        maxBpm: "number",
        countedBy: "string|null",
        countedByName: "string|null",
        telemetry: [{ time: "number", steps: "number", heartRate: "number" }]
      },
      earnedBadges: {
        badgeId: "string",
        badgeName: "string",
        badgeEmoji: "string",
        badgeImageUrl: "string",
        badgeCategory: "string",
        earnedAt: "timestamp",
        awardedBy: "system|coachUid",
        awardedByName: "string",
        sessionId: "string|null",
        note: "string",
      }
    },

    // ── NEW (Feature 8.1) ────────────────────────────────────────────────────
    // A ClubMember is a trackable person within a club.
    // They may or may not have a Firebase app account.
    // Training data (sessions, records, badges, goals) lives here from Feature 8.4 onwards.
    "clubs/{clubId}/members/{memberId}": {
      firstName: "string",
      lastName: "string",
      birthDate: "timestamp|null",
      notes: "string",
      createdAt: "timestamp",
      createdBy: "uid",   // uid of the coach who created the record
      // NOTE: no uid field — that relationship lives in userMemberLinks (Feature 8.2)
    },

    // ── NEW (Feature 8.2) ────────────────────────────────────────────────────
    // Connects a users/{uid} document to one or more ClubMember documents.
    // Enables one user → many members and one member → many users.
    userMemberLinks: {
      uid: "string",
      clubId: "string",
      memberId: "string",
      relationship: "self|parent|guardian|other",
      canEdit: "boolean",
      canViewHealth: "boolean",
      createdAt: "timestamp",
      approvedBy: "uid|null",  // null = self-linked on registration
    },

    badges: {
      name: "string",
      description: "string",
      emoji: "string",
      imageUrl: "string",
      type: "automatic|manual",
      scope: "global|club",
      clubId: "string|null",
      category: "speed|milestone|consistency|skill",
      trigger: {
        discipline: "30sec|2min|3min|any",
        minScore: "number|null",
        sessionType: "Training|Wedstrijd|any",
        totalSessions: "number|null",
        consecutiveWeeks: "number|null",
        firstSession: "boolean|null",
      },
      isActive: "boolean",
      createdAt: "timestamp",
    },
    clubs: {
      name: "string",
      logoUrl: "string",
      groups: {
        name: "string",
        useHRM: "boolean",
        isActive: "boolean",
        members: {
          uid: "string",
          isSkipper: "boolean",
          isCoach: "boolean",
          startMembership: "timestamp",
          endMembership: "timestamp"
        }
      }
    },
    clubJoinRequests: {
      uid: "string",
      firstName: "string",
      lastName: "string",
      email: "string",
      clubId: "string",
      clubName: "string",
      message: "string",
      status: "pending|approved|rejected",
      rejectionReason: "string",
      createdAt: "timestamp",
      resolvedAt: "timestamp|null",
      hidden: "boolean"
    },
    countedSessions: {
      counterUid: "string",
      counterName: "string",
      skipperUid: "string",
      discipline: "string",
      sessionType: "string",
      score: "number",
      sessionEnd: "timestamp",
    }
  },
  rtdb: {
    live_sessions: {
      "$uid": {
        bpm: "number",
        lastHeartbeat: "timestamp",
        connectionStatus: "online|offline",
        session: {
          isActive: "boolean",
          isFinished: "boolean",
          startTime: "timestamp",
          steps: "number",
          discipline: "30sec|2min|3min",
          sessionType: "training|wedstrijd",
          lastStepTime: "timestamp",
          telemetry: [{ time: "number", steps: "number", heartRate: "number" }]
        }
      }
    }
  }
};

// ==========================================
// 1. USER & PERSONAL DATA FACTORIES
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
    return deleteDoc(doc(db, "users", uid));
  },

  updateProfile: (uid, data) => updateDoc(doc(db, "users", uid), data),
  updateZones: (uid, zones) => updateDoc(doc(db, "users", uid), { heartrateZones: zones }),

  assignDevice: (uid, deviceId, deviceName) =>
    updateDoc(doc(db, "users", uid), {
      "assignedDevice.deviceId": deviceId,
      "assignedDevice.deviceName": deviceName,
      "assignedDevice.lastConnection": serverTimestamp()
    }),

  // ── SESSION HISTORY ──
  saveSessionHistory: (uid, sessionData) => {
    const historyPromise = addDoc(collection(db, `users/${uid}/sessionHistory`), {
      discipline: sessionData.discipline,
      sessionType: sessionData.sessionType,
      score: sessionData.score,
      avgBpm: sessionData.avgBpm,
      maxBpm: sessionData.maxBpm,
      sessionStart: sessionData.sessionStart,
      sessionEnd: serverTimestamp(),
      countedBy: sessionData.countedBy || null,
      countedByName: sessionData.countedByName || null,
      telemetry: sessionData.telemetry || []
    });
    
    // Mirror to countedSessions for counter badge queries
    if (sessionData.countedBy) {
      addDoc(collection(db, 'countedSessions'), {
        counterUid: sessionData.countedBy,
        counterName: sessionData.countedByName || '',
        skipperUid: uid,
        discipline: sessionData.discipline,
        sessionType: sessionData.sessionType,
        score: sessionData.score,
        sessionEnd: serverTimestamp(),
      });
    }
    return historyPromise;
  },

  getSessionHistory: (uid, callback) =>
    onSnapshot(collection(db, `users/${uid}/sessionHistory`), (snap) => {
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.sessionEnd?.seconds || 0) - (a.sessionEnd?.seconds || 0));
      callback(sorted);
    }),

  getSessionHistoryOnce: async (uid) => {
    const snap = await getDocs(collection(db, `users/${uid}/sessionHistory`));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.sessionEnd?.seconds || 0) - (a.sessionEnd?.seconds || 0));
  },

  // ── RECORDS ──
  addRecord: (uid, recordData) =>
    addDoc(collection(db, `users/${uid}/records`), {
      discipline: recordData.discipline,
      sessionType: recordData.sessionType,
      score: recordData.score,
      achievedAt: serverTimestamp(),
      telemetry: recordData.telemetry || []
    }),

  getBestRecord: async (uid, discipline, sessionType) => {
    const q = query(
      collection(db, `users/${uid}/records`),
      where("discipline", "==", discipline),
      where("sessionType", "==", sessionType)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return records.reduce((best, r) => (!best || r.score > best.score) ? r : best, null);
  },

  subscribeToRecords: (uid, discipline, sessionType, callback) => {
    const q = query(
      collection(db, `users/${uid}/records`),
      where("discipline", "==", discipline),
      where("sessionType", "==", sessionType)
    );
    return onSnapshot(q, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const best = records.reduce((b, r) => (!b || r.score > b.score) ? r : b, null);
      callback(best);
    });
  },

  // ── GOALS ──
  getGoals: (uid, callback) =>
    onSnapshot(collection(db, `users/${uid}/goals`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  markGoalAchieved: (uid, goalId) =>
    updateDoc(doc(db, `users/${uid}/goals`, goalId), { achievedAt: serverTimestamp() }),

  getLastVisited: async (uid) => {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data().lastVisited || null) : null;
  },

  updateLastVisited: (uid) =>
    updateDoc(doc(db, 'users', uid), {
      lastVisited: serverTimestamp(),
    }),    
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
  update: (clubId, data) => updateDoc(doc(db, "clubs", clubId), data),
  delete: async (clubId) => {
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
  addMember: (clubId, groupId, uid, memberData) =>
    setDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, uid), {
      uid,
      isSkipper: memberData.isSkipper ?? true,
      isCoach: memberData.isCoach ?? false,
      startMembership: memberData.startMembership || serverTimestamp(),
      endMembership: memberData.endMembership || null
    }),
  updateMember: (clubId, groupId, uid, data) =>
    updateDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, uid), data),
  removeMember: (clubId, groupId, uid) =>
    deleteDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, uid)),
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

  hide: (requestId) => updateDoc(doc(db, 'clubJoinRequests', requestId), { hidden: true }),
  unhide: (requestId) => updateDoc(doc(db, 'clubJoinRequests', requestId), { hidden: false }),
  delete: (requestId) => deleteDoc(doc(db, 'clubJoinRequests', requestId)),
};

// ==========================================
// 5. BADGE FACTORY
// ==========================================

export const BadgeFactory = {

  create: (badgeData) =>
    addDoc(collection(db, 'badges'), {
      name: badgeData.name || '',
      description: badgeData.description || '',
      emoji: badgeData.emoji || '🏅',
      imageUrl: badgeData.imageUrl || '',
      type: badgeData.type || 'automatic',
      scope: badgeData.scope || 'global',
      clubId: badgeData.clubId || null,
      category: badgeData.category || 'skill',
      trigger: badgeData.trigger || null,
      isActive: true,
      createdAt: serverTimestamp(),
    }),

  update: (badgeId, data) =>
    updateDoc(doc(db, 'badges', badgeId), data),

  delete: (badgeId) =>
    deleteDoc(doc(db, 'badges', badgeId)),

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
      where('scope', '==', 'global'),
      where('isActive', '==', true)
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  award: (uid, badgeData, awardedBy = 'system', awardedByName = 'Systeem', sessionId = null, note = '') =>
    addDoc(collection(db, `users/${uid}/earnedBadges`), {
      badgeId: badgeData.id,
      badgeName: badgeData.name,
      badgeEmoji: badgeData.emoji || '🏅',
      badgeImageUrl: badgeData.imageUrl || '',
      badgeCategory: badgeData.category || 'skill',
      earnedAt: serverTimestamp(),
      awardedBy,
      awardedByName,
      sessionId,
      note,
    }),

  getEarned: (uid, callback) =>
    onSnapshot(collection(db, `users/${uid}/earnedBadges`), (snap) => {
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.earnedAt?.seconds || 0) - (a.earnedAt?.seconds || 0));
      callback(sorted);
    }),

  getEarnedForUsers: async (uids) => {
    const results = {};
    await Promise.all(uids.map(async (uid) => {
      const snap = await getDocs(collection(db, `users/${uid}/earnedBadges`));
      results[uid] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }));
    return results;
  },

  hasEarned: async (uid, badgeId) => {
    const q = query(
      collection(db, `users/${uid}/earnedBadges`),
      where('badgeId', '==', badgeId)
    );
    const snap = await getDocs(q);
    return !snap.empty;
  },

  revokeEarned: (uid, earnedBadgeId) =>
    deleteDoc(doc(db, `users/${uid}/earnedBadges`, earnedBadgeId)),

  checkAndAward: async (uid, sessionData, sessionHistory) => {
    const badgesSnap = await getDocs(query(
      collection(db, 'badges'),
      where('isActive', '==', true),
      where('type', '==', 'automatic')
    ));
    const allBadges = badgesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const awarded = [];

    for (const badge of allBadges) {
      if (!badge.trigger) continue;

      const alreadyHas = await BadgeFactory.hasEarned(uid, badge.id);
      if (alreadyHas) continue;

      const t = badge.trigger;
      let earned = false;

      if (t.minScore != null) {
        const discMatch = !t.discipline || t.discipline === 'any' || t.discipline === sessionData.discipline;
        const typeMatch = !t.sessionType || t.sessionType === 'any' || t.sessionType === sessionData.sessionType;
        if (discMatch && typeMatch && (sessionData.score || 0) >= t.minScore) {
          earned = true;
        }
      }

      if (!earned && t.firstSession) {
        const discSessions = sessionHistory.filter(s => s.discipline === t.discipline);
        if (discSessions.length <= 1 && sessionData.discipline === t.discipline) {
          earned = true;
        }
      }

      if (!earned && t.totalSessions != null) {
        if (sessionHistory.length >= t.totalSessions) earned = true;
      }

      if (!earned && t.consecutiveWeeks != null) {
        const getWeekNumber = (date) => {
          const d = new Date(date);
          const startOfYear = new Date(d.getFullYear(), 0, 1);
          return Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        };
        const weekNumbers = sessionHistory
          .map(s => {
            const ts = s.sessionEnd?.seconds ? s.sessionEnd.seconds * 1000 : null;
            return ts ? getWeekNumber(ts) : null;
          })
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
          await BadgeFactory.award(uid, badge, 'system', 'Systeem', null);
          awarded.push(badge);
        } catch (e) {
          console.error('Failed to award badge:', badge.name, e);
        }
      }
    }

    return awarded;
  },

  seedDefaults: async () => {
    const defaults = [
      { name: 'Eerste Sprong', description: 'Eerste 30 seconden sessie geregistreerd', emoji: '🌱', category: 'milestone', type: 'automatic', scope: 'global', trigger: { firstSession: true, discipline: '30sec' } },
      { name: 'Eerste Marathon', description: 'Eerste 2 minuten sessie geregistreerd', emoji: '🌿', category: 'milestone', type: 'automatic', scope: 'global', trigger: { firstSession: true, discipline: '2min' } },
      { name: 'Eerste Uithouding', description: 'Eerste 3 minuten sessie geregistreerd', emoji: '🌳', category: 'milestone', type: 'automatic', scope: 'global', trigger: { firstSession: true, discipline: '3min' } },
      { name: '10 Sessies', description: '10 sessies voltooid', emoji: '🔟', category: 'milestone', type: 'automatic', scope: 'global', trigger: { totalSessions: 10 } },
      { name: '50 Sessies', description: '50 sessies voltooid', emoji: '💪', category: 'milestone', type: 'automatic', scope: 'global', trigger: { totalSessions: 50 } },
      { name: '100 Sessies', description: '100 sessies voltooid', emoji: '🏆', category: 'milestone', type: 'automatic', scope: 'global', trigger: { totalSessions: 100 } },
      { name: 'Wekelijkse Krijger', description: '5 weken op rij getraind', emoji: '🗓️', category: 'consistency', type: 'automatic', scope: 'global', trigger: { consecutiveWeeks: 5 } },
      { name: 'Haas', description: '60 stappen in 30 seconden', emoji: '🐇', category: 'speed', type: 'automatic', scope: 'global', trigger: { discipline: '30sec', minScore: 60, sessionType: 'any' } },
      { name: 'Vos', description: '70 stappen in 30 seconden', emoji: '🦊', category: 'speed', type: 'automatic', scope: 'global', trigger: { discipline: '30sec', minScore: 70, sessionType: 'any' } },
      { name: 'Gazelle', description: '80 stappen in 30 seconden', emoji: '🦌', category: 'speed', type: 'automatic', scope: 'global', trigger: { discipline: '30sec', minScore: 80, sessionType: 'any' } },
      { name: 'Cheetah', description: '90 stappen in 30 seconden', emoji: '🐆', category: 'speed', type: 'automatic', scope: 'global', trigger: { discipline: '30sec', minScore: 90, sessionType: 'any' } },
      { name: 'Bliksem', description: '100 stappen in 30 seconden', emoji: '⚡', category: 'speed', type: 'automatic', scope: 'global', trigger: { discipline: '30sec', minScore: 100, sessionType: 'any' } },
    ];

    for (const badge of defaults) {
      await addDoc(collection(db, 'badges'), {
        ...badge,
        imageUrl: '',
        isActive: true,
        createdAt: serverTimestamp(),
      });
    }
  },
};

export const CounterBadgeFactory = {
  getCountedSessions: async (counterUid) => {
    const q = query(
      collection(db, 'countedSessions'),
      where('counterUid', '==', counterUid)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  checkAndAward: async (counterUid, newSession) => {
    const allCounted = await CounterBadgeFactory.getCountedSessions(counterUid);
    const awarded = [];

    const badgesSnap = await getDocs(query(
      collection(db, 'badges'),
      where('isActive', '==', true),
      where('type', '==', 'automatic'),
      where('scope', '==', 'counter')
    ));
    const counterBadges = badgesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    for (const badge of counterBadges) {
      const alreadyHas = await BadgeFactory.hasEarned(counterUid, badge.id);
      if (alreadyHas) continue;

      const t = badge.trigger;
      let earned = false;

      if (t?.totalSessionsCounted != null) {
        if (allCounted.length >= t.totalSessionsCounted) earned = true;
      }

      if (!earned && t?.firstSessionCounted) {
        const discCounted = allCounted.filter(s => s.discipline === t.discipline);
        if (discCounted.length <= 1 && newSession.discipline === t.discipline) earned = true;
      }

      if (earned) {
        try {
          await BadgeFactory.award(counterUid, badge, 'system', 'Systeem', null);
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
// 6. CLUB MEMBER FACTORY  (Feature 8.1)
// ==========================================
// A ClubMember is a trackable person within a club.
// They may or may not have a Firebase app account.
// NOTE: training data sub-collections (sessionHistory, records, earnedBadges, goals)
// are migrated to this path in Feature 8.4 — not part of this factory yet.

export const ClubMemberFactory = {

  /**
   * Create a new ClubMember under a club.
   * @param {string} clubId
   * @param {{ firstName, lastName, birthDate?, notes? }} data
   * @param {string} createdByUid  uid of the coach creating the record
   * @returns {Promise<DocumentReference>}
   */
  create: (clubId, data, createdByUid) =>
    addDoc(collection(db, `clubs/${clubId}/members`), {
      firstName: data.firstName || '',
      lastName: data.lastName || '',
      birthDate: data.birthDate || null,
      notes: data.notes || '',
      createdAt: serverTimestamp(),
      createdBy: createdByUid || null,
      // No uid field — that relationship lives in userMemberLinks
    }),

  /**
   * Fetch a single ClubMember document.
   */
  getById: (clubId, memberId) =>
    getDoc(doc(db, `clubs/${clubId}/members`, memberId)),

  /**
   * Real-time subscription to all members of a club.
   * @param {string} clubId
   * @param {function} callback  receives array of { id, ...data }
   * @returns unsubscribe function
   */
  getAll: (clubId, callback) =>
    onSnapshot(collection(db, `clubs/${clubId}/members`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  /**
   * Client-side search helper — filters the realtime stream by name.
   * Returns an unsubscribe function; calls callback with filtered results.
   * @param {string} clubId
   * @param {string} nameQuery  case-insensitive substring match on firstName + lastName
   * @param {function} callback
   * @returns unsubscribe function
   */
  search: (clubId, nameQuery, callback) => {
    const lower = nameQuery.toLowerCase().trim();
    return onSnapshot(collection(db, `clubs/${clubId}/members`), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = lower
        ? all.filter(m =>
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(lower)
          )
        : all;
      callback(filtered);
    });
  },

  /**
   * Update profile fields on a ClubMember.
   */
  update: (clubId, memberId, data) =>
    updateDoc(doc(db, `clubs/${clubId}/members`, memberId), data),

  /**
   * Delete a ClubMember.
   * Removes the member document from all groups in the club,
   * and removes all UserMemberLinks pointing to this member.
   * NOTE: sub-collection data (sessions, records, etc.) cleanup is handled
   * in Feature 8.4 when those sub-collections are introduced.
   */
  delete: async (clubId, memberId) => {
    // Remove from all groups in this club
    const groupsSnap = await getDocs(collection(db, `clubs/${clubId}/groups`));
    for (const groupDoc of groupsSnap.docs) {
      const memberRef = doc(db, `clubs/${clubId}/groups/${groupDoc.id}/members`, memberId);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        await deleteDoc(memberRef);
      }
    }

    // Remove all UserMemberLinks pointing to this member
    const linksSnap = await getDocs(
      query(
        collection(db, 'userMemberLinks'),
        where('clubId', '==', clubId),
        where('memberId', '==', memberId)
      )
    );
    for (const linkDoc of linksSnap.docs) {
      await deleteDoc(linkDoc.ref);
    }

    // Delete the ClubMember document itself
    return deleteDoc(doc(db, `clubs/${clubId}/members`, memberId));
  },
};

// ==========================================
// 7. USER MEMBER LINK FACTORY  (Feature 8.2)
// ==========================================
// Connects a users/{uid} document to one or more ClubMember documents.
// Enables: one user → many members, one member → many users.

export const UserMemberLinkFactory = {

  /**
   * Create a link between an app user and a ClubMember.
   *
   * @param {string} uid            Firebase Auth uid of the app user
   * @param {string} clubId
   * @param {string} memberId       ClubMember document id
   * @param {'self'|'parent'|'guardian'|'other'} relationship
   * @param {{ canEdit?: boolean, canViewHealth?: boolean }} options
   *   - canEdit defaults to true only for 'self' links
   *   - canViewHealth defaults to false (requires explicit coach grant per issue #83)
   * @param {string|null} approvedByUid  null = self-linked on registration
   */
  create: (uid, clubId, memberId, relationship = 'self', options = {}, approvedByUid = null) =>
    addDoc(collection(db, 'userMemberLinks'), {
      uid,
      clubId,
      memberId,
      relationship,
      canEdit: options.canEdit ?? (relationship === 'self'),
      canViewHealth: options.canViewHealth ?? false,  // false by default, explicit grant required
      createdAt: serverTimestamp(),
      approvedBy: approvedByUid,
    }),

  /**
   * Delete a link by its document id.
   */
  delete: (linkId) =>
    deleteDoc(doc(db, 'userMemberLinks', linkId)),

  /**
   * Get all links for a given app user (across all clubs), joined with the
   * ClubMember data. Calls callback with array of { link, member } objects.
   *
   * @param {string} uid
   * @param {function} callback  receives { link, member }[]
   * @returns unsubscribe function
   */
  getForUser: (uid, callback) => {
    const q = query(collection(db, 'userMemberLinks'), where('uid', '==', uid));
    return onSnapshot(q, async (snap) => {
      const links = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Client-side join: fetch each ClubMember document
      const joined = await Promise.all(
        links.map(async (link) => {
          const memberSnap = await getDoc(
            doc(db, `clubs/${link.clubId}/members`, link.memberId)
          );
          if (!memberSnap.exists()) return null;
          return {
            link,
            member: { id: memberSnap.id, clubId: link.clubId, ...memberSnap.data() },
          };
        })
      );
      callback(joined.filter(Boolean));
    });
  },

  /**
   * Get all users linked to a specific ClubMember.
   * Useful for "who has access to this member's data?"
   *
   * @param {string} clubId
   * @param {string} memberId
   * @param {function} callback  receives link[]
   * @returns unsubscribe function
   */
  getForMember: (clubId, memberId, callback) => {
    const q = query(
      collection(db, 'userMemberLinks'),
      where('clubId', '==', clubId),
      where('memberId', '==', memberId)
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  /**
   * Update canEdit and/or canViewHealth on an existing link.
   * @param {string} linkId
   * @param {{ canEdit?: boolean, canViewHealth?: boolean }} permissions
   */
  updatePermissions: (linkId, permissions) =>
    updateDoc(doc(db, 'userMemberLinks', linkId), permissions),

  /**
   * Mark a link as approved by a coach or admin.
   * Sets approvedBy to the given uid.
   * @param {string} linkId
   * @param {string} approvedByUid
   */
  approve: (linkId, approvedByUid) =>
    updateDoc(doc(db, 'userMemberLinks', linkId), { approvedBy: approvedByUid }),
};
