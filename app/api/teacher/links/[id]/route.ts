import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataPath = path.join(process.cwd(), 'data', 'links.json');

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    const links = JSON.parse(raw || '{}') as Record<string, any>;
    const resolved = await params;
    const { id } = resolved;
    if (!links[id]) return NextResponse.json({ error: 'not found' }, { status: 404 });
    delete links[id];
    fs.writeFileSync(dataPath, JSON.stringify(links, null, 2));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
