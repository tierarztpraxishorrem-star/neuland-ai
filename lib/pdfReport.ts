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
  signatureName?: string;
};

type PdfBuildResult = {
  doc: jsPDF;
  filename: string;
};

const BRAND = {
  primary: [28, 119, 129] as const,
  primaryDark: [20, 94, 102] as const,
  ink: [31, 41, 55] as const,
  muted: [95, 107, 115] as const,
  line: [211, 226, 231] as const,
  soft: [241, 247, 248] as const,
  softDark: [226, 238, 241] as const,
};

const DEFAULT_PROFILE: Required<Pick<PracticeProfile, "practiceName" | "address" | "phone" | "email">> = {
  practiceName: "Tierärztezentrum Neuland",
  address: "Kopernikusstraße 35, 50126 Bergheim",
  phone: "+49 2271 5885269",
  email: "empfang@tzn-bergheim.de",
};

const detectImageFormat = (dataUrl: string): "PNG" | "JPEG" => {
  const normalized = dataUrl.toLowerCase();
  return normalized.startsWith("data:image/jpeg") || normalized.startsWith("data:image/jpg")
    ? "JPEG"
    : "PNG";
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
  const bottomMargin = 150;
  const cardX = 28;
  const cardY = 26;
  const cardW = pageWidth - 56;
  const cardH = pageHeight - 52;
  let cursorY = topMargin;

  const title = metadata.title || "Bericht";
  const effectiveProfile: PracticeProfile = {
    practiceName: profile?.practiceName?.trim() || DEFAULT_PROFILE.practiceName,
    address: profile?.address?.trim() || DEFAULT_PROFILE.address,
    phone: profile?.phone?.trim() || DEFAULT_PROFILE.phone,
    email: profile?.email?.trim() || DEFAULT_PROFILE.email,
    logoDataUrl: profile?.logoDataUrl,
  };
  const now = metadata.date || new Date();
  const dateLabel = now.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const drawScaffold = (firstPage: boolean) => {
    doc.setFillColor(...BRAND.soft);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BRAND.line);
    doc.roundedRect(cardX, cardY, cardW, cardH, 14, 14, "FD");

    const headerTop = 48;
    const logoX = marginX;
    const logoY = headerTop;
    const logoSize = 68;
    const headerRightX = pageWidth - marginX;

    doc.setFillColor(...BRAND.softDark);
    doc.setDrawColor(...BRAND.line);
    doc.roundedRect(logoX, logoY, logoSize, logoSize, 8, 8, "FD");

    if (effectiveProfile.logoDataUrl) {
      try {
        const format = detectImageFormat(effectiveProfile.logoDataUrl);
        doc.addImage(effectiveProfile.logoDataUrl, format, logoX + 4, logoY + 4, 60, 60, undefined, "SLOW");
      } catch {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(...BRAND.primaryDark);
        doc.text("T", logoX + logoSize / 2, logoY + 41, { align: "center" });
      }
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...BRAND.primaryDark);
      doc.text("T", logoX + logoSize / 2, logoY + 41, { align: "center" });
    }

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BRAND.primaryDark);
    doc.setFontSize(15);
    doc.text(effectiveProfile.practiceName || "Tierarztpraxis", headerRightX, headerTop + 11, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BRAND.muted);

    const contactLine = [effectiveProfile.phone, effectiveProfile.email].filter(Boolean).join(" | ");
    const headerLines = [effectiveProfile.address, contactLine].filter((line): line is string => Boolean(line));
    headerLines.forEach((line, index) => {
      doc.text(line, headerRightX, headerTop + 27 + index * 13, { align: "right" });
    });

    const ruleY = headerTop + 68;
    doc.setDrawColor(...BRAND.line);
    doc.line(marginX, ruleY, pageWidth - marginX, ruleY);

    if (!firstPage) {
      doc.setFillColor(...BRAND.softDark);
      doc.roundedRect(marginX, ruleY + 12, pageWidth - marginX * 2, 36, 8, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BRAND.primaryDark);
      doc.text(`${title} - Fortsetzung`, marginX + 12, ruleY + 35);
      return ruleY + 62;
    }

    const heroY = ruleY + 18;
    const heroH = 96;
    doc.setFillColor(...BRAND.primaryDark);
    doc.roundedRect(marginX, heroY, pageWidth - marginX * 2, heroH, 12, 12, "F");
    doc.setFillColor(...BRAND.primary);
    doc.roundedRect(marginX + 4, heroY + 4, pageWidth - marginX * 2 - 8, heroH - 8, 10, 10, "F");

    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(21);
    doc.text(title, marginX + 18, heroY + 36);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`Erstellt am ${dateLabel}`, marginX + 18, heroY + 57);
    doc.text("Information für Tierbesitzer", marginX + 18, heroY + 75);

    let metaY = heroY + heroH + 14;
    const metaItems = [
      `Datum: ${dateLabel}`,
      metadata.patientName ? `Patient: ${metadata.patientName}` : "",
      metadata.ownerName ? `Besitzer: ${metadata.ownerName}` : "",
    ].filter(Boolean);

    metaItems.forEach((item, index) => {
      const boxX = index === 0 ? marginX : marginX + (pageWidth - marginX * 2) / 3 * index;
      const boxW = (pageWidth - marginX * 2) / Math.max(1, Math.min(3, metaItems.length)) - 6;
      doc.setFillColor(...BRAND.softDark);
      doc.roundedRect(boxX, metaY, boxW, 24, 8, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND.primaryDark);
      doc.text(item, boxX + 9, metaY + 16);
    });

    return metaY + 40;
  };

  cursorY = drawScaffold(true);

  const bodyWidth = pageWidth - marginX * 2;
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11.8);
  doc.setTextColor(...BRAND.ink);

  const ensureSpace = (needed: number) => {
    if (cursorY + needed <= pageHeight - bottomMargin) return;
    doc.addPage();
    cursorY = drawScaffold(false);
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
    doc.setDrawColor(...BRAND.line);
    doc.line(marginX, pageHeight - 34, pageWidth - marginX, pageHeight - 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    const footerLeft = effectiveProfile.practiceName || "Tierarztpraxis";
    const footerRight = [effectiveProfile.phone, effectiveProfile.email].filter(Boolean).join(" | ");

    if (page === pageCount && metadata.signatureName?.trim()) {
      const signBaseY = pageHeight - 108;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...BRAND.ink);
      doc.text("Mit freundlichen Grüßen", marginX, signBaseY);

      doc.setFont("times", "italic");
      doc.setFontSize(19);
      doc.setTextColor(...BRAND.primaryDark);
      doc.text(metadata.signatureName.trim(), marginX, signBaseY + 24);

      doc.setDrawColor(156, 163, 175);
      doc.line(marginX, signBaseY + 30, marginX + 220, signBaseY + 30);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...BRAND.muted);
      doc.text("Unterschrift Tierarzt / Tierärztin", marginX, signBaseY + 44);
      doc.text(effectiveProfile.practiceName || "", marginX, signBaseY + 58);
    }
    doc.text(footerLeft, marginX, pageHeight - 18);
    if (footerRight) {
      doc.text(footerRight, pageWidth / 2, pageHeight - 18, { align: "center" });
    }
    doc.text(`Seite ${page} von ${pageCount}`, pageWidth - marginX, pageHeight - 18, { align: "right" });
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
