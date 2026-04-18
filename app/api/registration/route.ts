import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '../../../lib/server/mail';
import { jsPDF } from 'jspdf';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const maxDuration = 60;

const PRACTICE_ID = '52425334-e8ae-4ab3-9603-f71fded82a0d';
const PRACTICE_EMAIL = 'empfang@tierarztpraxis-horrem.de';
const RATE_LIMIT_MAX = 5;

type OwnerInput = {
  salutation: string;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  birthDate: string;
  phone: string;
  email: string;
  isAdult: boolean;
};

type AnimalInput = {
  sortOrder: number;
  species: string;
  name: string;
  breed: string;
  birthDate: string;
  gender: string;
  isCastrated: boolean;
  coatColor: string;
  chipNumber: string;
  hasInsurance: boolean;
  insuranceCompany: string;
  insuranceNumber: string;
  wantsDirectBilling: boolean;
  wantsInsuranceInfo: boolean;
  signatureData: string | null;
};

type AppointmentInput = {
  date: string;
  time: string;
  referralSource: string;
  referringVetName: string | null;
};

type RequestBody = {
  owner: OwnerInput;
  animals: AnimalInput[];
  appointment: AppointmentInput;
  language: string;
  website?: string; // honeypot
};

function getClientIP(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase-Konfiguration fehlt.');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── PDF helpers ────────────────────────────────────────
function buildSummaryPDF(owner: OwnerInput, animals: AnimalInput[], appointment: AppointmentInput): string {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const mx = 52;
  let y = 56;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 107, 116);
  doc.text('Tierärztezentrum Neuland', mx, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Kopernikusstraße 35, 50126 Bergheim  |  +49 2271 5885269', mx, y);
  y += 24;

  doc.setDrawColor(211, 226, 231);
  doc.line(mx, y, pw - mx, y);
  y += 24;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(31, 41, 55);
  doc.text('Neukundenregistrierung', mx, y);
  y += 12;
  const now = new Date();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Eingegangen am ${now.toLocaleDateString('de-DE')} um ${now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`, mx, y);
  y += 28;

  // Owner section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 107, 116);
  doc.text('Tierbesitzer', mx, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);

  const ownerLines = [
    `${owner.salutation} ${owner.firstName} ${owner.lastName}`,
    `${owner.street} ${owner.houseNumber}, ${owner.zip} ${owner.city}`,
    `Geb.: ${owner.birthDate || '-'}`,
    `Tel.: ${owner.phone}`,
    `E-Mail: ${owner.email}`,
  ];
  for (const line of ownerLines) {
    doc.text(line, mx, y);
    y += 16;
  }
  y += 10;

  // Animals
  for (let i = 0; i < animals.length; i++) {
    const a = animals[i];
    if (y > 700) { doc.addPage(); y = 56; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 107, 116);
    doc.text(`Tier ${i + 1}: ${a.name}`, mx, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(31, 41, 55);

    const animalLines = [
      `Tierart: ${a.species}`,
      `Rasse: ${a.breed || '-'}`,
      `Geburtsdatum: ${a.birthDate || '-'}`,
      `Geschlecht: ${a.gender || '-'}`,
      `Kastriert: ${a.isCastrated ? 'Ja' : 'Nein'}`,
      `Fellfarbe: ${a.coatColor || '-'}`,
      `Chipnummer: ${a.chipNumber || '-'}`,
    ];
    if (a.hasInsurance) {
      animalLines.push(`Versicherung: ${a.insuranceCompany} (Nr. ${a.insuranceNumber || '-'})`);
      animalLines.push(`Direktabrechnung: ${a.wantsDirectBilling ? 'Ja' : 'Nein'}`);
    } else {
      animalLines.push('Versicherung: Nein');
    }
    for (const line of animalLines) {
      doc.text(line, mx, y);
      y += 15;
    }
    y += 10;
  }

  // Appointment
  if (y > 700) { doc.addPage(); y = 56; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 107, 116);
  doc.text('Termin', mx, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);

  if (appointment.date) {
    doc.text(`Datum: ${appointment.date}${appointment.time ? ` um ${appointment.time} Uhr` : ''}`, mx, y);
    y += 15;
  }
  if (appointment.referralSource) {
    doc.text(`Aufmerksam geworden: ${appointment.referralSource}`, mx, y);
    y += 15;
  }
  if (appointment.referringVetName) {
    doc.text(`Haustierarzt: ${appointment.referringVetName}`, mx, y);
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Seite ${p} von ${pageCount}`, pw / 2, doc.internal.pageSize.getHeight() - 24, { align: 'center' });
  }

  // Return base64 without data prefix
  const raw = doc.output('datauristring');
  return raw.split(',')[1];
}

