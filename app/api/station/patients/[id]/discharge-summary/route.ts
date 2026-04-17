import { NextResponse } from 'next/server';
import { getUserPractice, getServiceSupabaseClient } from '../../../../../../lib/server/getUserPractice';
import jsPDF from 'jspdf';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

const BRAND = [15, 107, 116] as const;
const INK = [31, 41, 55] as const;
const MUTED = [100, 116, 139] as const;

// GET → Entlassungsbericht als PDF
export async function GET(req: Request, ctx: Ctx) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { practiceId } = auth.context;
    const { id: patientId } = await ctx.params;

    const service = getServiceSupabaseClient();
    if (!service) return NextResponse.json({ error: 'Service-Konfiguration fehlt.' }, { status: 500 });

    // Patient laden
    const { data: patient } = await service
      .from('station_patients')
      .select('*')
      .eq('id', patientId)
      .eq('practice_id', practiceId)
      .maybeSingle();
    if (!patient) return NextResponse.json({ error: 'Patient nicht gefunden.' }, { status: 404 });

    // Medikamente (aktive + deaktivierte)
    const { data: meds } = await service
      .from('station_medications')
      .select('name, dose, route, frequency_label, is_active, is_dti, dti_rate_ml_h, valid_from, valid_to')
      .eq('station_patient_id', patientId)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true });

    // Vitals (alle Tage, max 200)
    const { data: vitals } = await service
      .from('station_vitals')
      .select('measured_at, heart_rate, resp_rate, temperature_c, pain_score')
      .eq('station_patient_id', patientId)
      .order('measured_at', { ascending: true })
      .limit(200);

    // Care-Log
    const { data: careEntries } = await service
      .from('station_care_log')
      .select('care_type, notes, created_at')
      .eq('station_patient_id', patientId)
      .order('created_at', { ascending: true })
      .limit(100);

    // PDF erstellen
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const w = pdf.internal.pageSize.getWidth();
    let y = 40;

    // Header
    pdf.setFillColor(...BRAND);
    pdf.rect(0, 0, w, 60, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Entlassungsbericht', 30, 38);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Erstellt: ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`, w - 30, 38, { align: 'right' });
    y = 80;

    pdf.setTextColor(...INK);

    // Patient Info
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(patient.patient_name || 'Unbekannt', 30, y);
    y += 18;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...MUTED);
    const infoLine = [patient.species, patient.breed, patient.gender, patient.weight_kg ? `${patient.weight_kg} kg` : null, `Besitzer: ${patient.owner_name || '–'}`].filter(Boolean).join(' · ');
    pdf.text(infoLine, 30, y);
    y += 14;
    pdf.text(`Aufnahme: ${formatDate(patient.admission_date)} · Entlassung: ${formatDate(patient.discharge_date)} · ${patient.station_day || '?'} Tage`, 30, y);
    y += 20;

    // Diagnose
    pdf.setTextColor(...INK);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Diagnose', 30, y);
    y += 14;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(patient.diagnosis || '–', 30, y, { maxWidth: w - 60 });
    y += pdf.getTextDimensions(patient.diagnosis || '–', { maxWidth: w - 60 }).h + 10;

    if (patient.problems) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('Probleme', 30, y);
      y += 14;
      pdf.setFont('helvetica', 'normal');
      pdf.text(patient.problems, 30, y, { maxWidth: w - 60 });
      y += pdf.getTextDimensions(patient.problems, { maxWidth: w - 60 }).h + 10;
    }

    // Medikamente
    y += 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Medikamente', 30, y);
    y += 14;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    for (const med of (meds || [])) {
      if (y > 760) { pdf.addPage(); y = 40; }
      const status = med.is_active ? '' : ` [abgesetzt ${formatDate(med.valid_to)}]`;
      const dtiLabel = med.is_dti ? ` DTI ${med.dti_rate_ml_h} ml/h` : '';
      if (med.is_active) { pdf.setTextColor(...INK); } else { pdf.setTextColor(...MUTED); }
      pdf.text(`• ${med.name} ${med.dose || ''} ${med.route || ''} ${med.frequency_label || ''}${dtiLabel}${status}`, 34, y, { maxWidth: w - 68 });
      y += 12;
    }

    // Vitalwerte-Verlauf (Zusammenfassung)
    y += 8;
    if (y > 720) { pdf.addPage(); y = 40; }
    pdf.setTextColor(...INK);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Vitalwerte-Verlauf', 30, y);
    y += 14;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    if ((vitals || []).length === 0) {
      pdf.text('Keine Vitalwerte dokumentiert.', 34, y);
      y += 12;
    } else {
      const hrs = (vitals || []).filter((v) => v.heart_rate != null).map((v) => Number(v.heart_rate));
      const rrs = (vitals || []).filter((v) => v.resp_rate != null).map((v) => Number(v.resp_rate));
      const temps = (vitals || []).filter((v) => v.temperature_c != null).map((v) => Number(v.temperature_c));
      if (hrs.length) { pdf.text(`HF: ${Math.min(...hrs)} – ${Math.max(...hrs)} (n=${hrs.length})`, 34, y); y += 12; }
      if (rrs.length) { pdf.text(`AF: ${Math.min(...rrs)} – ${Math.max(...rrs)} (n=${rrs.length})`, 34, y); y += 12; }
      if (temps.length) { pdf.text(`Temp: ${Math.min(...temps).toFixed(1)} – ${Math.max(...temps).toFixed(1)} °C (n=${temps.length})`, 34, y); y += 12; }
    }

    // Pflege-Zusammenfassung
    if ((careEntries || []).length > 0) {
      y += 8;
      if (y > 720) { pdf.addPage(); y = 40; }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text('Pflegeprotokoll', 30, y);
      y += 14;
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      for (const e of (careEntries || []).slice(0, 30)) {
        if (y > 760) { pdf.addPage(); y = 40; }
        const date = new Date(e.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        pdf.text(`${date} · ${e.care_type}: ${e.notes || '–'}`, 34, y, { maxWidth: w - 68 });
        y += 12;
      }
    }

    // Footer
    const totalPages = pdf.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.setTextColor(...MUTED);
      pdf.text(`Neuland AI – Entlassungsbericht · Seite ${p}/${totalPages}`, w / 2, pdf.internal.pageSize.getHeight() - 20, { align: 'center' });
    }

    const buffer = Buffer.from(pdf.output('arraybuffer'));
    const fileName = `Entlassungsbericht_${(patient.patient_name || 'Patient').replace(/\s+/g, '_')}_${formatDate(patient.discharge_date || new Date().toISOString())}.pdf`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/station/patients/:id/discharge-summary] GET Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
