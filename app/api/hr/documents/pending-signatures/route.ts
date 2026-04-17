import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../lib/server/hrUtils';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    const { data, error } = await supabase
      .from('document_signatures')
      .select(`
        id, document_id, status, requested_at, expires_at,
        hr_documents!document_signatures_document_id_fkey (id, title, category, file_path)
      `)
      .eq('signer_employee_id', empRes.employee.id)
      .in('status', ['pending', 'opened'])
      .order('requested_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark as opened
    const pendingIds = (data || []).filter((s) => s.status === 'pending').map((s) => s.id);
    if (pendingIds.length > 0) {
      await supabase
        .from('document_signatures')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .in('id', pendingIds);
    }

    return NextResponse.json({ ok: true, signatures: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/documents/pending-signatures] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
