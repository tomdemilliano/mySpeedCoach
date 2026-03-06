import { db, rtdb } from '../firebaseConfig';
import { 
  collection, doc, setDoc, getDoc, getDocs, updateDoc, 
  deleteDoc, query, where, serverTimestamp, addDoc, onSnapshot 
} from "firebase/firestore";
import { ref, set, update, remove, onValue, runTransaction } from "firebase/database";

export const SCHEMA = {
  firestore: {
    // 1. Gebruikers & hun eigenschappen
    users: { 
      firstName: "string", 
      lastName: "string", 
      email: "string", 
      role: "superadmin|clubadmin|user",
     
   // bluetooth device	 
      assignedDevice: {
        deviceId: "string",   // Het Bluetooth ID
        deviceName: "string", // Bijv. "Garmin HRM-Dual"
        lastConnection: "timestamp"
      },
	// hartslagzones 	  
	  heartrateZones: [{ name: "string", min: "number", max: "number", color: "string" }],
	  
	// persoonlijke records  
	  records: {
	    sessionType: "string", 
		discipline: "string", 
		score: "number", 
		achievedAt: "timestamp", 
		
		// Bij het behalen van een record wordt de telmetry van de recordsessie hier bijgehouden
		telemetry: 
		[{
		   time: "number",  //aantal 100sten seconden sinds begin sessie
		   steps: "number", //totaal aantal steps
		   heartRate: "number"
		}]	
	  },
	  
	// persoonlijke doelen
	  goals: {
		discipline: "string", targetScore: "number", targetDate: "timestamp", achievedAt: "timestamp|null"
	  },

	// historiek van opgenomen sessies
	  sessionHistory: {
		discipline: "string",
		sessionStart: "timestamp",
		sessionEnd: "timestamp",
		score: "number",
		avgBpm: "number",
		maxBpm: "number",
		
	// hou hier de telemetry bij van de sessie
		telemetry: 
		[{
		   time: "number",  //aantal 100sten seconden sinds begin sessie
		   steps: "number", //totaal aantal steps
		   heartRate: "number"
		}]
	  }
	  
    },

    // 2. Clubs & Hiërarchie (Jouw voorstel voor nesting)
    clubs: { 
      name: "string", 
      logoUrl: "string",
      
	  // De groepen zijn nu een subcollectie: clubs/{clubId}/groups/{groupId}
      groups: {
        name: "string",
        useHRM: "boolean",
		isActive: "boolean", 
        
		// De leden van de groep: clubs/{clubId}/groups/{groupId}/members/{uid}
        members: {
          uid: "string", // link naar het user-object
		  isSkipper: "boolean",
          isCoach: "boolean",
          startMembership: "timestamp", //startdatum waarop user is toegevoegd aan de groep
		  endMembership: "timestamp" //datum waarop de user verwijderd is uit de groep
        }
      }
    }
  },

  rtdb: {
    live_sessions: {
      "$uid": {
        // ASPECT 1: Continu (altijd aanwezig bij verbinding)
        bpm: "number",
        lastHeartbeat: "timestamp",
        connectionStatus: "online|offline",

        // ASPECT 2: Sessie-gebonden (alleen gevuld tijdens tellen)
        session: {
          isActive: "boolean",     // Is de counter gestart?
          startTime: "timestamp",  // Wanneer is de 'Start' knop ingedrukt?
          steps: "number",         // De huidige tellerstand
          discipline: "30sec|2min|3min",   // Wat zijn we aan het tellen?
		  sessionType: "training|wedstrijd" // type van de sessie
        }
      }
    }
  }
};

// ==========================================
// 1. USER & PERSONAL DATA FACTORIES
// ==========================================

export const UserFactory = {
  // Gebruiker aanmaken met STANDAARD ZONES
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
    // 1. Zoek alle clubs op
    const clubsSnap = await getDocs(collection(db, "clubs"));
    
    for (const clubDoc of clubsSnap.docs) {
      // 2. Zoek alle groepen binnen deze club
      const groupsSnap = await getDocs(collection(db, `clubs/${clubDoc.id}/groups`));
      
      for (const groupDoc of groupsSnap.docs) {
        // 3. Probeer het lidmaatschap document van deze gebruiker in deze groep te verwijderen
        // We gebruiken deleteDoc direct op het pad; als het niet bestaat gebeurt er niets
        await deleteDoc(doc(db, `clubs/${clubDoc.id}/groups/${groupDoc.id}/members`, uid));
      }
    }

    // 4. Verwijder eventuele live sessie in RTDB (optioneel maar netjes)
    // await remove(ref(rtdb, `live_sessions/${uid}`));

    // 5. Verwijder het hoofd-document van de gebruiker
    return deleteDoc(doc(db, "users", uid));
  },

  updateProfile: (uid, data) => updateDoc(doc(db, "users", uid), data),

  // Hartslagzones handmatig updaten
  updateZones: (uid, zones) => updateDoc(doc(db, "users", uid), { heartrateZones: zones }),

  // Device koppelen
  assignDevice: (uid, deviceId, deviceName) => 
    updateDoc(doc(db, "users", uid), {
      "assignedDevice.deviceId": deviceId,
      "assignedDevice.deviceName": deviceName,
      "assignedDevice.lastConnection": serverTimestamp()
    }),

  // Records & Historiek (Subcollecties)
  addRecord: (uid, recordData) => 
    addDoc(collection(db, `users/${uid}/records`), { ...recordData, achievedAt: serverTimestamp() }),

  saveToHistory: (uid, sessionData) => 
    addDoc(collection(db, `users/${uid}/sessionHistory`), {
      ...sessionData,
      sessionEnd: serverTimestamp()
    })
};

