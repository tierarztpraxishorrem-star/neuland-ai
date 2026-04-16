import { NextResponse } from 'next/server';
import {
  getUserPractice,
  getServiceSupabaseClient,
} from '../../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../../lib/server/hrUtils';

type Ctx = { params: Promise<{ id: string }> };

const SIGNED_URL_TTL = 60 * 60; // 1 hour

// GET → returns a signed download URL. RLS decides whether the caller may see the row.
export async function GET(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: 'ID fehlt.' }, { status: 400 });
    }

    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('payslips')
      .select('id, file_path, practice_id')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 });
    }

    const service = getServiceSupabaseClient();
    if (!service) {
      return NextResponse.json({ error: 'Storage-Konfiguration fehlt.' }, { status: 500 });
    }

    const { data: signed, error: signErr } = await service.storage
      .from('payslips')
      .createSignedUrl(data.file_path, SIGNED_URL_TTL);

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json({ error: signErr?.message || 'Download-Link konnte nicht erstellt werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: signed.signedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/payslips/:id] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE → removes row (admins only) and deletes storage object
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: 'ID fehlt.' }, { status: 400 });
    }

    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const { data, error: fetchErr } = await supabase
      .from('payslips')
      .select('id, file_path')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .maybeSingle();

    if (fetchErr || !data) {
      return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 });
    }

    const { error: deleteErr } = await supabase
      .from('payslips')
      .delete()
      .eq('id', id)
      .eq('practice_id', practiceId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message || 'Löschen fehlgeschlagen.' }, { status: 500 });
    }

    const service = getServiceSupabaseClient();
    if (service) {
      await service.storage.from('payslips').remove([data.file_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/payslips/:id] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
