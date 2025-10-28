import { NextResponse } from 'next/server';
import { db, rootCollection } from '@/lib/firebase';

export async function GET(req: Request, { params } : { params: Promise<{ teacher: string; }> }) {
  try {
    const email = (await params).teacher;

    if (!email) {
      return NextResponse.json({ error: 'Missing teacher parameter' }, { status: 400 });
    }
    
    const snapshot = await rootCollection.doc("system").collection('forms').get();
    const links = snapshot.docs.reduce((acc, doc) => {
      acc[doc.id] = doc.data();
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json(links);
  } catch (e) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
