import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';
import { isManagerRole } from '../../../../../lib/hr/permissions';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Manager: approve/reject/set usage_type
    if (isManagerRole(role)) {
      if (body.status && ['approved', 'rejected'].includes(body.status as string)) {
        const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
        if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

        updateData.status = body.status;
        updateData.approved_by = empRes.employee.id;
        updateData.approved_at = new Date().toISOString();
      }
      if (body.usage_type && ['open', 'time_off', 'payout'].includes(body.usage_type as string)) {
        updateData.usage_type = body.usage_type;
      }
      if (typeof body.payout_note === 'string') {
        updateData.payout_note = body.payout_note || null;
      }
    } else {
      // Employee: can only cancel own pending
      if (body.status === 'cancelled') {
        updateData.status = 'cancelled';
      } else {
        return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from('overtime_entries')
      .update(updateData)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Eintrag nicht gefunden.' }, { status: error ? 500 : 404 });
    }

    return NextResponse.json({ ok: true, entry: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/overtime/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