function buildAssignmentPDF(
  owner: OwnerInput,
  animal: AnimalInput,
  signatureDataUrl: string,
): string {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = doc.internal.pageSize.getWidth();
  const mx = 52;
  let y = 56;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 107, 116);
  doc.text('Tierärztezentrum Neuland', mx, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Kopernikusstraße 35, 50126 Bergheim  |  +49 2271 5885269', mx, y);
  y += 24;
  doc.setDrawColor(211, 226, 231);
  doc.line(mx, y, pw - mx, y);
  y += 30;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(31, 41, 55);
  doc.text('Abtretungserklärung', mx, y);
  y += 32;

  // Body
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(31, 41, 55);

  const bodyText = [
    `Hiermit trete ich, ${owner.salutation} ${owner.firstName} ${owner.lastName},`,
    `wohnhaft in ${owner.street} ${owner.houseNumber}, ${owner.zip} ${owner.city},`,
    '',
    `meinen Erstattungsanspruch aus dem Versicherungsvertrag`,
    `bei ${animal.insuranceCompany} (Versicherungsnr.: ${animal.insuranceNumber || '-'})`,
    `für mein Tier "${animal.name}" (${animal.species})`,
    '',
    `an das Tierärztezentrum Neuland, Kopernikusstraße 35, 50126 Bergheim ab.`,
    '',
    `Die Abtretung gilt für alle tierärztlichen Leistungen, die im Rahmen`,
    `der Behandlung des oben genannten Tieres erbracht werden.`,
  ];

  for (const line of bodyText) {
    doc.text(line, mx, y);
    y += 18;
  }

  y += 30;

  // Date
  const now = new Date();
  doc.text(`Bergheim, den ${now.toLocaleDateString('de-DE')}`, mx, y);
  y += 40;

  // Signature
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text('Unterschrift Tierbesitzer:', mx, y);
  y += 10;

  if (signatureDataUrl) {
    try {
      doc.addImage(signatureDataUrl, 'PNG', mx, y, 200, 80, undefined, 'FAST');
    } catch {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text('[Digitale Unterschrift konnte nicht geladen werden]', mx, y + 20);
    }
    y += 90;
  }

  doc.setDrawColor(31, 41, 55);
  doc.line(mx, y, mx + 220, y);
  y += 14;
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`${owner.firstName} ${owner.lastName}`, mx, y);

  const raw = doc.output('datauristring');
  return raw.split(',')[1];
}

// Map species to patients table tierart value
function mapSpeciesToTierart(species: string): string | null {
  if (species === 'Hund') return 'Hund';
  if (species === 'Katze') return 'Katze';
  // Everything else maps to Heimtier
  return 'Heimtier';
}

// Map gender to patients table format
function mapGender(gender: string, isCastrated: boolean): string | null {
  if (!gender) return null;
  if (gender === 'männlich') return isCastrated ? 'mk' : 'm';
  if (gender === 'weiblich') return isCastrated ? 'wk' : 'w';
  return null;
}

