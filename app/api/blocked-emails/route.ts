import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const blockedEmailsPath = path.join(process.cwd(), 'data', 'blocked-emails.json');

// Initialize blocked emails file if it doesn't exist
function ensureBlockedEmailsFile() {
  if (!fs.existsSync(blockedEmailsPath)) {
    fs.writeFileSync(blockedEmailsPath, JSON.stringify([], null, 2));
  }
}

// Read blocked emails
function readBlockedEmails(): string[] {
  ensureBlockedEmailsFile();
  try {
    const raw = fs.readFileSync(blockedEmailsPath, 'utf-8');
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// Write blocked emails
function writeBlockedEmails(emails: string[]) {
  ensureBlockedEmailsFile();
  fs.writeFileSync(blockedEmailsPath, JSON.stringify(emails, null, 2));
}

// GET: Check if an email is blocked
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');

  if (!email) {
    return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
  }

  const blockedEmails = readBlockedEmails();
  const isBlocked = blockedEmails.includes(email.toLowerCase().trim());

  return NextResponse.json({ 
    email: email.toLowerCase().trim(),
    isBlocked 
  });
}

// POST: Add an email to the blocked list
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const blockedEmails = readBlockedEmails();
    const normalizedEmail = email.toLowerCase().trim();

    // Add email if not already blocked
    if (!blockedEmails.includes(normalizedEmail)) {
      blockedEmails.push(normalizedEmail);
      writeBlockedEmails(blockedEmails);
      return NextResponse.json({ 
        success: true, 
        email: normalizedEmail,
        message: 'Email added to blocked list' 
      });
    }

    return NextResponse.json({ 
      success: true, 
      email: normalizedEmail,
      message: 'Email already in blocked list' 
    });
  } catch (error: any) {
    console.error('Error adding blocked email:', error);
    return NextResponse.json({ error: 'Failed to add blocked email' }, { status: 500 });
  }
}

// DELETE: Remove an email from the blocked list
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }

    const blockedEmails = readBlockedEmails();
    const normalizedEmail = email.toLowerCase().trim();
    const filteredEmails = blockedEmails.filter(e => e !== normalizedEmail);

    if (filteredEmails.length === blockedEmails.length) {
      return NextResponse.json({ 
        success: false, 
        message: 'Email not found in blocked list' 
      });
    }

    writeBlockedEmails(filteredEmails);
    return NextResponse.json({ 
      success: true, 
      email: normalizedEmail,
      message: 'Email removed from blocked list' 
    });
  } catch (error: any) {
    console.error('Error removing blocked email:', error);
    return NextResponse.json({ error: 'Failed to remove blocked email' }, { status: 500 });
  }
}


