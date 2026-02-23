import { useState } from 'react';
import { db } from '../firebaseConfig';
import { ref, set } from "firebase/database";

export default function Home() {
  const [skipperName, setSkipperName] = useState('');
  const [heartRate, setHeartRate] = useState(0);

  const connectHRM = async () => {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['heart_rate'] }]
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const char = await service.getCharacteristic('heart_rate_measurement');
    
    char.startNotifications();
    char.addEventListener('characteristicvaluechanged', (e) => {
      const value = e.target.value;
      const hr = value.getUint8(1); // Simpele manier om HR te lezen
      setHeartRate(hr);
      
      // Update Firebase live!
      set(ref(db, 'sessions/' + skipperName), {
        name: skipperName,
        bpm: hr,
        steps: 0 // Dit vullen we later in met Toestel A
      });
    });
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Rope Skipping Live</h1>
      <input 
        placeholder="Naam skipper" 
        onChange={(e) => setSkipperName(e.target.value)} 
      />
      <button onClick={connectHRM}>Verbind Garmin</button>
      <h2>Hartslag: {heartRate}</h2>
    </div>
  );
}
