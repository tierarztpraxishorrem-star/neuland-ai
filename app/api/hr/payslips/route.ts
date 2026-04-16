import { NextResponse } from 'next/server';
import {
  getUserPractice,
  getServiceSupabaseClient,
} from '../../../../lib/server/getUserPractice';
import {
  getHrFeatureEnabled,
  getOrCreateEmployee,
} from '../../../../lib/server/hrUtils';

type PayslipRow = {
  id: string;
  employee_id: string;
  title: string;
  month: number;
  year: number;
  file_path: string;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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
    const yearParam = url.searchParams.get('year');
    const employeeFilter = url.searchParams.get('employee_id');

    let query = supabase
      .from('payslips')
      .select('id, employee_id, title, month, year, file_path, file_size, uploaded_by, created_at')
      .eq('practice_id', practiceId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    const isAdmin = role === 'owner' || role === 'admin';

    if (!isAdmin) {
      const employeeRes = await getOrCreateEmployee(supabase, practiceId, userId);
      if (!employeeRes.ok) {
        return NextResponse.json({ error: employeeRes.error }, { status: 500 });
      }
      query = query.eq('employee_id', employeeRes.employee.id);
    } else if (employeeFilter) {
      query = query.eq('employee_id', employeeFilter);
    }

    if (yearParam) {
      const year = Number(yearParam);
      if (!Number.isNaN(year)) query = query.eq('year', year);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message || 'Fehler beim Laden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, payslips: (data || []) as PayslipRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/payslips] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) {
      return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    }
    if (!featureCheck.enabled) {
      return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });
    }

    const formData = await req.formData();
    const employeeId = formData.get('employee_id') as string | null;
    const title = formData.get('title') as string | null;
    const monthRaw = formData.get('month') as string | null;
    const yearRaw = formData.get('year') as string | null;
    const file = formData.get('file') as File | null;

    if (!employeeId) {
      return NextResponse.json({ error: 'Mitarbeiter-ID ist erforderlich.' }, { status: 400 });
    }
    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Titel ist erforderlich.' }, { status: 400 });
    }
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Monat muss zwischen 1 und 12 liegen.' }, { status: 400 });
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Jahr ist ungültig.' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: 'PDF-Datei ist erforderlich.' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Datei überschreitet 10 MB.' }, { status: 400 });
    }
    const contentType = file.type || 'application/octet-stream';
    if (contentType !== 'application/pdf') {
      return NextResponse.json({ error: 'Nur PDF-Dateien sind erlaubt.' }, { status: 400 });
    }

    const service = getServiceSupabaseClient();
    if (!service) {
      return NextResponse.json({ error: 'Storage-Konfiguration fehlt.' }, { status: 500 });
    }

    // Verify target employee belongs to practice
    const empCheck = await service
      .from('employees')
      .select('id')
      .eq('id', employeeId)
      .eq('practice_id', practiceId)
      .maybeSingle();
    if (empCheck.error || !empCheck.data) {
      return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 });
    }

    // Find uploader's employee record (optional – can be null if admin is owner without employee)
    const uploaderRes = await service
      .from('employees')
      .select('id')
      .eq('practice_id', practiceId)
      .eq('user_id', userId)
      .maybeSingle();
    const uploadedBy = uploaderRes.data?.id || null;

    const filePath = `${practiceId}/${employeeId}/${crypto.randomUUID()}.pdf`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await service.storage
      .from('payslips')
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || 'Fehler beim Hochladen.' }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('payslips')
      .insert({
        practice_id: practiceId,
        employee_id: employeeId,
        title: title.trim(),
        month,
        year,
        file_path: filePath,
        file_size: file.size,
        uploaded_by: uploadedBy,
      })
      .select('id, employee_id, title, month, year, file_path, file_size, uploaded_by, created_at')
      .single();

    if (error || !data) {
      // Rollback storage upload if DB insert fails
      await service.storage.from('payslips').remove([filePath]);
      return NextResponse.json({ error: error?.message || 'Datensatz konnte nicht gespeichert werden.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, payslip: data as PayslipRow }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/payslips] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
