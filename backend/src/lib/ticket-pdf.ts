import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { ticketPayload } from "./ticket-signature.js";

/**
 * Server-rendered ticket PDF — attached to the confirmation email and served
 * by GET /tickets/:id/pdf.
 *
 * Deliberately built with the core PDF fonts (Helvetica) rather than the
 * charte's display face: embedding a webfont would add weight for a document
 * whose job is to survive printing and scanning.
 *
 * The page stays LIGHT even though the app is dark-themed. This is the one
 * artefact people print, and a full-bleed near-black page would drain a
 * cartridge and scan badly. What it borrows from the screen is the structure
 * of the TicketPass component — dark header band, event block, perforated QR
 * panel, reference strip — and the current palette, rather than being the one
 * surface still carrying the retired teal/orange charte.
 *
 * Arabic is not rendered here: PDFKit has no bidi/shaping support, so Arabic
 * text would come out disconnected and in the wrong order. The PDF stays
 * French; the app itself remains bilingual.
 */

// Matches frontend/src/app/styles.css. The old LAGON/SAFRAN pair was from a
// palette the app no longer uses anywhere, which is why the PDF read as a
// different product than every screen that leads to it.
const INK = "#141418"; // --et-stage, near-black
const PINK = "#d6246e"; // --et-primary, the brand
const LIME = "#c6f135"; // --et-accent, on dark only
const MUTED = "#5f5f6b"; // --et-muted
const PAPER = "#f7f6f9"; // --et-paper
const LINE = "#e4e2e9"; // hairline on paper
const STAGE_MUTED = "#a8a8b3"; // --et-stage-muted, secondary text on the band
const WHITE = "#ffffff";

export interface TicketPdfInput {
  ref: string;
  holderName: string;
  eventSlug: string;
  eventTitle: string;
  venue: string;
  city: string;
  startAt: Date;
  tierName: string;
  zone: string;
  gate: string;
  seatRow: number | null;
  seatNumber: number | null;
  priceCents: number;
  orderId: string;
}

