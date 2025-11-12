import { NextRequest, NextResponse } from 'next/server';
import { extractUrlFromEmbed } from '../../../lib/sanitize';
import { saveFormLink } from '@/lib/linkStore';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { input, teacher, host } = body as { input: string; teacher?: string; host?: string };

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
    host,
  };

  try {
    await saveFormLink(id, data);
    return NextResponse.json({ id, url: extracted });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save data', details: error.message }, { status: 500 });
  }
}
