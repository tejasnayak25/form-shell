import { NextResponse } from 'next/server';
import { deleteFormLink } from '@/lib/linkStore';

export async function DELETE(_req: Request, { params } : { params: Promise<{ id: string; }> }) {
  try {
    const id:any = (await params).id;
    const deleted = await deleteFormLink(id);
    if (!deleted) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
