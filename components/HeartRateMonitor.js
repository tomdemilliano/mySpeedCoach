import { useState, useEffect } from 'react';
import { db } from '../firebaseConfig'; // Jouw firebase setup
import { ref, set } from "firebase/database";

export default function HeartRateMonitor() {
  const [skipperName, setSkipperName] = useState('');
  const [heartRate, setHeartRate] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  // Functie om de hartslagwaarde uit de Bluetooth data te halen
  const parseHeartRate = (value) => {
    const flags = value.getUint8(0);
    const is16Bits = flags & 0x1;
    if (is16Bits) {
      return value.getUint16(1, true);
    } else {
      return value.getUint8(1);
    }
  };

  const connectBluetooth = async () => {
    if (!skipperName) {
      alert("Voer eerst de naam van de skipper in!");
      return;
    }

    try {
      // Zoek naar apparaten met de Heart Rate service
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');

      setIsConnected(true);

      // Luister naar veranderingen
      characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const hr = parseHeartRate(event.target.value);
        setHeartRate(hr);

        // Stuur de data direct naar Firebase Realtime Database
        // We gebruiken de naam als ID (in een echte app gebruik je best een unieke ID)
        set(ref(db, 'live_sessions/' + skipperName), {
          name: skipperName,
          heartRate: hr,
          timestamp: Date.now()
        });
      });

    } catch (error) {
      console.error("Bluetooth fout:", error);
      setIsConnected(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Skipper Koppelen</h2>
      
      <input 
        type="text" 
        placeholder="Naam skipper..." 
        className="border p-2 mr-2 rounded"
        value={skipperName}
        onChange={(e) => setSkipperName(e.target.value)}
        disabled={isConnected}
      />

      <button 
        onClick={connectBluetooth}
        className={`px-4 py-2 rounded text-white ${isConnected ? 'bg-green-500' : 'bg-blue-500'}`}
      >
        {isConnected ? 'Gekoppeld' : 'Verbind Garmin'}
      </button>

      {isConnected && (
        <div className="mt-4">
          <p className="text-lg">Huidige hartslag voor <strong>{skipperName}</strong>:</p>
          <span className="text-4xl font-black text-red-600">{heartRate} BPM</span>
        </div>
      )}
    </div>
  );
}