function money(cents: number): string {
  return new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function seatLabel(ticket: TicketPdfInput): string {
  if (!ticket.seatRow || !ticket.seatNumber) return "Placement libre";
  return `Rang ${String(ticket.seatRow).padStart(2, "0")} · Place ${ticket.seatNumber}`;
}

/** One A4 page per ticket. Returns the finished PDF bytes. */
export async function renderTicketsPdf(tickets: TicketPdfInput[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  for (const ticket of tickets) {
    const qr = await QRCode.toBuffer(ticketPayload(ticket.ref, ticket.eventSlug), {
      margin: 1,
      width: 480,
      // The one thing on this page that MUST survive a bad printer and a
      // phone screen at an angle, so it gets the higher correction level.
      errorCorrectionLevel: "Q",
      color: { dark: INK, light: WHITE },
    });
    drawTicket(doc, ticket, qr);
  }

  doc.end();
  return done;
}

function drawTicket(doc: PDFKit.PDFDocument, ticket: TicketPdfInput, qr: Buffer): void {
  doc.addPage();
  const pageWidth = doc.page.width;
  const margin = 48;
  const width = pageWidth - margin * 2;

  // ── Header band ───────────────────────────────────────────────────────
  const bandHeight = 104;
  doc.rect(0, 0, pageWidth, bandHeight).fill(INK);

  // "Eventick.ma" — capital E, and .ma in the accent, matching the footer
  // wordmark. The old version rendered it lowercase in a colour the brand
  // had already dropped.
  doc.font("Helvetica-Bold").fontSize(23);
  const brandY = 38;
  doc.fillColor(WHITE).text("Eventick", margin, brandY, { continued: true });
  doc.fillColor(LIME).text(".ma");

  doc
    .fillColor(STAGE_MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text("BILLET ÉLECTRONIQUE", pageWidth - margin - 180, brandY + 6, {
      width: 180,
      align: "right",
      characterSpacing: 1.1,
    });

  // ── Event block ───────────────────────────────────────────────────────
  let y = bandHeight + 44;

  doc.fillColor(INK).font("Helvetica-Bold").fontSize(23).text(ticket.eventTitle, margin, y, { width, lineGap: 2 });
  y = doc.y + 10;

  const date = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ticket.startAt);
  doc.fillColor(PINK).font("Helvetica-Bold").fontSize(12).text(date, margin, y, { width });
  y = doc.y + 5;
  doc.fillColor(MUTED).font("Helvetica").fontSize(11).text(`${ticket.venue} · ${ticket.city}`, margin, y, { width });
  y = doc.y + 30;

  // ── QR panel + detail grid ────────────────────────────────────────────
  // The QR sits on its own tinted panel, the way the stub/QR split reads on
  // screen, instead of floating loose against the page.
  const qrSize = 186;
  const panelPad = 18;
  const panelWidth = qrSize + panelPad * 2;
  const panelHeight = qrSize + panelPad * 2 + 26;

  doc.roundedRect(margin, y, panelWidth, panelHeight, 10).fill(PAPER);
  doc.image(qr, margin + panelPad, y + panelPad, { width: qrSize, height: qrSize });
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text("Luminosité maximale au portique", margin, y + panelPad + qrSize + 9, {
      width: panelWidth,
      align: "center",
    });

  const perfX = margin + panelWidth + 20;
  const infoX = perfX + 24;
  const infoWidth = margin + width - infoX;

  const rows: Array<[string, string]> = [
    ["Titulaire", ticket.holderName],
    ["Catégorie", ticket.tierName],
    ["Zone / Porte", `${ticket.zone} · ${ticket.gate}`],
    ["Place", seatLabel(ticket)],
  ];

  // Measure the detail column before drawing it, so it can be centred against
  // the QR panel rather than top-aligned. Top-aligning left a large dead gap
  // under the last row whenever the panel was taller than the four rows,
  // which is the usual case.
  const LABEL_SIZE = 7.5;
  const VALUE_SIZE = 13;
  const ROW_GAP = 13;
  let rowsHeight = 0;
  for (const [label, value] of rows) {
    doc.font("Helvetica").fontSize(LABEL_SIZE);
    rowsHeight += doc.heightOfString(label.toUpperCase(), { width: infoWidth, characterSpacing: 0.9 });
    doc.font("Helvetica-Bold").fontSize(VALUE_SIZE);
    rowsHeight += 2 + doc.heightOfString(value, { width: infoWidth }) + ROW_GAP;
  }
  rowsHeight -= ROW_GAP; // no trailing gap after the last row

  const bandHeightUsed = Math.max(panelHeight, rowsHeight);
  let infoY = y + Math.max(0, (bandHeightUsed - rowsHeight) / 2);

  // The dotted perforation that makes this read as a ticket rather than a
  // receipt — the same cue the on-screen TicketPass uses. Spans the whole
  // band, so it still reads as one tear line when the detail column is the
  // taller side.
  doc
    .save()
    .lineWidth(1)
    .dash(3, { space: 3 })
    .strokeColor(LINE)
    .moveTo(perfX, y + 6)
    .lineTo(perfX, y + bandHeightUsed - 6)
    .stroke()
    .undash()
    .restore();

  const row = (label: string, value: string) => {
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(LABEL_SIZE)
      .text(label.toUpperCase(), infoX, infoY, { width: infoWidth, characterSpacing: 0.9 });
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(VALUE_SIZE).text(value, infoX, doc.y + 2, { width: infoWidth });
    infoY = doc.y + ROW_GAP;
  };

  for (const [label, value] of rows) row(label, value);

  y += bandHeightUsed + 26;

  // ── Reference strip ───────────────────────────────────────────────────
  const stripHeight = 60;
  doc.roundedRect(margin, y, width, stripHeight, 10).fill(PAPER);

  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text("RÉFÉRENCE", margin + 18, y + 14, { characterSpacing: 0.9 });
  doc.fillColor(INK).font("Courier-Bold").fontSize(15).text(ticket.ref, margin + 18, y + 28);

  const amountWidth = 170;
  const amountX = margin + width - amountWidth - 18;
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(7.5)
    .text("MONTANT", amountX, y + 14, { width: amountWidth, align: "right", characterSpacing: 0.9 });
  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(`${money(ticket.priceCents)} MAD`, amountX, y + 26, { width: amountWidth, align: "right" });

  y += stripHeight + 22;

  // ── Footnote ──────────────────────────────────────────────────────────
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text("Présentez ce QR code à l'entrée. Un billet ne peut être scanné qu'une seule fois.", margin, y, {
      width,
      lineGap: 2,
    });
  // The order id is for support, not for the holder, so it is set apart in
  // mono at the smallest size rather than running into the instruction above
  // as one unbroken sentence.
  doc
    .fillColor(MUTED)
    .font("Courier")
    .fontSize(7.5)
    .text(`Commande ${ticket.orderId}`, margin, doc.y + 4, { width });
}
