import { NextRequest, NextResponse } from 'next/server';
import { extractUrlFromEmbed } from '../../../lib/sanitize';
import fs from 'fs';
import path from 'path';

const dataPath = path.join(process.cwd(), 'data', 'links.json');

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { input, teacher } = body as { input: string; teacher?: string };

  const extracted = extractUrlFromEmbed(input);
  if (!extracted) {
    return NextResponse.json({ error: 'Could not extract a valid URL' }, { status: 400 });
  }

  // Create a short id
  const id = Math.random().toString(36).slice(2, 9);

  let links: Record<string, { url: string; teacher?: string; createdAt: string }> = {};
  try {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    links = JSON.parse(raw || '{}');
  } catch (e) {
    // ignore, we'll create file
  }

  links[id] = { url: extracted, teacher: teacher, createdAt: new Date().toISOString() };

  fs.writeFileSync(dataPath, JSON.stringify(links, null, 2));

  return NextResponse.json({ id, url: extracted });
}
