import { NextResponse } from 'next/server';
import { listFormLinks } from '@/lib/linkStore';

export async function GET(req: Request, { params } : { params: Promise<{ teacher: string; }> }) {
  try {
    const email = (await params).teacher;

    if (!email) {
      return NextResponse.json({ error: 'Missing teacher parameter' }, { status: 400 });
    }
    
    const links = await listFormLinks();
    return NextResponse.json(links);
  } catch (e) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
