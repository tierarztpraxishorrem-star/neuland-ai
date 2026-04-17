import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../../../lib/server/hrUtils';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: documentId } = await params;
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.signer_employee_id || typeof body.signer_employee_id !== 'string') {
      return NextResponse.json({ error: 'signer_employee_id ist erforderlich.' }, { status: 400 });
    }

    // Verify document exists
    const { data: doc } = await supabase
      .from('hr_documents')
      .select('id, status')
      .eq('id', documentId)
      .eq('practice_id', practiceId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 });
    }

    const requesterRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!requesterRes.ok) return NextResponse.json({ error: requesterRes.error }, { status: 500 });

    // Calculate expiry (default 14 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (typeof body.expires_in_days === 'number' ? body.expires_in_days : 14));

    const { data: signature, error } = await supabase
      .from('document_signatures')
      .insert({
        practice_id: practiceId,
        document_id: documentId,
        signer_employee_id: body.signer_employee_id,
        requested_by: requesterRes.employee.id,
        expires_at: expiresAt.toISOString(),
      })
      .select('*')
      .single();

    if (error || !signature) {
      return NextResponse.json({ error: error?.message || 'Signatur-Anfrage konnte nicht erstellt werden.' }, { status: 500 });
    }

    // Update document status
    await supabase
      .from('hr_documents')
      .update({ status: 'sent_for_signature' })
      .eq('id', documentId);

    return NextResponse.json({ ok: true, signature }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/documents/[id]/sign-request] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
