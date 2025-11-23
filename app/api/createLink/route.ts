import { NextRequest, NextResponse } from 'next/server';
import { extractUrlFromEmbed } from '../../../lib/sanitize';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input, teacher } = body as { input: string; teacher?: string; };

    const extracted = extractUrlFromEmbed(input);
    if (!extracted) {
      return NextResponse.json({ error: 'Could not extract a valid URL' }, { status: 400 });
    }

    // Create a short id
    const id = Math.random().toString(36).slice(2, 9);

    const data = {
      url: extracted,
      teacher: teacher,
      createdAt: new Date().toISOString(),
    };

    // Try Firebase first, fallback to JSON file
    let saved = false;
    
    try {
      const firebase = await import('../../../lib/firebase');
      const rootCollection = firebase.rootCollection;
      
      if (rootCollection) {
        const docRef = rootCollection.doc("system").collection('forms').doc(id);
        await docRef.set(data);
        saved = true;
      }
    } catch (firebaseError: any) {
      console.warn('Firebase not available, using JSON fallback:', firebaseError.message);
    }

    // Fallback to JSON file storage if Firebase failed
    if (!saved) {
      const linksPath = path.join(process.cwd(), 'data', 'links.json');
      let links: Record<string, any> = {};
      
      try {
        if (fs.existsSync(linksPath)) {
          const content = fs.readFileSync(linksPath, 'utf-8');
          links = JSON.parse(content);
        }
      } catch (e) {
        console.warn('Could not read links.json, starting fresh');
      }
      
      links[id] = data;
      
      try {
        fs.writeFileSync(linksPath, JSON.stringify(links, null, 2), 'utf-8');
        saved = true;
      } catch (writeError: any) {
        console.error('Failed to write to links.json:', writeError);
        return NextResponse.json({ 
          error: 'Failed to save link. Please check server logs.',
          details: writeError.message 
        }, { status: 500 });
      }
    }

    if (saved) {
      return NextResponse.json({ id, url: extracted });
    } else {
      return NextResponse.json({ 
        error: 'Failed to save link' 
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('API route error:', error);
    // Handle JSON parsing errors
    if (error instanceof SyntaxError) {
      return NextResponse.json({ 
        error: 'Invalid request body', 
        details: error.message 
      }, { status: 400 });
    }
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
}
