import { NextRequest, NextResponse } from 'next/server';
import { extractUrlFromEmbed } from '../../../lib/sanitize';
import { db, rootCollection } from '../../../lib/firebase';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { input, teacher } = body as { input: string; teacher?: string; };

  const extracted = extractUrlFromEmbed(input);
  if (!extracted) {
    return NextResponse.json({ error: 'Could not extract a valid URL' }, { status: 400 });
  }

  // Create a short id
  const id = Math.random().toString(36).slice(2, 9);

  const docRef = rootCollection.doc("system").collection('forms').doc(id);
  const data = {
    url: extracted,
    teacher: teacher,
    createdAt: new Date().toISOString(),
  };

  try {
    await docRef.set(data);
    return NextResponse.json({ id, url: extracted });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save data to Firestore', details: error.message }, { status: 500 });
  }
}
