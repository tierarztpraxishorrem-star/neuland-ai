import { NextResponse } from 'next/server';
import {
  getUserPractice,
  getServiceSupabaseClient,
} from '../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
  getOrCreateEmployee,
} from '../../../../lib/server/hrUtils';

type DocumentRow = {
  id: string;
  employee_id: string;
  category: string;
  title: string;
  file_path: string;
  uploaded_at: string;
};

const ALLOWED_CATEGORIES = ['contract', 'payslip', 'certificate', 'training', 'other'];

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const url = new URL(req.url);
    const category = url.searchParams.get('category');

    let query = supabase
      .from('hr_documents')
      .select('id, employee_id, category, title, file_path, uploaded_at')
      .eq('practice_id', practiceId)
      .order('uploaded_at', { ascending: false });

    // Non-admins only see their own documents
    if (role !== 'owner' && role !== 'admin') {
      const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
      if (!employeeRes.ok) {
        return NextResponse.json({ error: employeeRes.error }, { status: 500 });
      }
      query = query.eq('employee_id', employeeRes.employee.id);
    }

    if (category && ALLOWED_CATEGORIES.includes(category)) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden der Dokumente.' }, { status: 500 });
    }

    // Generate signed URLs for each document
    const service = getServiceSupabaseClient();
    const documents = await Promise.all(
      ((data || []) as DocumentRow[]).map(async (doc) => {
        let downloadUrl: string | null = null;
        if (service) {
          const { data: signedData } = await service.storage
            .from('hr-documents')
            .createSignedUrl(doc.file_path, 3600);
          downloadUrl = signedData?.signedUrl || null;
        }
        return { ...doc, download_url: downloadUrl };
      })
    );

    return NextResponse.json({ ok: true, documents });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/documents] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
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

    const formData = await req.formData();
    const employeeId = formData.get('employee_id') as string | null;
    const category = formData.get('category') as string | null;
    const title = formData.get('title') as string | null;
    const file = formData.get('file') as File | null;

    if (!employeeId) {
      return NextResponse.json({ error: 'Mitarbeiter-ID ist erforderlich.' }, { status: 400 });
    }

    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Ungültige Dokumentkategorie.' }, { status: 400 });
    }

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Titel ist erforderlich.' }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: 'Datei ist erforderlich.' }, { status: 400 });
    }

    const service = getServiceSupabaseClient();
    if (!service) {
      return NextResponse.json({ error: 'Storage-Konfiguration fehlt.' }, { status: 500 });
    }

    const ext = file.name.split('.').pop() || 'bin';
    const filePath = `${practiceId}/${employeeId}/${crypto.randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await service.storage
      .from('hr-documents')
      .upload(filePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || 'Fehler beim Hochladen.' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('hr_documents')
      .insert({
        practice_id: practiceId,
        employee_id: employeeId,
        category,
        title: title.trim(),
        file_path: filePath,
      })
      .select('id, employee_id, category, title, file_path, uploaded_at')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Dokument konnte nicht gespeichert werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, document: data as DocumentRow }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/documents] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
