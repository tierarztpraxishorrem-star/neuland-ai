import { jsPDF } from "jspdf";

export type PracticeProfile = {
  practiceName?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoDataUrl?: string;
};

export type ReportMetadata = {
  title?: string;
  date?: Date;
  patientName?: string;
  ownerName?: string;
};

type PdfBuildResult = {
  doc: jsPDF;
  filename: string;
};

const toSafeFilename = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/\-+/g, "-")
    .replace(/^\-|\-$/g, "") || "bericht";

function buildPDFDocument(text: string, metadata: ReportMetadata, profile?: PracticeProfile): PdfBuildResult {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const marginX = 52;
  const topMargin = 56;
  const bottomMargin = 56;
  let cursorY = topMargin;

  const title = metadata.title || "Bericht";
  const now = metadata.date || new Date();
  const dateLabel = now.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const headerRightX = pageWidth - marginX;
  const lineY = cursorY + 54;

  if (profile?.logoDataUrl) {
    try {
      doc.addImage(profile.logoDataUrl, "PNG", marginX, cursorY - 4, 56, 56, undefined, "FAST");
    } catch {
      // Ignore invalid image data and continue with a neutral header.
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(profile?.practiceName || "Tierarztpraxis", headerRightX, cursorY + 10, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const contactLine = [profile?.phone, profile?.email].filter(Boolean).join(" | ");
  const headerLines = [profile?.address, contactLine].filter(
    (line): line is string => Boolean(line)
  );
  headerLines.forEach((line, index) => {
    doc.text(line, headerRightX, cursorY + 28 + index * 14, { align: "right" });
  });

  doc.setDrawColor(210);
  doc.line(marginX, lineY, pageWidth - marginX, lineY);

  cursorY = lineY + 34;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, marginX, cursorY);

  cursorY += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const metaLines = [
    `Datum: ${dateLabel}`,
    metadata.patientName ? `Patient: ${metadata.patientName}` : "",
    metadata.ownerName ? `Besitzer: ${metadata.ownerName}` : ""
  ].filter(Boolean);

  metaLines.forEach((line) => {
    doc.text(line, marginX, cursorY);
    cursorY += 15;
  });

  cursorY += 12;

  const bodyWidth = pageWidth - marginX * 2;
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11.5);

  const ensureSpace = (needed: number) => {
    if (cursorY + needed <= pageHeight - bottomMargin) return;
    doc.addPage();
    cursorY = topMargin;
  };

  paragraphs.forEach((paragraph) => {
    const lines = doc.splitTextToSize(paragraph, bodyWidth);
    const paragraphHeight = lines.length * 15;
    ensureSpace(paragraphHeight + 12);
    doc.text(lines, marginX, cursorY);
    cursorY += paragraphHeight + 12;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const footerLeft = profile?.practiceName || "Tierarztpraxis";
    doc.text(footerLeft, marginX, pageHeight - 26);
    doc.text(`Seite ${page} von ${pageCount}`, pageWidth - marginX, pageHeight - 26, { align: "right" });
  }

  const filename = `${toSafeFilename(title)}-${dateLabel.replace(/\./g, "-")}.pdf`;
  return { doc, filename };
}

export function generatePDF(text: string, metadata: ReportMetadata, profile?: PracticeProfile) {
  const { doc, filename } = buildPDFDocument(text, metadata, profile);
  doc.save(filename);
}

export function createPDFBlob(text: string, metadata: ReportMetadata, profile?: PracticeProfile) {
  const { doc, filename } = buildPDFDocument(text, metadata, profile);
  const blob = doc.output("blob");
  return { blob, filename };
}
