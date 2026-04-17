import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

const PATIENT_COLUMNS = `
  id, practice_id, patient_id, patient_name, patient_number, chip_number,
  species, breed, birth_date, gender, owner_name, weight_kg,
  box_number, station_day, admission_date, discharge_date,
  diagnosis, problems, cave, cave_details,
  has_collar, has_iv_catheter, iv_catheter_location, iv_catheter_date,
  diet_type, diet_notes, rer_kcal, maintenance_ml_per_h,
  dnr, status, responsible_vet, responsible_tfa,
  created_by, created_at, updated_at
`;

const INSERT_FIELDS = [
  'patient_id', 'patient_name', 'patient_number', 'chip_number',
  'species', 'breed', 'birth_date', 'gender', 'owner_name', 'weight_kg',
  'box_number', 'station_day', 'admission_date', 'discharge_date',
  'diagnosis', 'problems', 'cave', 'cave_details',
  'has_collar', 'has_iv_catheter', 'iv_catheter_location', 'iv_catheter_date',
  'diet_type', 'diet_notes', 'rer_kcal', 'maintenance_ml_per_h',
  'dnr', 'responsible_vet', 'responsible_tfa',
] as const;

export async function GET(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;

    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'active';

    let query = supabase
      .from('station_patients')
      .select(PATIENT_COLUMNS)
      .eq('practice_id', practiceId)
      .order('box_number', { ascending: true });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[api/station/patients] GET Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Laden der Stationspatienten.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, patients: data || [] });
  } catch (error) {
    console.error('[api/station/patients] GET Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId, userId } = auth.context;

    const body = await req.json();
    if (!body.patient_name?.trim()) {
      return NextResponse.json({ error: 'Patientenname ist erforderlich.' }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      practice_id: practiceId,
      created_by: userId,
    };
    for (const field of INSERT_FIELDS) {
      if (body[field] !== undefined) {
        insert[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from('station_patients')
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error('[api/station/patients] POST Fehler:', error);
      return NextResponse.json({ error: 'Fehler beim Anlegen des Stationspatienten.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, patient: data }, { status: 201 });
  } catch (error) {
    console.error('[api/station/patients] POST Fehler:', error);
    return NextResponse.json({ error: 'Unbekannter Fehler.' }, { status: 500 });
  }
}
