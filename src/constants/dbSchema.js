const mySpeedCoachSchema = {
  // ==========================================
  // FIRESTORE (db) - De "Relationele" Data
  // ==========================================
  firestore: {
    // Gebruikersprofielen
    users: {
      "$uid": {
        firstName: "string",
        lastName: "string",
        birthDate: "ISO-string",
        email: "string",
        createdAt: "timestamp",
        role: "admin | coach | user"
      }
    },

    // Club beheer
    clubs: {
      "$clubId": {
        name: "string",
        logoUrl: "string", // URL naar storage
        startDate: "timestamp",
        endDate: "timestamp | null"
      }
    },

    // Clubleden
    clubMembers: {
      "$clubId": {
        "$uid": {
          joinedAt: "timestamp",
          membershipStatus: "active | inactive"
        }
      }
    }
    
    // Groepen binnen een club
    groups: {
      "$groupId": {
        clubId: "string", // FK naar clubs
        name: "string",
        useHRM: "boolean",
        startDate: "timestamp",
        endDate: "timestamp | null"
      }
    },

    // Koppeltabel Groep <-> User
    groupMembers: {
      "$groupId": {
        "$uid": {
          isSkipper: "boolean",
          isCoach: "boolean",
          startDate: "timestamp",
          endDate: "timestamp | null"
        }
      }
    },

    // Gekoppelde hartslagmeters (historiek per user)
    userHRM: {
      "$uid": {
        "$hrmId": {
          firstConnected: "timestamp",
          lastConnected: "timestamp"
        }
      }
    },

    // Hartslagzones historiek
    userHeartRateZones: {
      "$uid": {
        "$validFromTimestamp": {
          zones: [
            { name: "Warm-up", min: 0, max: 120, color: "#94a3b8" },
            { name: "Fat Burn", min: 120, max: 145, color: "#22c55e" },
            { name: "Aerobic", min: 145, max: 165, color: "#facc15" },
            { name: "Anaerobic", min: 165, max: 185, color: "#f97316" },
            { name: "Red Line", min: 185, max: 250, color: "#ef4444" }
          ]
        }
      }
    },

    // Persoonlijke records
    records: {
      "$uid": {
        "$recordId": {
          sessionType: "training | contest",
          discipline: "30s | 2m | 3m",
          score: "number",
          achievedAt: "timestamp"
        }
      }
    },

    // Doelstellingen
    goals: {
      "$uid": {
        "$goalId": {
          discipline: "string",
          targetScore: "number",
          targetDate: "timestamp",
          achievedAt: "timestamp | null"
        }
      }
    },

    // Sessie Historiek (De zware data)
    sessions: {
      "$sessionId": {
        userId: "string",
        date: "timestamp",
        sessionType: "number", // 30, 120, 180
        totalSteps: "number",
        avgBpm: "number",
        // De seconde-per-seconde log
        ticks: [
          { s: "number", bpm: "number", steps: "number" }
        ]
      }
    }
  },

  // ==========================================
  // REALTIME DATABASE (rtdb) - De "Live" Data
  // ==========================================
  rtdb: {
    live_sessions: {
      "$uid": {
        bpm: "number",
        steps: "number",
        isRecording: "boolean",
        startTime: "timestamp | null",
        status: "string" // e.g., "active", "idle"
      }
    }
  }
};