// ==========================================
// 2. CLUB & GROUP FACTORIES (Hierarchical)
// ==========================================

export const ClubFactory = {
  create: (data) => addDoc(collection(db, "clubs"), { ...data, createdAt: serverTimestamp() }),
//  getAll: () => getDocs(collection(db, "clubs")),
  getAll: (callback) => onSnapshot(collection(db, "clubs"), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }),
  getById: (clubId) => getDoc(doc(db, "clubs", clubId)), 
  update: (clubId, data) => updateDoc(doc(db, "clubs", clubId), data), 

  delete: async (clubId) => {
    // 1. Haal alle groepen op van deze club
    const groupsSnap = await getDocs(collection(db, `clubs/${clubId}/groups`));
    
    for (const groupDoc of groupsSnap.docs) {
      // 2. Verwijder alle leden uit de subcollectie van de groep
      const membersSnap = await getDocs(collection(db, `clubs/${clubId}/groups/${groupDoc.id}/members`));
      for (const memberDoc of membersSnap.docs) {
        await deleteDoc(doc(db, `clubs/${clubId}/groups/${groupDoc.id}/members`, memberDoc.id));
      }
      // 3. Verwijder de groep zelf
      await deleteDoc(doc(db, `clubs/${clubId}/groups`, groupDoc.id));
    }
    
    // 4. Verwijder de club zelf
    return deleteDoc(doc(db, "clubs", clubId));
  }

};

export const GroupFactory = {
  // Pad: clubs/{clubId}/groups/{groupId}
  create: (clubId, groupData) => 
    addDoc(collection(db, `clubs/${clubId}/groups`), { ...groupData, isActive: true }),
  update: (clubId, groupId, data) => 
    updateDoc(doc(db, `clubs/${clubId}/groups`, groupId), data),
  delete: async (clubId, groupId) => {
    // 1. Haal eerst alle leden op uit de subcollectie
    const membersSnap = await getDocs(collection(db, `clubs/${clubId}/groups/${groupId}/members`));
    
    // 2. Verwijder elk lidmaatschap document
    for (const memberDoc of membersSnap.docs) {
      await deleteDoc(doc(db, `clubs/${clubId}/groups/${groupId}/members`, memberDoc.id));
    }
    
    // 3. Verwijder de groep zelf
    return deleteDoc(doc(db, `clubs/${clubId}/groups`, groupId));
  },

  // Ledenbeheer: clubs/{clubId}/groups/{groupId}/members/{uid}
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
    }
  ),

  // Haal alle groepen van een specifieke club op
  getGroupsByClub: (clubId, callback) => {
    return onSnapshot(collection(db, `clubs/${clubId}/groups`), (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  },

  // Haal alle leden van een specifieke groep op
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
// discipline: '30sec' | '2min' | '3min'
// sessionType: 'Training' | 'Wedstrijd'
startCounter: (uid, discipline, sessionType) => {
    return update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: true,
      isFinished: false,
      startTime: Date.now(),
      steps: 0,
      discipline: discipline,
      sessionType: sessionType
    });
  },

  incrementSteps: (uid) => {
    const stepRef = ref(rtdb, `live_sessions/${uid}/session/steps`);
    return runTransaction(stepRef, (current) => (current || 0) + 1);
  },

  stopCounter: (uid) => {
    return update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: false,
      isFinished: true
    });
  },

  resetSession: (uid) => {
    return update(ref(rtdb, `live_sessions/${uid}/session`), {
      isActive: false,
      isFinished: false,
      steps: 0,
      startTime: null
    });
  },

  subscribeToSession: (uid, callback) => {
    const sessionRef = ref(rtdb, `live_sessions/${uid}/session`);
    return onValue(sessionRef, (snapshot) => {
      callback(snapshot.val());
    });
  }
};
