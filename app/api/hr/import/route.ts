import { NextResponse } from 'next/server';
import { getUserPractice } from '../../../../lib/server/getUserPractice';
import { getHrFeatureEnabled } from '../../../../lib/server/hrUtils';
import { isAdminRole } from '../../../../lib/hr/permissions';
import { randomBytes } from 'crypto';

type CsvRow = Record<string, string>;

const FIELD_MAP: Record<string, string> = {
  'Personalnummer': 'personnel_number',
  'Vorname': 'first_name',
  'Nachname': 'last_name',
  'Geburtsdatum': 'date_of_birth',
  'Geschlecht': 'gender',
  'Straße': 'address_street',
  'Hausnummer': 'address_number',
  'PLZ': 'address_zip',
  'Ort': 'address_city',
  'Telefon': 'phone',
  'E-Mail': 'invite_email',
  'E-Mail privat': 'email_private',
  'Vertragsart': 'contract_type',
  'Vertragsbeginn': 'contract_start',
  'Vertragsende': 'contract_end',
  'Wochenstunden': 'weekly_hours_target',
  'Arbeitstage/Woche': 'work_days_per_week',
  'Urlaubstage/Jahr': 'vacation_days_per_year',
  'Abteilung': 'department',
  'Position': 'position_title',
  'IBAN': 'iban',
  'BIC': 'bic',
  'Steuer-ID': 'tax_id',
  'Steuerklasse': 'tax_class',
  'SV-Nummer': 'social_security_number',
  'Krankenkasse': 'health_insurance',
};

function parseCsv(text: string): CsvRow[] {
  // Remove BOM
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = lines[0].includes(';') ? ';' : ',';

  // Parse header, handle quoted fields
  const parseRow = (line: string) => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === sep && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseRow(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    const row: CsvRow = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

export async function POST(req: Request) {
  try {
    const auth = await getUserPractice(req, { allowedRoles: ['owner', 'admin'] });
    if (!auth.ok) return auth.response;

    const { supabase, practiceId, role } = auth.context;

    if (!isAdminRole(role)) return NextResponse.json({ error: 'Keine Berechtigung.' }, { status: 403 });

    const featureCheck = await getHrFeatureEnabled(supabase, practiceId);
    if (!featureCheck.ok) return NextResponse.json({ error: featureCheck.error }, { status: 404 });
    if (!featureCheck.enabled) return NextResponse.json({ error: 'HR-Modul ist für diese Praxis deaktiviert.' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const csvText = body.csv as string;
    const dryRun = body.dry_run === true;
    const generateInvites = body.generate_invites === true;

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'CSV-Daten sind erforderlich.' }, { status: 400 });
    }

    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Keine Datenzeilen in der CSV gefunden.' }, { status: 400 });
    }

    // Show detected headers for debugging
    const detectedHeaders = Object.keys(rows[0]);
    const mappedHeaders = detectedHeaders.filter((h) => FIELD_MAP[h]);
    const unmappedHeaders = detectedHeaders.filter((h) => !FIELD_MAP[h]);

    const results: { row: number; status: string; name: string; email?: string; invite_token?: string; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: Record<string, unknown> = { practice_id: practiceId, role: 'member', employment_status: 'onboarding' };

      for (const [csvHeader, dbField] of Object.entries(FIELD_MAP)) {
        if (row[csvHeader] && row[csvHeader].trim()) {
          const val = row[csvHeader].trim();
          if (['weekly_hours_target', 'work_days_per_week', 'vacation_days_per_year', 'tax_class'].includes(dbField)) {
            mapped[dbField] = Number(val) || null;
          } else if (dbField === 'invite_email' || dbField === 'email_private') {
            mapped[dbField] = val.toLowerCase();
          } else {
            mapped[dbField] = val;
          }
        }
      }

      // Also check "E-Mail" -> set both invite_email and email_private
      if (mapped.invite_email && !mapped.email_private) {
        mapped.email_private = mapped.invite_email;
      }

      const name = [mapped.first_name, mapped.last_name].filter(Boolean).join(' ') || `Zeile ${i + 2}`;

      if (!mapped.first_name || !mapped.last_name) {
        results.push({ row: i + 2, status: 'error', name, error: 'Vor- und Nachname erforderlich' });
        continue;
      }

      mapped.display_name = `${mapped.first_name} ${mapped.last_name}`;

      // Generate invite token if requested
      if (generateInvites) {
        mapped.invite_token = `HR-${randomBytes(12).toString('hex')}`;
        mapped.invited_at = new Date().toISOString();
      }

      if (dryRun) {
        results.push({
          row: i + 2,
          status: 'dry_run',
          name,
          email: (mapped.invite_email as string) || undefined,
          invite_token: generateInvites ? (mapped.invite_token as string) : undefined,
        });
        continue;
      }

      const { error } = await supabase.from('employees').insert(mapped);
      if (error) {
        results.push({ row: i + 2, status: 'error', name, error: error.message });
      } else {
        results.push({
          row: i + 2,
          status: 'created',
          name,
          email: (mapped.invite_email as string) || undefined,
          invite_token: generateInvites ? (mapped.invite_token as string) : undefined,
        });
      }
    }

    const created = results.filter((r) => r.status === 'created' || r.status === 'dry_run').length;
    const errors = results.filter((r) => r.status === 'error').length;

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total: rows.length,
      created,
      errors,
      mapped_headers: mappedHeaders,
      unmapped_headers: unmappedHeaders,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
    console.error('[api/hr/import] POST Fehler:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
