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
  saveSessionHistory: (uid, sessionData) =>
    addDoc(collection(db, `users/${uid}/sessionHistory`), {
      discipline: sessionData.discipline,
      sessionType: sessionData.sessionType,
      score: sessionData.score,
      avgBpm: sessionData.avgBpm,
      maxBpm: sessionData.maxBpm,
      sessionStart: sessionData.sessionStart,
      sessionEnd: serverTimestamp(),
      telemetry: sessionData.telemetry || []
    }),

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

  // ── Badge management (superadmin) ──

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

  // All badges (superadmin)
  getAll: (callback) =>
    onSnapshot(collection(db, 'badges'), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  // Global + club-specific badges for a given club
  getForClub: (clubId, callback) =>
    onSnapshot(collection(db, 'badges'), (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(all.filter(b => b.isActive && (b.scope === 'global' || b.clubId === clubId)));
    }),

  // All active global badges only
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

  // ── Earned badges ──

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

  // Get earned badges for multiple users at once (for leaderboard)
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

  // ── Automatic badge checking ──
  // Returns array of newly awarded badges (for celebration UI)
  checkAndAward: async (uid, sessionData, sessionHistory) => {
    // Load all active badges
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

      // Speed / score trigger
      if (t.minScore != null) {
        const discMatch = !t.discipline || t.discipline === 'any' || t.discipline === sessionData.discipline;
        const typeMatch = !t.sessionType || t.sessionType === 'any' || t.sessionType === sessionData.sessionType;
        if (discMatch && typeMatch && (sessionData.score || 0) >= t.minScore) {
          earned = true;
        }
      }

      // First session of a discipline
      if (!earned && t.firstSession) {
        const discSessions = sessionHistory.filter(s => s.discipline === t.discipline);
        if (discSessions.length <= 1 && sessionData.discipline === t.discipline) {
          earned = true;
        }
      }

      // Total sessions milestone
      if (!earned && t.totalSessions != null) {
        if (sessionHistory.length >= t.totalSessions) earned = true;
      }

      // Consecutive weeks
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

  // Seed default badges (call once from superadmin)
  seedDefaults: async () => {
    const defaults = [
      // First session badges
      { name: 'Eerste Sprong', description: 'Eerste 30 seconden sessie geregistreerd', emoji: '🌱', category: 'milestone', type: 'automatic', scope: 'global', trigger: { firstSession: true, discipline: '30sec' } },
      { name: 'Eerste Marathon', description: 'Eerste 2 minuten sessie geregistreerd', emoji: '🌿', category: 'milestone', type: 'automatic', scope: 'global', trigger: { firstSession: true, discipline: '2min' } },
      { name: 'Eerste Uithouding', description: 'Eerste 3 minuten sessie geregistreerd', emoji: '🌳', category: 'milestone', type: 'automatic', scope: 'global', trigger: { firstSession: true, discipline: '3min' } },

      // Session milestone badges
      { name: '10 Sessies', description: '10 sessies voltooid', emoji: '🔟', category: 'milestone', type: 'automatic', scope: 'global', trigger: { totalSessions: 10 } },
      { name: '50 Sessies', description: '50 sessies voltooid', emoji: '💪', category: 'milestone', type: 'automatic', scope: 'global', trigger: { totalSessions: 50 } },
      { name: '100 Sessies', description: '100 sessies voltooid', emoji: '🏆', category: 'milestone', type: 'automatic', scope: 'global', trigger: { totalSessions: 100 } },

      // Consistency
      { name: 'Wekelijkse Krijger', description: '5 weken op rij getraind', emoji: '🗓️', category: 'consistency', type: 'automatic', scope: 'global', trigger: { consecutiveWeeks: 5 } },

      // Speed badges — 30sec
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
