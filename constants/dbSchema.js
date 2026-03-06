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
        telemetry: [{
          time: "number",
          steps: "number",
          heartRate: "number"
        }]	
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
        telemetry: [{
          time: "number",
          steps: "number",
          heartRate: "number"
        }]
      }
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
          // Live telemetry buffer (cleared after session saved)
          telemetry: [{
            time: "number",
            steps: "number",
            heartRate: "number"
          }]
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
      { name: 'Warm-up', min: 0, max: 120, color: '#94a3b8' },
      { name: 'Fat Burn', min: 120, max: 145, color: '#22c55e' },
      { name: 'Aerobic', min: 145, max: 165, color: '#facc15' },
      { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
      { name: 'Red Line', min: 185, max: 250, color: '#ef4444' }
    ];

    return setDoc(doc(db, "users", uid), {
      ...userData,
      role: userData.role || 'user',
      heartrateZones: defaultZones,
      createdAt: serverTimestamp(),
      assignedDevice: {
        deviceId: "",
        deviceName: "",
        lastConnection: null
      }
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

  // ---- SESSION HISTORY ----

  // Save a completed session with full telemetry to Firestore subcollection
  saveSessionHistory: (uid, sessionData) => 
    addDoc(collection(db, `users/${uid}/sessionHistory`), {
      discipline: sessionData.discipline,          // '30sec' | '2min' | '3min'
      sessionType: sessionData.sessionType,        // 'Training' | 'Wedstrijd'
      score: sessionData.score,
      avgBpm: sessionData.avgBpm,
      maxBpm: sessionData.maxBpm,
      sessionStart: sessionData.sessionStart,
      sessionEnd: serverTimestamp(),
      telemetry: sessionData.telemetry || []
    }),

  // Get all session history for a user (realtime)
  getSessionHistory: (uid, callback) =>
    onSnapshot(collection(db, `users/${uid}/sessionHistory`), (snap) => {
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.sessionEnd?.seconds || 0;
          const bTime = b.sessionEnd?.seconds || 0;
          return bTime - aTime;
        });
      callback(sorted);
    }),

  // ---- RECORDS ----

  // Add a new record entry (does NOT replace — appends to subcollection)
  // discipline: '30sec' | '2min' | '3min'
  // sessionType: 'Training' | 'Wedstrijd'
  addRecord: (uid, recordData) => 
    addDoc(collection(db, `users/${uid}/records`), {
      discipline: recordData.discipline,
      sessionType: recordData.sessionType,
      score: recordData.score,
      achievedAt: serverTimestamp(),
      telemetry: recordData.telemetry || []
    }),

  // Get the best (highest) record for a specific discipline + sessionType
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

  // Listen to best record realtime
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

  // ---- GOALS ----

  // Get all goals for a user
  getGoals: (uid, callback) =>
    onSnapshot(collection(db, `users/${uid}/goals`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }),

  // Mark a goal as achieved
  markGoalAchieved: (uid, goalId) =>
    updateDoc(doc(db, `users/${uid}/goals`, goalId), {
      achievedAt: serverTimestamp()
    }),
};

// ==========================================
// 2. CLUB & GROUP FACTORIES (Hierarchical)
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

  removeMember: (clubId, groupId, uid) => {
    return deleteDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, uid));
  },

  getMemberCount: (clubId, groupId, callback) => 
    onSnapshot(collection(db, `clubs/${clubId}/groups/${groupId}/members`), (snap) => {
      callback(snap.size);
    }),

  getGroupsByClub: (clubId, callback) => {
    return onSnapshot(collection(db, `clubs/${clubId}/groups`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  getMembersByGroup: (clubId, groupId, callback) => {
    return onSnapshot(collection(db, `clubs/${clubId}/groups/${groupId}/members`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },
  
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
// 3. REALTIME DATABASE FACTORIES (Live Data)
// ==========================================

export const LiveSessionFactory = {
  // Update hartslag (Continu)
  syncHeartbeat: (uid, bpm, status = "online") => {
    return update(ref(rtdb, `live_sessions/${uid}`), {
      bpm,
      lastHeartbeat: Date.now(),
      connectionStatus: status
    });
  },

  // Start de teller
  startCounter: (uid, discipline, sessionType) => {
    return update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: false,
      isFinished: false,
      startTime: null,       // Will be set on the first tap, not on session start
      steps: 0,
      discipline: discipline,
      sessionType: sessionType,
      lastStepTime: null,
      telemetry: []
    });
  },

  // incrementSteps: pass firstTapTime so startTime is set on the very first tap
  incrementSteps: (uid, currentBpm, firstTapTime) => {
    const stepRef = ref(rtdb, `live_sessions/${uid}/session/steps`);
    const stepPromise = runTransaction(stepRef, (current) => (current || 0) + 1);

    const now = Date.now();
    const metaUpdate = { lastStepTime: now };
    // Only set startTime once — when firstTapTime is provided and it hasn't been set yet
    if (firstTapTime) {
      metaUpdate.startTime = firstTapTime;
      metaUpdate.isActive = true
    }
    const metaPromise = update(ref(rtdb, `live_sessions/${uid}/session`), metaUpdate);

    const telPoint = { time: now, heartRate: currentBpm || 0 };
    const telPromise = push(ref(rtdb, `live_sessions/${uid}/session/telemetry`), telPoint);

    return Promise.all([stepPromise, metaPromise, telPromise]);
  },

  stopCounter: (uid) => {
    return update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: false,
      isFinished: true,
      lastStepTime: Date.now()
    });
  },

  resetSession: (uid) => {
    return update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: false,
      isFinished: false,
      steps: 0,
      startTime: null,
      lastStepTime: null,
      telemetry: []
    });
  },

  // Read entire session once (for finalizing)
  getSessionOnce: (uid) => {
    return new Promise((resolve) => {
      const sessionRef = ref(rtdb, `live_sessions/${uid}/session`);
      onValue(sessionRef, (snapshot) => {
        resolve(snapshot.val());
      }, { onlyOnce: true });
    });
  },

  // Read current BPM once
  getBpmOnce: (uid) => {
    return new Promise((resolve) => {
      const bpmRef = ref(rtdb, `live_sessions/${uid}/bpm`);
      onValue(bpmRef, (snapshot) => {
        resolve(snapshot.val() || 0);
      }, { onlyOnce: true });
    });
  },

  subscribeToSession: (uid, callback) => {
    const sessionRef = ref(rtdb, `live_sessions/${uid}/session`);
    return onValue(sessionRef, (snapshot) => {
      callback(snapshot.val());
    });
  },

  subscribeToLive: (uid, callback) => {
    const liveRef = ref(rtdb, `live_sessions/${uid}`);
    return onValue(liveRef, (snapshot) => {
      callback(snapshot.val());
    });
  }
};
