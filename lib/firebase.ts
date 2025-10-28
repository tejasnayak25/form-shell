import admin from "firebase-admin";
import fs from "fs";

let serviceAccount;
if(process.env.FIREBASE_ADMIN) {
    serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN);
} else {
    let text = fs.readFileSync("./lib/service-account.json", "utf8");
    serviceAccount = JSON.parse(text);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const db = admin.firestore();
export const firestore = admin.firestore;
export const auth = admin.auth();
export const rootCollection = db.collection("form-shell");