// Firebase client helper using NEXT_PUBLIC_ environment variables.
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import fclient from "@/lib/fclient.json";

let app: any = null;

export function initFirebaseFromEnv() {
  if (getApps().length) return getApps()[0];

  const apiKey = fclient.apiKey;
  const authDomain = fclient.authDomain;
  const projectId = fclient.projectId;
  if (!apiKey || !authDomain || !projectId) {
    // Not configured; return null so caller can handle fallback.
    return null;
  }

  const config = {
    apiKey,
    authDomain,
    projectId,
  };
  app = initializeApp(config);
  return app;
}

export function googleSignIn(): Promise<any> {
  const auth = getAuth();
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export function signOut(): Promise<void> {
  const auth = getAuth();
  return fbSignOut(auth);
}

export function onAuthChange(cb: (u: User | null) => void) {
  const auth = getAuth();
  return onAuthStateChanged(auth, cb);
}
