import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function DELETE(_req: Request, { params } : { params: Promise<{ id: string; }> }) {
  try {
    const id = (await params).id;
    let deleted = false;

    // Try Firebase first
    try {
      const firebase = await import('@/lib/firebase');
      const rootCollection = firebase.rootCollection;
      
      if (rootCollection) {
        const docRef = rootCollection.doc("system").collection('forms').doc(id);
        const doc = await docRef.get();
        if (doc.exists) {
          await docRef.delete();
          deleted = true;
        }
      }
    } catch (firebaseError) {
      console.warn('Firebase not available, using JSON fallback');
    }

    // Fallback to JSON file
    if (!deleted) {
      const linksPath = path.join(process.cwd(), 'data', 'links.json');
      if (fs.existsSync(linksPath)) {
        const content = fs.readFileSync(linksPath, 'utf-8');
        const links = JSON.parse(content);
        
        if (links[id]) {
          delete links[id];
          fs.writeFileSync(linksPath, JSON.stringify(links, null, 2), 'utf-8');
          deleted = true;
        }
      }
    }

    if (!deleted) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Delete error:', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
