import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../../lib/server/hrUtils';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: documentId } = await params;
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action as string; // 'sign' or 'reject'

    if (!action || !['sign', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action muss "sign" oder "reject" sein.' }, { status: 400 });
    }

    // Find pending signature for this employee and document
    const { data: sig, error: sigError } = await supabase
      .from('document_signatures')
      .select('*')
      .eq('document_id', documentId)
      .eq('signer_employee_id', empRes.employee.id)
      .in('status', ['pending', 'opened'])
      .single();

    if (sigError || !sig) {
      return NextResponse.json({ error: 'Keine offene Signatur-Anfrage gefunden.' }, { status: 404 });
    }

    // Check expiry
    if (sig.expires_at && new Date(sig.expires_at) < new Date()) {
      await supabase
        .from('document_signatures')
        .update({ status: 'expired' })
        .eq('id', sig.id);
      return NextResponse.json({ error: 'Die Signatur-Anfrage ist abgelaufen.' }, { status: 410 });
    }

    const now = new Date().toISOString();
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    if (action === 'sign') {
      const { data: updated, error } = await supabase
        .from('document_signatures')
        .update({
          status: 'signed',
          signed_at: now,
          signature_data: {
            ip,
            user_agent: userAgent,
            consent_text: 'Ich bestätige, dass ich dieses Dokument gelesen habe und damit einverstanden bin.',
            timestamp: now,
          },
        })
        .eq('id', sig.id)
        .select('*')
        .single();

      if (error || !updated) {
        return NextResponse.json({ error: error?.message || 'Fehler beim Signieren.' }, { status: 500 });
      }

      // Update document status to signed
      await supabase
        .from('hr_documents')
        .update({ status: 'signed' })
        .eq('id', documentId);

      return NextResponse.json({ ok: true, signature: updated });
    } else {
      // Reject
      const { data: updated, error } = await supabase
        .from('document_signatures')
        .update({ status: 'rejected', rejected_at: now })
        .eq('id', sig.id)
        .select('*')
        .single();

      if (error || !updated) {
        return NextResponse.json({ error: error?.message || 'Fehler beim Ablehnen.' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, signature: updated });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/documents/[id]/sign] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
