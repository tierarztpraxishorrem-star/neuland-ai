import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const result = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!result.ok) return result.response;
    const { supabase, practiceId } = result.context;

    const url = new URL(req.url);
    const days = Math.min(Number(url.searchParams.get('days')) || 30, 365);

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    // Fetch registrations + animals in period
    const [regRes, animRes, allRegRes] = await Promise.all([
      supabase
        .from('patient_registrations')
        .select('id, submitted_at, referral_source, referring_vet, zip, city, appointment_date, appointment_time, status')
        .eq('practice_id', practiceId)
        .gte('submitted_at', sinceISO)
        .order('submitted_at', { ascending: true }),
      supabase
        .from('registration_animals')
        .select('id, registration_id, species, breed, has_insurance, insurance_company, wants_direct_billing, assignment_signed')
        .eq('practice_id', practiceId),
      supabase
        .from('patient_registrations')
        .select('id, submitted_at')
        .eq('practice_id', practiceId),
    ]);

    const regs = regRes.data || [];
    const animals = animRes.data || [];
    const allRegs = allRegRes.data || [];

    // Filter animals to those in-period registrations
    const regIds = new Set(regs.map((r) => r.id));
    const periodAnimals = animals.filter((a) => regIds.has(a.registration_id));

    // 1. Registrations per day
    const dayCounts: Record<string, number> = {};
    for (const r of regs) {
      const day = r.submitted_at?.slice(0, 10) || '';
      if (day) dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    const proTag = Object.entries(dayCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // 2. Species distribution
    const speciesCounts: Record<string, number> = {};
    for (const a of periodAnimals) {
      const s = a.species || 'Unbekannt';
      speciesCounts[s] = (speciesCounts[s] || 0) + 1;
    }
    const tierarten = Object.entries(speciesCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    // 3. Top breeds
    const breedCounts: Record<string, number> = {};
    for (const a of periodAnimals) {
      if (a.breed) breedCounts[a.breed] = (breedCounts[a.breed] || 0) + 1;
    }
    const topRassen = Object.entries(breedCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // 4. Insurance stats
    const versichert = periodAnimals.filter((a) => a.has_insurance).length;
    const versicherungsQuote = periodAnimals.length > 0 ? Math.round((versichert / periodAnimals.length) * 100) : 0;

    const insuranceCounts: Record<string, number> = {};
    for (const a of periodAnimals) {
      if (a.has_insurance && a.insurance_company) {
        insuranceCounts[a.insurance_company] = (insuranceCounts[a.insurance_company] || 0) + 1;
      }
    }
    const versicherer = Object.entries(insuranceCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    // 5. Assignment / Direktabrechnung stats
    const abtretungen = periodAnimals.filter((a) => a.assignment_signed).length;
    const direktabrechnung = periodAnimals.filter((a) => a.wants_direct_billing).length;

    // 6. Referral sources
    const referralCounts: Record<string, number> = {};
    for (const r of regs) {
      const src = r.referral_source || 'Keine Angabe';
      referralCounts[src] = (referralCounts[src] || 0) + 1;
    }
    const aufmerksam = Object.entries(referralCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    // 7. Has referring vet
    const mitHaustierarzt = regs.filter((r) => r.referring_vet).length;
    const haustierarztQuote = regs.length > 0 ? Math.round((mitHaustierarzt / regs.length) * 100) : 0;

    // 8. ZIP / city distribution (top 10)
    const plzCounts: Record<string, number> = {};
    for (const r of regs) {
      const key = r.zip && r.city ? `${r.zip} ${r.city}` : r.zip || r.city || '';
      if (key) plzCounts[key] = (plzCounts[key] || 0) + 1;
    }
    const herkunft = Object.entries(plzCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // 9. Appointment time distribution
    const timeCounts: Record<string, number> = {};
    for (const r of regs) {
      if (r.appointment_time) {
        timeCounts[r.appointment_time] = (timeCounts[r.appointment_time] || 0) + 1;
      }
    }
    const terminzeiten = Object.entries(timeCounts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([time, count]) => ({ time, count }));

    // 10. Status distribution
    const statusCounts: Record<string, number> = {};
    for (const r of regs) {
      const s = r.status || 'pending';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    return NextResponse.json({
      practiceId,
      days,
      gesamt: allRegs.length,
      zeitraum: regs.length,
      tiereZeitraum: periodAnimals.length,
      proTag,
      tierarten,
      topRassen,
      versicherung: {
        quote: versicherungsQuote,
        versichert,
        gesamt: periodAnimals.length,
        versicherer,
        abtretungen,
        direktabrechnung,
      },
      aufmerksam,
      haustierarzt: {
        quote: haustierarztQuote,
        mitArzt: mitHaustierarzt,
        gesamt: regs.length,
      },
      herkunft,
      terminzeiten,
      status: statusCounts,
    });
  } catch (err) {
    console.error('[registration-stats]', err);
    return NextResponse.json({ error: 'Fehler beim Laden der Statistik.' }, { status: 500 });
  }
}
