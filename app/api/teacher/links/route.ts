import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataPath = path.join(process.cwd(), 'data', 'links.json');

export async function GET(_req: Request) {
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const links = JSON.parse(raw || '{}') as Record<string, any>;
    return NextResponse.json(links);
  } catch (e) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
