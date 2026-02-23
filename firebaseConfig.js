import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBh7YT9hGp4S2GTEzsfsCBkuEUMdK6OdaA",
  authDomain: "myspeedcoach-416ac.firebaseapp.com",
  databaseURL: "https://myspeedcoach-416ac-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "myspeedcoach-416ac",
  storageBucket: "myspeedcoach-416ac.firebasestorage.app",
  messagingSenderId: "637458200530",
  appId: "1:637458200530:web:77c17fa5cb39f0b3333a0b",
  measurementId: "G-3XZDT4QFX4"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
