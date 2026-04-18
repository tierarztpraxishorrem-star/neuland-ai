import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export async function GET(req: Request) {
  try {
    const result = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!result.ok) return result.response;

    const { supabase, practiceId } = result.context;

    // Fetch registrations with animals
    const { data: registrations, error } = await supabase
      .from('patient_registrations')
      .select('*')
      .eq('practice_id', practiceId)
      .order('submitted_at', { ascending: false });

    if (error) {
      console.error('Registrations fetch error:', error);
      return NextResponse.json({ error: 'Fehler beim Laden der Registrierungen.' }, { status: 500 });
    }

    // Fetch animals for all registrations
    const regIds = (registrations || []).map((r: { id: string }) => r.id);
    let animals: Array<Record<string, unknown>> = [];

    if (regIds.length > 0) {
      const { data: animalsData } = await supabase
        .from('registration_animals')
        .select('*')
        .in('registration_id', regIds)
        .order('sort_order', { ascending: true });

      animals = animalsData || [];
    }

    // Merge animals into registrations
    const merged = (registrations || []).map((reg: Record<string, unknown>) => ({
      ...reg,
      animals: animals.filter((a) => a.registration_id === reg.id),
    }));

    // Count pending
    const pendingCount = (registrations || []).filter(
      (r: { status: string }) => r.status === 'pending',
    ).length;

    return NextResponse.json({ registrations: merged, pending_count: pendingCount });
  } catch (err) {
    console.error('Registrations GET error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const result = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!result.ok) return result.response;

    const { supabase, userId } = result.context;
    const body = await req.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Registrierungs-ID fehlt.' }, { status: 400 });
    }

    const newStatus = body.status || 'processed';
    if (!['pending', 'processed', 'archived'].includes(newStatus)) {
      return NextResponse.json({ error: 'Ungültiger Status.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
    };

    if (newStatus === 'processed') {
      updateData.processed_by = userId;
      updateData.processed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('patient_registrations')
      .update(updateData)
      .eq('id', body.id);

    if (error) {
      console.error('Registration update error:', error);
      return NextResponse.json({ error: 'Fehler beim Aktualisieren.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Registrations PATCH error:', err);
    return NextResponse.json({ error: 'Serverfehler.' }, { status: 500 });
  }
}
