import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const dataPath = path.join(process.cwd(), 'data', 'links.json');

export async function GET(_req: Request, { params }: { params: Promise<{ id?: string | string[] }> }) {
    try {
        const raw = fs.readFileSync(dataPath, 'utf-8');
        const links = JSON.parse(raw || '{}') as Record<string, any>;
        const resolved = await params;
        const rawId = resolved?.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });
        const entry = links[id];
        if (!entry) return NextResponse.json({ error: 'not found' }, { status: 404 });
        return NextResponse.json(entry);
    } catch (e) {
        console.log(e);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}