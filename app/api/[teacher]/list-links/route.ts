import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request, { params } : { params: Promise<{ teacher: string; }> }) {
  try {
    const rawEmail = (await params).teacher;
    // Decode the email in case it was URL encoded
    const email = decodeURIComponent(rawEmail);

    if (!email) {
      return NextResponse.json({ error: 'Missing teacher parameter' }, { status: 400 });
    }
    
    let links: Record<string, any> = {};

    // Try Firebase first
    try {
      const firebase = await import('@/lib/firebase');
      const rootCollection = firebase.rootCollection;
      
      if (rootCollection) {
        const snapshot = await rootCollection.doc("system").collection('forms').get();
        links = snapshot.docs.reduce((acc, doc) => {
          acc[doc.id] = doc.data();
          return acc;
        }, {} as Record<string, any>);
      }
    } catch (firebaseError) {
      console.warn('Firebase not available, using JSON fallback');
    }

    // Fallback to JSON file if Firebase didn't return anything
    if (Object.keys(links).length === 0) {
      const linksPath = path.join(process.cwd(), 'data', 'links.json');
      if (fs.existsSync(linksPath)) {
        const content = fs.readFileSync(linksPath, 'utf-8');
        links = JSON.parse(content);
      }
    }

    return NextResponse.json(links);
  } catch (e) {
    console.error('Error fetching links:', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
