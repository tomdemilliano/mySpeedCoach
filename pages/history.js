import { useState, useEffect } from 'react';
import { rtdb as db } from '../firebaseConfig';
import { ref, onValue } from "firebase/database";

export default function HistoryPage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    onValue(ref(db, 'session_history'), (snapshot) => {
      const data = snapshot.val();
      if (data) setHistory(Object.values(data).reverse()); // Nieuwste bovenaan
    });
  }, []);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Sessie Historiek</h1>
      {history.map((s, i) => (
        <div key={i} style={{ backgroundColor: '#1e293b', padding: '15px', borderRadius: '10px', marginBottom: '10px' }}>
          <strong>{s.skipper}</strong> - {new Date(s.date).toLocaleString()}<br/>
          Score: {s.finalSteps} steps | Gem. HR: {s.averageBPM} BPM | Max: {s.maxBPM}
        </div>
      ))}
    </div>
  );
}
