import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const logsPath = path.join(process.cwd(), 'data', 'logs.json');

interface IncomingEvent {
  formId?: string | null;
  id?: string;
  type?: string;
  severity?: 'info' | 'warning' | 'critical';
  studentEmail?: string | null;
  hidden?: boolean;
  message?: string;
  metadata?: Record<string, any>;
}

export async function POST(req: NextRequest) {
  const body: IncomingEvent = await req.json();
  const event = {
    formId: body.formId ?? null,
    id: body.id ?? randomUUID(),
    type: body.type ?? 'unknown',
    severity: body.severity ?? 'info',
    studentEmail: body.studentEmail ?? null,
    hidden: body.hidden ?? undefined,
    message: body.message ?? '',
    metadata: body.metadata ?? {},
    time: new Date().toISOString(),
  };

  let logs: any[] = [];
  try {
    const raw = await fs.readFile(logsPath, 'utf-8');
    logs = JSON.parse(raw || '[]');
  } catch (e) {
    // file may not exist on first run
  }

  logs.push(event);
  // keep file from growing without bound
  if (logs.length > 2000) {
    logs = logs.slice(-2000);
  }

  await fs.mkdir(path.dirname(logsPath), { recursive: true });
  await fs.writeFile(logsPath, JSON.stringify(logs, null, 2));

  return NextResponse.json({ ok: true });
}
