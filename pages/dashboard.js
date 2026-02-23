import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";

export default function Dashboard() {
  const [data, setData] = useState({});

  useEffect(() => {
    const sessionsRef = ref(db, 'sessions/');
    // Luister live naar ELKE verandering in de database
    onValue(sessionsRef, (snapshot) => {
      setData(snapshot.val() || {});
    });
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Live Monitor</h1>
      {Object.values(data).map((skipper) => (
        <div key={skipper.name} style={{ border: '1px solid black', margin: '10px', padding: '10px' }}>
          <h3>{skipper.name}</h3>
          <p>Hartslag: <strong>{skipper.bpm} BPM</strong></p>
        </div>
      ))}
    </div>
  );
}
