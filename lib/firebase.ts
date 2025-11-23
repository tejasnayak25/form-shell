import admin from "firebase-admin";
import fs from "fs";
import path from "path";

let serviceAccount: any = null;
let initialized = false;

try {
  if(process.env.FIREBASE_ADMIN) {
    serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN);
  } else {
    const serviceAccountPath = path.join(process.cwd(), "lib", "service-account.json");
    if (fs.existsSync(serviceAccountPath)) {
      const text = fs.readFileSync(serviceAccountPath, "utf8");
      serviceAccount = JSON.parse(text);
    } else {
      console.warn("Warning: service-account.json not found. Firebase Admin will not be initialized.");
      console.warn("Please set FIREBASE_ADMIN environment variable or add lib/service-account.json");
    }
  }

  if (serviceAccount && !admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
  }
} catch (error: any) {
  console.error("Firebase Admin initialization error:", error.message);
  initialized = false;
}

if (!initialized) {
  console.warn("Firebase Admin SDK not initialized. API routes requiring Firestore will fail.");
}

export const db = initialized ? admin.firestore() : null;
export const firestore = admin.firestore;
export const auth = initialized ? admin.auth() : null;
export const rootCollection = initialized ? admin.firestore().collection("form-shell") : null;