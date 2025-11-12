import fs from 'fs/promises';
import path from 'path';
import { hasFirestore, rootCollection } from './firebase';

export interface FormLink {
  url: string;
  teacher?: string | null;
  createdAt: string;
  host?: string;
}

const linksPath = path.join(process.cwd(), 'data', 'links.json');

async function readJsonStore(): Promise<Record<string, FormLink>> {
  try {
    const raw = await fs.readFile(linksPath, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function writeJsonStore(next: Record<string, FormLink>) {
  await fs.mkdir(path.dirname(linksPath), { recursive: true });
  await fs.writeFile(linksPath, JSON.stringify(next, null, 2));
}

export async function saveFormLink(id: string, data: FormLink) {
  if (hasFirestore && rootCollection) {
    await rootCollection.doc('system').collection('forms').doc(id).set(data);
    return;
  }
  const current = await readJsonStore();
  current[id] = data;
  await writeJsonStore(current);
}

export async function listFormLinks(): Promise<Record<string, FormLink>> {
  if (hasFirestore && rootCollection) {
    const snapshot = await rootCollection.doc('system').collection('forms').get();
    const links: Record<string, FormLink> = {};
    snapshot.forEach((doc) => {
      links[doc.id] = doc.data() as FormLink;
    });
    return links;
  }
  return readJsonStore();
}

export async function getFormLink(id: string): Promise<FormLink | null> {
  if (hasFirestore && rootCollection) {
    const docRef = await rootCollection.doc('system').collection('forms').doc(id).get();
    if (!docRef.exists) return null;
    return docRef.data() as FormLink;
  }
  const links = await readJsonStore();
  return links[id] ?? null;
}

export async function deleteFormLink(id: string): Promise<boolean> {
  if (hasFirestore && rootCollection) {
    const docRef = rootCollection.doc('system').collection('forms').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
  }
  const links = await readJsonStore();
  if (!links[id]) return false;
  delete links[id];
  await writeJsonStore(links);
  return true;
}
