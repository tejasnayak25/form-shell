import { NextResponse } from 'next/server';
import { summarizeFormLogs } from '@/lib/logStore';
import { listResetPermissions } from '@/lib/resetStore';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const formId = (await params).id;
    if (!formId) {
      return NextResponse.json({ error: 'Missing form id' }, { status: 400 });
    }

    const summary = await summarizeFormLogs(formId);
    const resets = await listResetPermissions(formId);
    return NextResponse.json({
      ...summary,
      resets,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'internal', details: error?.message }, { status: 500 });
  }
}
