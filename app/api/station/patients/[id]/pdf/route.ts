import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../../../lib/server/getUserPractice';
import { jsPDF } from 'jspdf';

type RouteContext = { params: Promise<{ id: string }> };

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];
const BRAND = { primary: [15, 107, 116] as const, ink: [31, 41, 55] as const, muted: [100, 116, 139] as const, line: [229, 231, 235] as const };

export async function GET(req: Request, ctx: RouteContext) {
  try {
    const auth = await getUserPractice(req);
    if (!auth.ok) return auth.response;
    const { supabase, practiceId } = auth.context;
    const { id } = await ctx.params;

    const { data: patient } = await supabase
      .from('station_patients')
      .select('*')
      .eq('id', id)
      .eq('practice_id', practiceId)
      .single();

    if (!patient) {
      return NextResponse.json({ error: 'Patient nicht gefunden.' }, { status: 404 });
    }

    const [medsRes, adminsRes, vitalsRes] = await Promise.all([
      supabase.from('station_medications').select('*').eq('station_patient_id', id).eq('is_active', true).order('sort_order'),
      supabase.from('station_med_administrations').select('*').eq('station_patient_id', id).gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabase.from('station_vitals').select('*').eq('station_patient_id', id).gte('measured_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()).order('measured_hour'),
    ]);

    const medications = medsRes.data || [];
    const administrations = adminsRes.data || [];
    const vitals = vitalsRes.data || [];

    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const mx = 30;
    let cy = 30;

    // Header
    doc.setFillColor(...BRAND.primary);
    doc.rect(0, 0, pw, 50, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('STATIONSBLATT', mx, 32);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, pw - mx, 22, { align: 'right' });
    doc.text(`Tag ${patient.station_day || 1}  |  Box ${patient.box_number || '–'}`, pw - mx, 38, { align: 'right' });
    cy = 70;

    // Patient info
    doc.setTextColor(...BRAND.ink);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(patient.patient_name, mx, cy);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BRAND.muted);
    const infoLine = [patient.species, patient.breed, patient.gender, patient.weight_kg ? `${patient.weight_kg} kg` : null, patient.owner_name ? `Besitzer: ${patient.owner_name}` : null].filter(Boolean).join('  |  ');
    doc.text(infoLine, mx, cy + 16);
    if (patient.diagnosis) {
      doc.text(`Diagnose: ${patient.diagnosis}`, mx, cy + 30);
    }
    if (patient.cave) {
      doc.setTextColor(220, 38, 38);
      doc.setFont('helvetica', 'bold');
      doc.text(`CAVE: ${patient.cave_details || 'Ja'}`, mx, cy + 44);
      doc.setFont('helvetica', 'normal');
    }
    cy = patient.cave ? cy + 64 : cy + 50;

    // Medications grid
    doc.setTextColor(...BRAND.ink);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('MEDIKAMENTE', mx, cy);
    cy += 16;

    const colNameW = 140;
    const colDoseW = 100;
    const colHourW = (pw - mx * 2 - colNameW - colDoseW) / HOURS.length;

    // Hour headers
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.muted);
    HOURS.forEach((h, i) => {
      const x = mx + colNameW + colDoseW + i * colHourW;
      doc.text(String(h).padStart(2, '0'), x + colHourW / 2, cy, { align: 'center' });
    });
    cy += 4;
    doc.setDrawColor(...BRAND.line);
    doc.line(mx, cy, pw - mx, cy);
    cy += 10;

    // Medication rows
    doc.setFontSize(8);
    medications.forEach((med: Record<string, unknown>) => {
      if (cy > ph - 60) {
        doc.addPage();
        cy = 40;
      }
      doc.setTextColor(...BRAND.ink);
      doc.setFont('helvetica', 'bold');
      doc.text(String(med.name || ''), mx, cy);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BRAND.muted);
      doc.text(String(med.dose || ''), mx + colNameW, cy);

      if (med.is_dti) {
        doc.setTextColor(...BRAND.primary);
        doc.text(`DTI ${med.dti_rate_ml_h} ml/h`, mx + colNameW + colDoseW, cy);
      } else if (med.is_prn) {
        doc.setTextColor(180, 130, 0);
        doc.text('bei Bedarf', mx + colNameW + colDoseW, cy);
      } else {
        const scheduledHours = (med.scheduled_hours as number[]) || [];
        HOURS.forEach((h, i) => {
          const x = mx + colNameW + colDoseW + i * colHourW + colHourW / 2;
          if (scheduledHours.includes(h)) {
            const admin = administrations.find(
              (a: Record<string, unknown>) => a.medication_id === med.id && a.scheduled_hour === h
            );
            if (admin) {
              doc.setFillColor(...BRAND.primary);
              doc.circle(x, cy - 3, 4, 'F');
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(5);
              doc.text(String(admin.administered_by || ''), x, cy - 1.5, { align: 'center' });
              doc.setFontSize(8);
            } else {
              doc.setDrawColor(...BRAND.muted);
              doc.circle(x, cy - 3, 4, 'S');
            }
          } else {
            doc.setTextColor(...BRAND.line);
            doc.text('–', x, cy, { align: 'center' });
          }
        });
      }
      doc.setDrawColor(...BRAND.line);
      cy += 4;
      doc.line(mx, cy, pw - mx, cy);
      cy += 14;
    });

    // Vitals section
    cy += 10;
    if (cy > ph - 100) { doc.addPage(); cy = 40; }
    doc.setTextColor(...BRAND.ink);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('VERLAUF', mx, cy);
    cy += 16;

    const vitalRows = [
      { label: 'HF', key: 'heart_rate' },
      { label: 'AF', key: 'resp_rate' },
      { label: 'Temp', key: 'temperature_c' },
      { label: 'Schmerz', key: 'pain_score' },
    ];

    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND.muted);
    HOURS.forEach((h, i) => {
      const x = mx + colNameW + i * ((pw - mx * 2 - colNameW) / HOURS.length);
      doc.text(String(h).padStart(2, '0'), x + 10, cy, { align: 'center' });
    });
    cy += 4;
    doc.setDrawColor(...BRAND.line);
    doc.line(mx, cy, pw - mx, cy);
    cy += 12;

    doc.setFontSize(8);
    vitalRows.forEach((vr) => {
      doc.setTextColor(...BRAND.ink);
      doc.setFont('helvetica', 'bold');
      doc.text(vr.label, mx, cy);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BRAND.muted);

      HOURS.forEach((h, i) => {
        const x = mx + colNameW + i * ((pw - mx * 2 - colNameW) / HOURS.length) + 10;
        const vital = vitals.find((v: Record<string, unknown>) => v.measured_hour === h);
        const val = vital ? vital[vr.key] : null;
        doc.text(val != null ? String(val) : '–', x, cy, { align: 'center' });
      });

      cy += 14;
    });

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.muted);
      doc.text(`Seite ${p} von ${totalPages}`, pw - mx, ph - 14, { align: 'right' });
      doc.text('Neuland AI – Stationsblatt', mx, ph - 14);
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    const safeName = (patient.patient_name || 'patient').replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_').toLowerCase();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="stationsblatt_${safeName}_${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    });
  } catch (error) {
    console.error('[api/station/pdf] GET Fehler:', error);
    return NextResponse.json({ error: 'Fehler beim PDF-Export.' }, { status: 500 });
  }
}
