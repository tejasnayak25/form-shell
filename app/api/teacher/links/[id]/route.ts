import { NextResponse } from 'next/server';
import { db, rootCollection } from '@/lib/firebase';

export async function DELETE(_req: Request, { params } : { params: { id: string; } }) {
  try {
    const id:any = (await params).id;
    const docRef = rootCollection.doc("system").collection('forms').doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    await docRef.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
