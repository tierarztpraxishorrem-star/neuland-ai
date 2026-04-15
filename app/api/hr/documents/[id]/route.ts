import { NextResponse } from 'next/server';
import {
  getUserPractice,
  getServiceSupabaseClient,
} from '../../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
} from '../../../../../lib/server/hrUtils';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    // Get file path before deleting
    const { data: doc } = await supabase
      .from('hr_documents')
      .select('file_path')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single();

    if (!doc) {
      return NextResponse.json({ error: 'Dokument nicht gefunden.' }, { status: 404 });
    }

    // Delete from storage
    const service = getServiceSupabaseClient();
    if (service && doc.file_path) {
      await service.storage.from('hr-documents').remove([doc.file_path]);
    }

    // Delete database record
    const { error } = await supabase
      .from('hr_documents')
      .delete()
      .eq('id', id)
      .eq('practice_id', practiceId);

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Löschen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/documents/[id]] DELETE Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
