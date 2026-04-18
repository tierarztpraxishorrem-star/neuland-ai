import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../lib/server/getUserPractice';

const UPDATE_FIELDS = [
  'patient_name', 'patient_number', 'chip_number',
  'species', 'breed', 'birth_date', 'gender', 'owner_name', 'weight_kg',
  'box_number', 'station_day', 'admission_date', 'discharge_date',
  'diagnosis', 'problems', 'cave', 'cave_details',
  'has_collar', 'has_iv_catheter', 'iv_catheter_location', 'iv_catheter_date',
  'diet_type', 'diet_notes', 'rer_kcal', 'maintenance_ml_per_h',
  'dnr', 'status', 'responsible_vet', 'responsible_tfa',
] as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id } = await ctx.params;

    const { data: patient, error } = await supabase
      .from('station_patients')
      .select('*')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single();

    if (error || !patient) {
      return NextResponse.json({ error: 'Patient nicht gefunden.' }, { status: 404 });
    }

    const [medsRes, vitalsRes, alertsRes, paramsRes] = await Promise.all([
      supabase
        .from('station_medications')
        .select('*')
        .eq('station_patient_id', id)
        .order('is_active', { ascending: false })
        .order('sort_order', { ascending: true }),
      supabase
        .from('station_vitals')
        .select('*')
        .eq('station_patient_id', id)
        .order('measured_at', { ascending: false })
        .limit(50),
      supabase
        .from('station_ai_alerts')
        .select('*')
        .eq('station_patient_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('station_vital_params')
        .select('*')
        .eq('station_patient_id', id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

    // Load today's administrations + custom values
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString().split('T')[0];

    const [adminsRes, customValsRes] = await Promise.all([
      supabase
        .from('station_med_administrations')
        .select('*')
        .eq('station_patient_id', id)
        .gte('created_at', todayStart.toISOString()),
      supabase
        .from('station_vital_custom_values')
        .select('*')
        .eq('station_patient_id', id)
        .eq('measured_date', todayStr),
    ]);

    // Dynamisch station_day berechnen: Tage seit Aufnahme, Tageswechsel um 6 Uhr
    if (patient.admission_date && patient.status === 'active') {
      const now = new Date();
      // "Stationstag" wechselt um 6:00 Uhr morgens
      const effectiveNow = new Date(now);
      if (effectiveNow.getHours() < 6) effectiveNow.setDate(effectiveNow.getDate() - 1);
      effectiveNow.setHours(12, 0, 0, 0); // normalize to noon

      const admission = new Date(patient.admission_date + 'T12:00:00');
      const diffMs = effectiveNow.getTime() - admission.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      patient.station_day = Math.max(1, diffDays + 1);
    }

    return NextResponse.json({
      ok: true,
      patient,
      medications: medsRes.data || [],
      vitals: vitalsRes.data || [],
      alerts: alertsRes.data || [],
      administrations: adminsRes.data || [],
      custom_params: paramsRes.data || [],
      custom_values: customValsRes.data || [],
    });
  } catch (error) {
    console.error('[api/station/patients/[id]] GET Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id } = await ctx.params;

    const body = await req.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of UPDATE_FIELDS) {
      if (body[field] !== undefined) {
        update[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from('station_patients')
      .update(update)
      .eq('id', id)
      .eq('practice_id', practiceId)
      .select()
      .single();

    if (error) {
      console.error('[api/station/patients/[id]] PATCH Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, patient: data });
  } catch (error) {
    console.error('[api/station/patients/[id]] PATCH Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id } = await ctx.params;

    const { error } = await supabase
      .from('station_patients')
      .update({ status: 'discharged', discharge_date: new Date().toISOString().split('T')[0], updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('practice_id', practiceId);

    if (error) {
      console.error('[api/station/patients/[id]] DELETE Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Entlassen.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/station/patients/[id]] DELETE Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}
