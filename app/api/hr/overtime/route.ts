import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled, getOrCreateEmployee } from '../../../../lib/server/hrUtils';
import { isManagerRole } from '../../../../lib/hr/permissions';

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId, role } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const url = new URL(req.url);
    const isAdmin = url.searchParams.get('admin') === 'true';
    const statusFilter = url.searchParams.get('status');

    if (isAdmin && isManagerRole(role)) {
      let query = supabase
        .from('overtime_entries')
        .select('*')
        .eq('practice_id', practiceId)
        .order('date', { ascending: false });

      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Enrich with employee names
      const { data: employees } = await supabase
        .from('employees')
        .select('id, display_name, first_name, last_name')
        .eq('practice_id', practiceId);

      const empMap = new Map<string, string>();
      for (const e of employees || []) {
        empMap.set(e.id, e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : e.display_name || e.id.slice(0, 6));
      }

      const enriched = (data || []).map((o) => ({ ...o, employee_name: empMap.get(o.employee_id) || 'Unbekannt' }));
      return NextResponse.json({ ok: true, entries: enriched });
    }

    // Employee: own entries
    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    const { data, error } = await supabase
      .from('overtime_entries')
      .select('*')
      .eq('practice_id', practiceId)
      .eq('employee_id', empRes.employee.id)
      .order('date', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get balance
    const { data: balance } = await supabase.rpc('get_overtime_balance', { p_employee_id: empRes.employee.id });

    return NextResponse.json({ ok: true, entries: data || [], balance: balance?.[0] || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/overtime] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, userId } = auth.context;

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const empRes = await getOrCreateEmployee(supabase, practiceId, userId);
    if (!empRes.ok) return NextResponse.json({ error: empRes.error }, { status: 500 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date as string)) {
      return NextResponse.json({ error: 'Datum im Format YYYY-MM-DD erforderlich.' }, { status: 400 });
    }
    if (!body.minutes || Number(body.minutes) <= 0) {
      return NextResponse.json({ error: 'Minuten müssen > 0 sein.' }, { status: 400 });
    }
    if (!body.reason || typeof body.reason !== 'string' || !(body.reason as string).trim()) {
      return NextResponse.json({ error: 'Begründung ist erforderlich.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('overtime_entries')
      .insert({
        practice_id: practiceId,
        employee_id: empRes.employee.id,
        date: body.date,
        minutes: Number(body.minutes),
        reason: (body.reason as string).trim(),
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'Fehler beim Erstellen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entry: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/overtime] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
