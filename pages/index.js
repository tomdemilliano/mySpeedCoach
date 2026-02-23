import { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig';
import { ref, set } from "firebase/database";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Heart, Activity, Bluetooth } from 'lucide-react';

export default function HeartRateApp() {
  const [skipperName, setSkipperName] = useState('');
  const [heartRate, setHeartRate] = useState(0);
  const [deviceName, setDeviceName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [history, setHistory] = useState([]);
  const [viewTime, setViewTime] = useState(60); // Standaard 60 seconden

  // Bijhouden van data voor de grafiek
  useEffect(() => {
    if (isConnected && heartRate > 0) {
      const interval = setInterval(() => {
        setHistory(prev => {
          const newData = [...prev, { time: new Date().toLocaleTimeString(), bpm: heartRate }];
          // We houden iets meer data vast dan nodig voor de slice
          return newData.slice(-200); 
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected, heartRate]);

  const connectHRM = async () => {
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }]
      });
      
      setDeviceName(device.name || "Garmin Apparaat");
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const char = await service.getCharacteristic('heart_rate_measurement');
      
      setIsConnected(true);
      char.startNotifications();
      
      char.addEventListener('characteristicvaluechanged', (e) => {
        const value = e.target.value;
        const hr = value.getUint8(1);
        setHeartRate(hr);
        
        if (skipperName) {
          set(ref(db, 'sessions/' + skipperName), {
            name: skipperName,
            bpm: hr,
            lastUpdate: Date.now()
          });
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Filter de data voor de grafiek op basis van de gekozen tijd
  const filteredData = history.slice(-(viewTime));

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 font-sans">
      {/* Header */}
      <div className="max-w-4xl mx-auto flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
        <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2">
          <Activity className="text-red-500" /> SKIPPER PRO <span className="text-slate-500 text-sm">v1.0</span>
        </h1>
        <div className="flex items-center gap-2 text-sm bg-slate-800 px-4 py-2 rounded-full">
          <Bluetooth size={16} className={isConnected ? "text-blue-400" : "text-slate-500"} />
          {isConnected ? <span className="text-blue-400 font-bold">{deviceName}</span> : "Niet verbonden"}
        </div>
      </div>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Kolom 1: Controls */}
        <div className="bg-slate-800 p-6 rounded-2xl shadow-xl">
          <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Skipper Naam</label>
          <input 
            className="w-full bg-slate-900 border border-slate-700 p-3 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Bijv. Jan de Springer"
            value={skipperName}
            onChange={(e) => setSkipperName(e.target.value)}
          />
          <button 
            onClick={connectHRM}
            disabled={isConnected}
            className={`w-full py-4 rounded-lg font-bold transition ${isConnected ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            {isConnected ? 'GEKOPPELD' : 'VERBIND GARMIN'}
          </button>

          <div className="mt-8">
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Grafiek Venster</label>
            <select 
              className="w-full bg-slate-900 border border-slate-700 p-2 rounded text-sm"
              onChange={(e) => setViewTime(parseInt(e.target.value))}
              value={viewTime}
            >
              <option value={30}>30 Seconden</option>
              <option value={60}>1 Minuut</option>
              <option value={120}>2 Minuten</option>
              <option value={180}>3 Minuten</option>
            </select>
          </div>
        </div>

        {/* Kolom 2 & 3: Live Data & Grafiek */}
        <div className="md:col-span-2 space-y-6">
          {/* Heart Rate Display */}
          <div className="bg-slate-800 p-8 rounded-2xl shadow-xl flex items-center justify-between overflow-hidden relative">
            <div>
              <p className="text-slate-400 font-bold uppercase text-sm tracking-widest">Live Hartslag</p>
              <div className="flex items-baseline gap-2">
                <span className="text-8xl font-black text-white">{heartRate}</span>
                <span className="text-2xl text-slate-500 font-bold">BPM</span>
              </div>
            </div>
            <Heart 
              size={100} 
              className={`text-red-600 opacity-20 absolute -right-4 transition-transform duration-500 ${heartRate > 0 ? 'animate-ping' : ''}`} 
              style={{ animationDuration: heartRate > 0 ? `${60 / heartRate}s` : '1s' }}
            />
          </div>

          {/* Grafiek */}
          <div className="bg-slate-800 p-6 rounded-2xl shadow-xl h-64">
             <ResponsiveContainer width="100%" height="100%">
                <LineChart data={filteredData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="time" hide />
                  <YAxis domain={['dataMin - 5', 'dataMax + 5']} hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                    itemStyle={{ color: '#ef4444' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="bpm" 
                    stroke="#ef4444" 
                    strokeWidth={4} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                </LineChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
