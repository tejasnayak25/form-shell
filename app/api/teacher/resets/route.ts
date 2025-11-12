import { NextRequest, NextResponse } from 'next/server';
import { setResetPermission } from '@/lib/resetStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { formId, studentEmail, allow, grantedBy, note } = body;
    if (!formId || !studentEmail || typeof allow === 'undefined') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await setResetPermission(formId, studentEmail, grantedBy ?? 'teacher', allow, note);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'internal', details: error?.message }, { status: 500 });
  }
}
