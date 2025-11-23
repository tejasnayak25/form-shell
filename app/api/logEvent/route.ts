import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const logsPath = path.join(process.cwd(), 'data', 'logs.json');
const blockedEmailsPath = path.join(process.cwd(), 'data', 'blocked-emails.json');

// Initialize blocked emails file if it doesn't exist
function ensureBlockedEmailsFile() {
  if (!fs.existsSync(blockedEmailsPath)) {
    fs.writeFileSync(blockedEmailsPath, JSON.stringify([], null, 2));
  }
}

// Add email to blocked list
function addToBlockedList(email: string) {
  if (!email) return;
  
  ensureBlockedEmailsFile();
  try {
    const raw = fs.readFileSync(blockedEmailsPath, 'utf-8');
    const blockedEmails = JSON.parse(raw || '[]');
    const normalizedEmail = email.toLowerCase().trim();
    
    if (!blockedEmails.includes(normalizedEmail)) {
      blockedEmails.push(normalizedEmail);
      fs.writeFileSync(blockedEmailsPath, JSON.stringify(blockedEmails, null, 2));
      console.log(`🚫 Added ${normalizedEmail} to blocked list`);
    }
  } catch (e) {
    console.error('Error adding to blocked list:', e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const event = { ...body, time: new Date().toISOString() };

  let logs: any[] = [];
  try {
    const raw = fs.readFileSync(logsPath, 'utf-8');
    logs = JSON.parse(raw || '[]');
  } catch (e) {
    // ignore
  }

  logs.push(event);
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));

  // If violation count >= 3, add student email to blocked list
  if (event.type === 'violation' && event.count >= 3 && event.studentEmail) {
    addToBlockedList(event.studentEmail);
  }
  
  // Also check if quiz_submitted event has violationCount >= 3
  if (event.type === 'quiz_submitted' && event.violationCount >= 3 && event.studentEmail) {
    addToBlockedList(event.studentEmail);
  }

  return NextResponse.json({ ok: true });
}
