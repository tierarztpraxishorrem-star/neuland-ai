// Geteilte HTML-Vorlage für Patienteninformations-Mails.
// Wird von Konsultation + VetMind genutzt und an /api/mail/send mit isHtml:true gesendet.

export type PracticeBrand = {
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;
};

export type PatientMailOptions = {
  text: string;
  practice: PracticeBrand;
  patientName?: string;
  ownerName?: string;
  introLine?: string;
  closingLine?: string;
};

const DEFAULT_COLOR = '#0F6B74';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Plain-Text → HTML: Leerzeilen trennen Absätze, einzelne Umbrüche werden zu <br/>
function textToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n\s*\n/)
    .map((para) => {
      const safe = escapeHtml(para).replace(/\n/g, '<br/>');
      return `<p style="margin:0 0 14px 0;">${safe}</p>`;
    })
    .join('');
}

function addressHtml(address?: string): string {
  if (!address) return '';
  return escapeHtml(address).replace(/\n/g, '<br/>');
}

export function buildPatientMailSubject(patientName?: string): string {
  if (patientName && patientName.trim()) {
    return `Informationen zur Behandlung von ${patientName.trim()}`;
  }
  return 'Informationen zur Behandlung Ihres Tieres';
}

// Wählt die passende Anrede anhand eines Titel-Präfix im Empfänger-Namen.
// "Frau Müller" → "Liebe Frau Müller,"
// "Herr Schmidt" / "Herrn Schmidt" → "Lieber Herr Schmidt,"
// Ohne eindeutiges Präfix → "Guten Tag {Name},"
// Kein Name → "Guten Tag,"
export function buildGreeting(rawName?: string): string {
  const name = rawName?.trim();
  if (!name) return 'Guten Tag,';
  const lower = name.toLowerCase();
  if (lower.startsWith('frau ')) {
    return `Liebe ${escapeHtml(name)},`;
  }
  if (lower.startsWith('herrn ')) {
    const fixed = 'Herr ' + name.slice('Herrn '.length);
    return `Lieber ${escapeHtml(fixed)},`;
  }
  if (lower.startsWith('herr ')) {
    return `Lieber ${escapeHtml(name)},`;
  }
  return `Guten Tag ${escapeHtml(name)},`;
}

export function buildPatientMailHtml(opts: PatientMailOptions): string {
  const color = opts.practice.primaryColor || DEFAULT_COLOR;
  const greeting = buildGreeting(opts.ownerName);
  const intro = opts.introLine
    ? escapeHtml(opts.introLine)
    : opts.patientName?.trim()
    ? `anbei erhalten Sie die Informationen zur Behandlung von <strong>${escapeHtml(opts.patientName.trim())}</strong>.`
    : 'anbei erhalten Sie die Informationen zur weiteren Behandlung Ihres Tieres.';
  const closing = opts.closingLine
    ? escapeHtml(opts.closingLine)
    : 'Bei Rückfragen sind wir gerne für Sie da.';

  const logoHtml = opts.practice.logoUrl
    ? `<img src="${escapeHtml(opts.practice.logoUrl)}" alt="${escapeHtml(opts.practice.name)}" style="max-height:48px;max-width:180px;display:block;margin-bottom:8px;"/>`
    : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<title>${escapeHtml(buildPatientMailSubject(opts.patientName))}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <tr>
            <td style="background:${color};padding:20px 24px;color:#ffffff;">
              ${logoHtml}
              <div style="font-size:18px;font-weight:700;">${escapeHtml(opts.practice.name)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 14px 0;">${greeting}</p>
              <p style="margin:0 0 18px 0;">${intro}</p>
              <div style="border-left:3px solid ${color};padding:4px 0 4px 14px;margin:0 0 18px 0;background:#f8fafc;border-radius:0 8px 8px 0;">
                <div style="padding:10px 12px;">
                  ${textToHtml(opts.text)}
                </div>
              </div>
              <p style="margin:0 0 4px 0;">${closing}</p>
              <p style="margin:18px 0 4px 0;">Mit freundlichen Grüßen</p>
              <p style="margin:0;font-weight:600;color:${color};">Ihr Team der ${escapeHtml(opts.practice.name)}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:18px 24px;font-size:12px;color:#64748b;line-height:1.5;border-top:1px solid #e5e7eb;">
              <div style="font-weight:600;color:#1f2937;margin-bottom:4px;">${escapeHtml(opts.practice.name)}</div>
              ${opts.practice.address ? `<div>${addressHtml(opts.practice.address)}</div>` : ''}
              ${opts.practice.phone ? `<div>Tel: ${escapeHtml(opts.practice.phone)}</div>` : ''}
              ${opts.practice.website ? `<div><a href="https://${escapeHtml(opts.practice.website.replace(/^https?:\/\//, ''))}" style="color:${color};text-decoration:none;">${escapeHtml(opts.practice.website)}</a></div>` : ''}
            </td>
          </tr>
        </table>
        <div style="max-width:600px;padding:12px;font-size:11px;color:#94a3b8;text-align:center;">
          Diese E-Mail wurde automatisch aus Ihrer Patientenakte erstellt.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
