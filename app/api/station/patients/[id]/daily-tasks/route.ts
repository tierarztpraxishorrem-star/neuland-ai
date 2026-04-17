import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

// Standard-Tasks die bei jedem Patienten angelegt werden
const DEFAULT_TASKS = [
  'Untersucht (klin. Untersuchung)',
  'Karteineintrag + Abrechnung',
  'Venenkatheter gecheckt',
  'Besitzer angerufen / informiert',
  'Abholung / weiterer Aufenthalt geklärt',
];

// GET → Tasks + heutige Checks laden
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id: patientId } = await ctx.params;

    const url = new URL(req.url);
    const dateStr = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);

    // Tasks laden
    const { data: tasks, error: tErr } = await supabase
      .from('station_daily_tasks')
      .select('id, label, is_default, sort_order')
      .eq('station_patient_id', patientId)
      .eq('practice_id', practiceId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    // Falls keine Tasks → Default-Tasks anlegen
    if ((tasks || []).length === 0) {
      const inserts = DEFAULT_TASKS.map((label, i) => ({
        station_patient_id: patientId,
        practice_id: practiceId,
        label,
        is_default: true,
        sort_order: i,
      }));
      const { data: created, error: cErr } = await supabase
        .from('station_daily_tasks')
        .insert(inserts)
        .select('id, label, is_default, sort_order');
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

      // Checks für neue Tasks = leer
      return NextResponse.json({
        ok: true,
        tasks: (created || []).map((t) => ({ ...t, checked: false, checked_at: null, checked_by: null, check_id: null, notes: null })),
        date: dateStr,
      });
    }

    // Checks für heute laden
    const taskIds = (tasks || []).map((t) => t.id);
    const { data: checks } = await supabase
      .from('station_daily_checks')
      .select('id, task_id, checked_at, checked_by, notes')
      .eq('station_patient_id', patientId)
      .eq('check_date', dateStr)
      .in('task_id', taskIds);

    const checkMap = new Map<string, { id: string; checked_at: string; checked_by: string | null; notes: string | null }>();
    for (const c of (checks || [])) {
      checkMap.set(c.task_id, { id: c.id, checked_at: c.checked_at, checked_by: c.checked_by, notes: c.notes });
    }

    const merged = (tasks || []).map((t) => {
      const c = checkMap.get(t.id);
      return {
        ...t,
        checked: Boolean(c),
        checked_at: c?.checked_at || null,
        checked_by: c?.checked_by || null,
        check_id: c?.id || null,
        notes: c?.notes || null,
      };
    });

    return NextResponse.json({ ok: true, tasks: merged, date: dateStr });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST → Task abhaken. Body: { task_id, checked_by?, notes? }
//        Oder neuen Task anlegen: { label }
export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId } = auth.context;
    const { id: patientId } = await ctx.params;

    const body = await req.json().catch(() => ({}));

    // Neuen Task anlegen
    if (typeof body?.label === 'string' && body.label.trim()) {
      const { data, error } = await supabase
        .from('station_daily_tasks')
        .insert({
          station_patient_id: patientId,
          practice_id: practiceId,
          label: body.label.trim(),
          is_default: false,
          sort_order: 99,
        })
        .select('id, label, is_default, sort_order')
        .single();
      if (error || !data) return NextResponse.json({ error: error?.message || 'Fehler.' }, { status: 500 });
      return NextResponse.json({ ok: true, task: { ...data, checked: false, checked_at: null, checked_by: null, check_id: null, notes: null } }, { status: 201 });
    }

    // Check abhaken
    const taskId = typeof body?.task_id === 'string' ? body.task_id : '';
    if (!taskId) return NextResponse.json({ error: 'task_id oder label erforderlich.' }, { status: 400 });

    const checkedBy = typeof body?.checked_by === 'string' ? body.checked_by.toUpperCase().slice(0, 4) : null;
    const notes = typeof body?.notes === 'string' ? body.notes : null;
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('station_daily_checks')
      .upsert(
        {
          task_id: taskId,
          station_patient_id: patientId,
          practice_id: practiceId,
          check_date: today,
          checked_by: checkedBy,
          user_id: userId,
          notes,
        },
        { onConflict: 'task_id,check_date' }
      )
      .select('id, task_id, checked_at, checked_by, notes')
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || 'Check fehlgeschlagen.' }, { status: 500 });
    return NextResponse.json({ ok: true, check: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE → Check rückgängig machen. Query: ?check_id=...
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const url = new URL(req.url);
    const checkId = url.searchParams.get('check_id');
    if (!checkId) return NextResponse.json({ error: 'check_id fehlt.' }, { status: 400 });

    const { error } = await supabase
      .from('station_daily_checks')
      .delete()
      .eq('id', checkId)
      .eq('practice_id', practiceId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
