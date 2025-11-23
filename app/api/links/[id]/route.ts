import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(_req: Request, { params } : { params: Promise<{ id: string; }> }) {
    try {
        const rawId = (await params).id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id) return NextResponse.json({ error: 'not found' }, { status: 404 });
        
        let entry = null;

        // Try Firebase first
        try {
            const firebase = await import('@/lib/firebase');
            const rootCollection = firebase.rootCollection;
            
            if (rootCollection) {
                const docRef = rootCollection.doc("system").collection('forms').doc(id);
                const doc = await docRef.get();
                if (doc.exists) {
                    entry = doc.data();
                }
            }
        } catch (firebaseError) {
            console.warn('Firebase not available, using JSON fallback');
        }

        // Fallback to JSON file
        if (!entry) {
            const linksPath = path.join(process.cwd(), 'data', 'links.json');
            if (fs.existsSync(linksPath)) {
                const content = fs.readFileSync(linksPath, 'utf-8');
                const links = JSON.parse(content);
                entry = links[id] || null;
            }
        }

        if (!entry) {
            return NextResponse.json({ error: 'not found' }, { status: 404 });
        }

        return NextResponse.json(entry);
    } catch (e) {
        console.error('Error fetching link:', e);
        return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
}