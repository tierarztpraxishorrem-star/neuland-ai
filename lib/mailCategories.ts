// Geteilte Kategorien für das Empfangs-Postfach.
// Werden als Microsoft-Graph `message.categories` persistiert und erscheinen 1:1 in Outlook.
// Farben spiegeln die Outlook-Standard-Kategorien wider – so sieht das Team in beiden Tools dasselbe Bild.

export const MAIL_CATEGORIES = [
  'In Arbeit',
  'Wartet auf Antwort',
  'Erledigt',
  'Dringend',
] as const;

export type MailCategory = (typeof MAIL_CATEGORIES)[number];

export const CATEGORY_STYLES: Record<string, { bg: string; fg: string; border: string }> = {
  'In Arbeit':           { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  'Wartet auf Antwort':  { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
  'Erledigt':            { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
  'Dringend':            { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
};

export function categoryStyle(name: string) {
  return CATEGORY_STYLES[name] || { bg: '#e5e7eb', fg: '#374151', border: '#d1d5db' };
}
