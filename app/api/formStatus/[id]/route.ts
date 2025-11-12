import { NextRequest, NextResponse } from 'next/server';
import { getFormEvents } from '@/lib/logStore';
import { getResetPermission } from '@/lib/resetStore';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const formId = (await params).id;
    const { searchParams } = new URL(req.url);
    const studentEmail = searchParams.get('studentEmail');

    if (!formId || !studentEmail) {
      return NextResponse.json({ error: 'Missing formId or studentEmail' }, { status: 400 });
    }

    const reset = await getResetPermission(formId, studentEmail);
    const events = await getFormEvents(formId);
    const emailLower = studentEmail.toLowerCase();
    const studentEvents = events
      .filter((event) => (event.studentEmail ?? '').toLowerCase() === emailLower)
      .slice(-5)
      .reverse();

    return NextResponse.json({
      formId,
      studentEmail,
      allowRetry: Boolean(reset),
      grantedAt: reset?.grantedAt ?? null,
      grantedBy: reset?.grantedBy ?? null,
      recentEvents: studentEvents,
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'internal', details: error?.message }, { status: 500 });
  }
}
