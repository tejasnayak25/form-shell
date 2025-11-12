import admin from "firebase-admin";
import fs from "fs";

let serviceAccount: admin.ServiceAccount | null = null;
if (process.env.FIREBASE_ADMIN) {
  serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN);
} else {
  try {
    const text = fs.readFileSync("./lib/service-account.json", "utf8");
    serviceAccount = JSON.parse(text);
  } catch {
    // service account file not available locally; fall back to file storage
    serviceAccount = null;
  }
}

if (serviceAccount && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = serviceAccount ? admin.firestore() : null;
export const firestore = serviceAccount ? admin.firestore : null;
export const auth = serviceAccount ? admin.auth() : null;
export const rootCollection = db ? db.collection("form-shell") : null;
export const hasFirestore = Boolean(rootCollection);
