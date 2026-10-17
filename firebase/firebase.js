import { getAnalytics, isSupported } from "firebase/analytics";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBY46yN8wI1EtF-4AbALMptolQ4o_ijB7E",
  authDomain: "rideshare-a5e63.firebaseapp.com",
  projectId: "rideshare-a5e63",
  storageBucket: "rideshare-a5e63.firebasestorage.app",
  messagingSenderId: "464062688768",
  appId: "1:464062688768:web:b1cd14c27890436b05b2e5",
  measurementId: "G-86VMRGZ8HS",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function enableAnalytics() {
  if (typeof window === "undefined") return;
  if (!(await isSupported())) return;
  getAnalytics(app);
}
