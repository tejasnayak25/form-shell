import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const logsPath = path.join(process.cwd(), 'data', 'logs.json');

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

  return NextResponse.json({ ok: true });
}
