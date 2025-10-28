import { NextResponse } from 'next/server';
import { db, rootCollection } from '@/lib/firebase';

export async function GET(_req: Request, { params } : { params: { id: string; } }) {
    try {
        const rawId = (await params).id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });
        
        const docRef = rootCollection.doc("system").collection('forms').doc(id);

        const doc = await docRef.get();
        if (!doc.exists) {
            return NextResponse.json({ error: 'not found' }, { status: 404 });
        }

        return NextResponse.json(doc.data());
    } catch (e) {
        console.log(e);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}