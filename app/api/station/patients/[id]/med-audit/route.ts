import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// GET → Audit-Log aller Medikamenten-Aktionen dieses Patienten
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id: patientId } = await ctx.params;
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);

    const { data, error } = await supabase
      .from('station_med_audit_log')
      .select('id, medication_id, action, details, user_initials, created_at')
      .eq('station_patient_id', patientId)
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, entries: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
