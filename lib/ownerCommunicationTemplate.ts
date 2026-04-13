export type OwnerLetterPractice = {
  name: string;
  logo: string;
  address: string;
  phone: string;
  website: string;
  contact: string;
};

export type OwnerLetterPayload = {
  title: string;
  dateLabel: string;
  intro?: string;
  body: string;
  medication?: string;
  followUp?: string;
  vet: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const nl2br = (value: string) => escapeHtml(value).replace(/\n/g, "<br>");

export const buildOwnerLetterHtml = (practice: OwnerLetterPractice, payload: OwnerLetterPayload) => {
  const safeMedication = payload.medication?.trim() || "—";
  const safeFollowUp = payload.followUp?.trim() || "—";
  const intro = payload.intro?.trim() || "Vielen Dank fuer Ihr Vertrauen. Nachfolgend erhalten Sie die wichtigsten Informationen in klarer und strukturierter Form.";
  const addressLines = practice.address
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return `
<html>
<head>
<title>Patientenbrief</title>
<meta charset="utf-8" />
<style>
:root {
  --brand: #1c7781;
  --brand-dark: #145e66;
  --brand-soft: #eef5f6;
  --ink: #1f2937;
  --muted: #5f6b73;
  --line: #d7e4e7;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", Arial, sans-serif;
  background: #ffffff;
  color: var(--ink);
}
.page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: #fff;
  padding: 18mm 18mm 16mm;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 14px;
}
.logo-wrap {
  width: 92px;
  min-height: 70px;
  display: grid;
  align-items: start;
}
.logo {
  width: 92px;
  max-height: 84px;
  object-fit: contain;
}
.practice {
  text-align: right;
  font-size: 12px;
  line-height: 1.45;
  max-width: 340px;
}
.practice-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 3px;
}
.divider {
  border-top: 2px solid var(--brand);
  margin: 8px 0 16px;
}
.title {
  margin: 0 0 8px;
  font-size: 43px;
  color: var(--brand-dark);
  font-weight: 700;
  line-height: 1.18;
}
.meta {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 12px;
}
.intro {
  margin: 0 0 12px;
  font-size: 14px;
  color: var(--ink);
  line-height: 1.55;
}
.content {
  white-space: pre-wrap;
  line-height: 1.56;
  font-size: 14px;
}
.medbox {
  margin-top: 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #f8fbfc;
  padding: 12px;
}
.medbox h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--ink);
}
.medbox .value {
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.45;
}
.med-sep {
  border-top: 1px solid var(--line);
  margin: 10px 0;
}
.footer {
  margin-top: 24px;
  border-top: 1px solid var(--line);
  padding-top: 14px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  page-break-inside: avoid;
}
.signature {
  font-size: 14px;
}
.signature-field {
  margin-top: 12px;
  width: 280px;
  border-top: 1px solid #9ca3af;
  padding-top: 6px;
  font-size: 12px;
  color: var(--muted);
}
.signature .sign {
  font-family: "Segoe Script", "Lucida Handwriting", "Brush Script MT", cursive;
  font-size: 23px;
  margin: 8px 0 4px;
  color: #1f2f38;
}
.qr-box {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}
.qr {
  width: 108px;
  height: 108px;
}
@media print {
  body { background: #fff; }
  .page { margin: 0; width: auto; min-height: auto; }
}
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="logo-wrap">
        <img src="${practice.logo}" class="logo" alt="Logo" />
      </div>

      <div class="practice">
        <div class="practice-name">${escapeHtml(practice.name)}</div>
        ${addressLines.length > 0 ? `<div>${nl2br(addressLines.join("\n"))}</div>` : ""}
        <div style="margin-top:2px;">Telefon: ${escapeHtml(practice.phone)}</div>
        <div><a href="https://${escapeHtml(practice.website)}" target="_blank">${escapeHtml(practice.website)}</a></div>
      </div>
    </div>

    <div class="divider"></div>

    <h1 class="title">${escapeHtml(payload.title)}</h1>
    <div class="meta">Datum: ${escapeHtml(payload.dateLabel)}</div>

    <p class="intro">${escapeHtml(intro)}</p>

    <div class="content">${nl2br(payload.body)}</div>

    <section class="medbox">
        <h3>Medikation</h3>
        <div class="value">${nl2br(safeMedication)}</div>
        <div class="med-sep"></div>
        <h3>Empfohlene Kontrolle</h3>
        <div class="value">${nl2br(safeFollowUp)}</div>
    </section>

    <footer class="footer">
      <div class="signature">
        <div>Mit freundlichen Gruessen</div>
        <div class="sign">${escapeHtml(payload.vet)}</div>
        <div class="signature-field">Unterschrift Tierarzt / Tieraerztin</div>
        <div>${escapeHtml(practice.name)}</div>
      </div>

      <div class="qr-box">
        <div style="margin-bottom:8px;">Termin online</div>
        <img
          class="qr"
          src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(practice.contact)}"
          alt="QR Code"
        />
      </div>
    </footer>
  </div>
</body>
</html>
`;
};