// ── Main handler ───────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;

    // Honeypot check – silently succeed
    if (body.website) {
      return NextResponse.json({ ok: true, registration_id: 'none' });
    }

    // Basic validation
    const { owner, animals, appointment, language } = body;
    if (!owner?.firstName || !owner?.lastName || !owner?.email) {
      return NextResponse.json({ error: 'Pflichtfelder fehlen.' }, { status: 400 });
    }
    if (!animals || animals.length === 0) {
      return NextResponse.json({ error: 'Mindestens ein Tier ist erforderlich.' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const ip = getClientIP(req);

    // Rate limit
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('patient_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('submitted_at', oneHourAgo);

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return NextResponse.json(
        { error: 'Zu viele Registrierungen. Bitte versuchen Sie es später erneut.' },
        { status: 429 },
      );
    }

    // Insert registration
    const { data: regData, error: regError } = await supabase
      .from('patient_registrations')
      .insert({
        practice_id: PRACTICE_ID,
        salutation: owner.salutation || null,
        first_name: owner.firstName,
        last_name: owner.lastName,
        birth_date: owner.birthDate || null,
        street: owner.street || null,
        house_number: owner.houseNumber || null,
        zip: owner.zip || null,
        city: owner.city || null,
        phone: owner.phone || null,
        email: owner.email,
        is_adult: owner.isAdult,
        appointment_date: appointment.date || null,
        appointment_time: appointment.time || null,
        referral_source: appointment.referralSource || null,
        referring_vet: appointment.referringVetName || null,
        status: 'pending',
        language: language || 'de',
        ip_address: ip,
      })
      .select('id')
      .single();

    if (regError || !regData) {
      console.error('Registration insert error:', regError);
      return NextResponse.json({ error: 'Registrierung konnte nicht gespeichert werden.' }, { status: 500 });
    }

    const registrationId = regData.id;

    // Insert animals + create patient records
    const assignmentPDFs: Array<{ name: string; contentBytes: string }> = [];

    for (const animal of animals) {
      // Create patient record
      const { data: patientData } = await supabase
        .from('patients')
        .insert({
          practice_id: PRACTICE_ID,
          name: animal.name,
          tierart: mapSpeciesToTierart(animal.species),
          rasse: animal.breed || null,
          alter: animal.birthDate || null,
          geschlecht: mapGender(animal.gender, animal.isCastrated),
          owner_name: `${owner.firstName} ${owner.lastName}`,
          external_id: animal.chipNumber || null,
        })
        .select('id')
        .single();

      const patientId = patientData?.id || null;

      const assignmentSigned = animal.wantsDirectBilling && !!animal.signatureData;

      // Build assignment PDF if needed
      let assignmentPdfGenerated = false;
      if (assignmentSigned && animal.signatureData) {
        try {
          const pdfBase64 = buildAssignmentPDF(owner, animal, animal.signatureData);
          assignmentPDFs.push({
            name: `Abtretung_${animal.name.replace(/\s+/g, '_')}.pdf`,
            contentBytes: pdfBase64,
          });
          assignmentPdfGenerated = true;
        } catch (e) {
          console.error('Assignment PDF error:', e);
        }
      }

      // Insert registration animal
      const { error: animalError } = await supabase
        .from('registration_animals')
        .insert({
          registration_id: registrationId,
          practice_id: PRACTICE_ID,
          sort_order: animal.sortOrder,
          species: animal.species,
          name: animal.name,
          breed: animal.breed || null,
          birth_date: animal.birthDate || null,
          gender: animal.gender || null,
          is_castrated: animal.isCastrated,
          coat_color: animal.coatColor || null,
          chip_number: animal.chipNumber || null,
          has_insurance: animal.hasInsurance,
          insurance_company: animal.insuranceCompany || null,
          insurance_number: animal.insuranceNumber || null,
          wants_direct_billing: animal.wantsDirectBilling,
          wants_insurance_info: animal.wantsInsuranceInfo,
          assignment_signed: assignmentSigned,
          assignment_signature_data: animal.signatureData || null,
          assignment_signed_at: assignmentSigned ? new Date().toISOString() : null,
          assignment_pdf_path: assignmentPdfGenerated ? `generated` : null,
          patient_id: patientId,
        });

      if (animalError) {
        console.error('Animal insert error:', animalError);
      }
    }

    // Build summary PDF
    let summaryBase64 = '';
    try {
      summaryBase64 = buildSummaryPDF(owner, animals, appointment);
    } catch (e) {
      console.error('Summary PDF error:', e);
    }

    // Send email to practice
    try {
      const animalNames = animals.map((a) => a.name).join(', ');
      const appointmentInfo = appointment.date
        ? `Termin: ${appointment.date}${appointment.time ? ` um ${appointment.time} Uhr` : ''}`
        : 'Kein Termin angegeben';

      const attachments = [];
      if (summaryBase64) {
        attachments.push({
          name: `Registrierung_${owner.lastName}_${owner.firstName}.pdf`,
          contentType: 'application/pdf',
          contentBytes: summaryBase64,
        });
      }
      for (const pdf of assignmentPDFs) {
        attachments.push({
          name: pdf.name,
          contentType: 'application/pdf',
          contentBytes: pdf.contentBytes,
        });
      }

      await sendMail({
        to: [PRACTICE_EMAIL],
        subject: `Neue Registrierung: ${owner.firstName} ${owner.lastName} (${animalNames})`,
        isHtml: true,
        body: `
          <div style="font-family:Arial,sans-serif;max-width:600px;">
            <h2 style="color:#0f6b74;">Neue Patientenregistrierung</h2>
            <p><strong>${owner.salutation} ${owner.firstName} ${owner.lastName}</strong></p>
            <p>${owner.street} ${owner.houseNumber}, ${owner.zip} ${owner.city}</p>
            <p>Tel.: ${owner.phone}<br/>E-Mail: ${owner.email}</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
            <p><strong>Tiere:</strong> ${animalNames}</p>
            <p><strong>${appointmentInfo}</strong></p>
            ${appointment.referralSource ? `<p>Aufmerksam geworden durch: ${appointment.referralSource}</p>` : ''}
            ${appointment.referringVetName ? `<p>Haustierarzt: ${appointment.referringVetName}</p>` : ''}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
            <p style="font-size:12px;color:#94a3b8;">Die vollständigen Daten finden Sie im angehängten PDF.</p>
          </div>
        `,
        attachments,
      });
    } catch (mailError) {
      console.error('Practice email error:', mailError);
      // Don't fail the registration for email issues
    }

    // Send confirmation email to registrant
    try {
      const appointmentLine = appointment.date
        ? `Ihr Termin: ${new Date(appointment.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}${appointment.time ? ` um ${appointment.time} Uhr` : ''}`
        : '';

      await sendMail({
        to: [owner.email],
        subject: 'Bestätigung Ihrer Anmeldung – Tierärztezentrum Neuland',
        isHtml: true,
        body: `
          <div style="font-family:Arial,sans-serif;max-width:600px;">
            <h2 style="color:#0f6b74;">Vielen Dank für Ihre Anmeldung!</h2>
            <p>Liebe/r ${owner.firstName} ${owner.lastName},</p>
            <p>wir haben Ihre Registrierung erfolgreich erhalten und freuen uns, Sie und
            ${animals.length === 1 ? `Ihr Tier ${animals[0].name}` : 'Ihre Tiere'} bald bei uns begrüßen zu dürfen.</p>
            ${appointmentLine ? `<p style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:12px 16px;"><strong>${appointmentLine}</strong></p>` : ''}
            <p>Bitte bringen Sie zu Ihrem ersten Besuch Folgendes mit:</p>
            <ul>
              <li>Impfpass Ihres Tieres</li>
              <li>Ggf. vorhandene Befunde anderer Tierärzte</li>
              <li>Ihren Personalausweis</li>
              ${animals.some((a) => a.hasInsurance) ? '<li>Ihre Versicherungsunterlagen</li>' : ''}
            </ul>
            <p>Bei Fragen erreichen Sie uns unter <strong>+49 2271 5885269</strong> oder per E-Mail.</p>
            <p>Mit freundlichen Grüßen,<br/><strong>Ihr Team vom Tierärztezentrum Neuland</strong></p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
            <p style="font-size:11px;color:#94a3b8;">
              Tierärztezentrum Neuland | Kopernikusstraße 35 | 50126 Bergheim<br/>
              Tel.: +49 2271 5885269 | empfang@tierarztpraxis-horrem.de
            </p>
          </div>
        `,
      });
    } catch (confirmError) {
      console.error('Confirmation email error:', confirmError);
    }

    // Send insurance info flyer if any animal requested it
    const wantsInsuranceFlyer = animals.some((a) => a.wantsInsuranceInfo);
    if (wantsInsuranceFlyer && owner.email) {
      try {
        const flyerPath = join(process.cwd(), 'public', 'Information_Tierkrankenversicherung.pdf');
        const flyerBuffer = await readFile(flyerPath);
        const flyerBase64 = flyerBuffer.toString('base64');

        const petNames = animals.filter((a) => a.wantsInsuranceInfo).map((a) => a.name).join(', ');

        await sendMail({
          to: [owner.email],
          subject: `Neukundenformular + Informationen Tierversicherung - ${petNames}`,
          isHtml: true,
          body: `
            <div style="font-family:Arial,sans-serif;max-width:600px;">
              <h2 style="color:#0f6b74;">Informationen zu Tierkrankenversicherungen</h2>
              <p>Sehr geehrte/r ${owner.salutation || 'Frau/Herr'} ${owner.lastName},</p>
              <p>Sie haben gerade ein <strong>Neukundenformular im Tierärztezentrum Neuland</strong> ausgefüllt und dabei angegeben, dass Sie <strong>weiterführende Informationen zu Versicherungen</strong> wünschen.</p>
              <p>Anbei erhalten Sie unseren Info-Flyer - bei Fragen sprechen Sie uns gerne an!</p>
              <p>Vielen Dank!</p>
              <p>Mit freundlichen Grüßen,<br/><strong>Ihr Team vom Tierärztezentrum Neuland</strong></p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"/>
              <p style="font-size:11px;color:#94a3b8;">
                Tierärztezentrum Neuland | Kopernikusstraße 35 | 50126 Bergheim<br/>
                Tel.: +49 2271 5885269 | empfang@tierarztpraxis-horrem.de
              </p>
            </div>
          `,
          attachments: [{
            name: 'Information_Tierkrankenversicherung.pdf',
            contentType: 'application/pdf',
            contentBytes: flyerBase64,
          }],
        });
      } catch (flyerError) {
        console.error('Insurance flyer email error:', flyerError);
      }
    }

    return NextResponse.json({ ok: true, registration_id: registrationId });
  } catch (err) {
    console.error('Registration error:', err);
    return NextResponse.json(
      { error: 'Beim Absenden ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.' },
      { status: 500 },
    );
  }
}
