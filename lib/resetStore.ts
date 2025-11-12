import fs from 'fs/promises';
import path from 'path';

const resetsPath = path.join(process.cwd(), 'data', 'resets.json');

export interface ResetEntry {
  studentEmail: string;
  formId: string;
  grantedBy: string;
  grantedAt: string;
  note?: string;
}

type ResetStore = Record<string, Record<string, ResetEntry>>;

async function readResetStore(): Promise<ResetStore> {
  try {
    const raw = await fs.readFile(resetsPath, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function writeResetStore(store: ResetStore) {
  await fs.mkdir(path.dirname(resetsPath), { recursive: true });
  await fs.writeFile(resetsPath, JSON.stringify(store, null, 2));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function setResetPermission(
  formId: string,
  studentEmail: string,
  grantedBy: string,
  allow: boolean,
  note?: string,
) {
  const store = await readResetStore();
  if (!store[formId]) {
    store[formId] = {};
  }

  const emailKey = normalizeEmail(studentEmail);
  if (allow) {
    store[formId][emailKey] = {
      formId,
      studentEmail,
      grantedBy,
      grantedAt: new Date().toISOString(),
      note,
    };
  } else {
    delete store[formId][emailKey];
    if (Object.keys(store[formId]).length === 0) {
      delete store[formId];
    }
  }

  await writeResetStore(store);
}

export async function listResetPermissions(formId: string): Promise<ResetEntry[]> {
  const store = await readResetStore();
  const entries = store[formId] ?? {};
  return Object.values(entries);
}

export async function getResetPermission(formId: string, studentEmail: string): Promise<ResetEntry | null> {
  const store = await readResetStore();
  const entries = store[formId] ?? {};
  return entries[normalizeEmail(studentEmail)] ?? null;
}
