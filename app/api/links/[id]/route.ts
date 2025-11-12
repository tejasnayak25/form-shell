import { NextResponse } from 'next/server';
import { getFormLink } from '@/lib/linkStore';

export async function GET(_req: Request, { params } : { params: Promise<{ id: string; }> }) {
    try {
        const rawId = (await params).id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });

        const doc = await getFormLink(id);
        if (!doc) {
            return NextResponse.json({ error: 'not found' }, { status: 404 });
        }

        return NextResponse.json(doc);
    } catch (e) {
        console.log(e);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}
