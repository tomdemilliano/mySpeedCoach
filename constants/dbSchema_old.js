import { db, rtdb } from '../firebaseConfig';
import { 
  collection, doc, setDoc, getDoc, getDocs, 
  deleteDoc, serverTimestamp, updateDoc, query, where 
} from "firebase/firestore";
import { ref, set, remove, push, onValue } from "firebase/database";

// ==========================================
// 1. VOLLEDIGE SCHEMA DOCUMENTATIE
// ==========================================
export const SCHEMA = {
  firestore: {
    users: { firstName: "string", lastName: "string", birthDate: "string", email: "string", role: "admin|coach|user", createdAt: "timestamp" },
    userHeartRateZones: { "$uid": [{ name: "string", min: "number", max: "number", color: "string" }] },
    clubs: { name: "string", logoUrl: "string", startDate: "timestamp" },
    clubMembers: { "$clubId": { "$uid": { joinedAt: "timestamp", status: "string" } } },
    groups: { clubId: "string", name: "string", useHRM: "boolean", startDate: "timestamp" },
    groupMembers: { "$groupId": { "$uid": { isSkipper: "boolean", isCoach: "boolean", startDate: "timestamp" } } },
    records: { "$uid": { "$recordId": { sessionType: "string", discipline: "string", score: "number", achievedAt: "timestamp" } } },
    goals: { "$uid": { "$goalId": { discipline: "string", targetScore: "number", targetDate: "timestamp", achievedAt: "timestamp|null" } } },
    sessions: { userId: "string", date: "timestamp", sessionType: "number", totalSteps: "number", avgBpm: "number", ticks: "array" }
  },
  rtdb: {
    live_sessions: { "$skipperName": { bpm: "number", steps: "number", isRecording: "boolean", lastUpdate: "ms" } },
    registered_devices: { "$deviceId": { name: "string" } },
    session_history: { "$pushId": { skipper: "string", date: "iso", finalSteps: "number", averageBPM: "number" } }
  }
};

// ==========================================
// 2. FIRESTORE FACTORIES
// ==========================================

export const UserFactory = {
  create: async (data) => {
    const userRef = doc(collection(db, "users"));
    const payload = { ...data, createdAt: serverTimestamp() };
    await setDoc(userRef, payload);
    // Initialiseer standaard zones bij aanmaak
    await setDoc(doc(db, "userHeartRateZones", userRef.id), {
      zones: [
        { name: 'Warm-up', min: 0, max: 120, color: '#94a3b8' },
        { name: 'Fat Burn', min: 120, max: 145, color: '#22c55e' },
        { name: 'Aerobic', min: 145, max: 165, color: '#facc15' },
        { name: 'Anaerobic', min: 165, max: 185, color: '#f97316' },
        { name: 'Red Line', min: 185, max: 250, color: '#ef4444' }
      ]
    });
    return { id: userRef.id, ...payload };
  },
  getZones: async (uid) => {
    const snap = await getDoc(doc(db, "userHeartRateZones", uid));
    return snap.exists() ? snap.data().zones : null;
  },
  updateZones: async (uid, zones) => {
    await setDoc(doc(db, "userHeartRateZones", uid), { zones });
  },
  getAll: async () => {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  delete: async (uid) => {
    await deleteDoc(doc(db, "users", uid));
    await deleteDoc(doc(db, "userHeartRateZones", uid));
  }
};

export const ClubFactory = {
  create: async (data) => {
    const ref = doc(collection(db, "clubs"));
    const payload = { name: data.name, logoUrl: data.logoUrl || "", startDate: serverTimestamp() };
    await setDoc(ref, payload);
    return { id: ref.id, ...payload };
  },
  addMember: async (clubId, uid) => {
    await setDoc(doc(db, `clubMembers/${clubId}/members`, uid), {
      joinedAt: serverTimestamp(),
      membershipStatus: "active"
    });
  },
  getMembers: async (clubId) => {
    const snap = await getDocs(collection(db, `clubMembers/${clubId}/members`));
    return snap.docs.map(d => d.id);
  },
  removeMember: async (clubId, uid) => {
    await deleteDoc(doc(db, `clubMembers/${clubId}/members`, uid));
  }
};

export const GroupFactory = {
  create: async (data) => {
    const ref = doc(collection(db, "groups"));
    const payload = { ...data, startDate: serverTimestamp() };
    await setDoc(ref, payload);
    return { id: ref.id, ...payload };
  },
  addMember: async (groupId, uid, roles = { isSkipper: true, isCoach: false }) => {
    await setDoc(doc(db, `groupMembers/${groupId}/members`, uid), {
      ...roles,
      startDate: serverTimestamp()
    });
  },
  getMembers: async (groupId) => {
    const snap = await getDocs(collection(db, `groupMembers/${groupId}/members`));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  removeMember: async (groupId, uid) => {
    await deleteDoc(doc(db, `groupMembers/${groupId}/members`, uid));
  }
};

export const RecordFactory = {
  add: async (uid, recordData) => {
    const ref = doc(collection(db, `records/${uid}/userRecords`));
    await setDoc(ref, { ...recordData, achievedAt: serverTimestamp() });
  },
  getByUser: async (uid) => {
    const snap = await getDocs(collection(db, `records/${uid}/userRecords`));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
};

// ==========================================
// 3. REALTIME DATABASE FACTORIES
// ==========================================

export const LiveSessionFactory = {
  update: (skipperName, data) => {
    return set(ref(rtdb, `live_sessions/${skipperName}`), {
      ...data,
      lastUpdate: Date.now()
    });
  },
  stop: (skipperName) => remove(ref(rtdb, `live_sessions/${skipperName}`)),
  resetAll: () => remove(ref(rtdb, 'live_sessions'))
};

export const HistoryFactory = {
  save: async (sessionData) => {
    const historyRef = ref(rtdb, 'session_history');
    const newSessionRef = push(historyRef);
    await set(newSessionRef, {
      ...sessionData,
      date: new Date().toISOString()
    });
    return newSessionRef.key;
  }
};

export const DeviceFactory = {
  register: (deviceId, name) => {
    return set(ref(rtdb, `registered_devices/${deviceId}`), { name });
  },
  getAll: (callback) => {
    onValue(ref(rtdb, 'registered_devices'), (snapshot) => {
      callback(snapshot.val() || {});
    });
  }
};
