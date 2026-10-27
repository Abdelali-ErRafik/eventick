import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { ticketPayload } from "./ticket-signature.js";

/**
 * Server-rendered ticket PDF — what gets attached to the confirmation email.
 *
 * Deliberately built with the core PDF fonts (Helvetica) rather than the
 * charte's display face: embedding a webfont would add weight for a document
 * whose job is to survive printing and scanning. Colours do follow the charte.
 *
 * Arabic is not rendered here: PDFKit has no bidi/shaping support, so Arabic
 * text would come out disconnected and in the wrong order. The PDF stays
 * French; the app itself remains bilingual.
 */

const LAGON = "#0B7A75";
const SAFRAN = "#FFB400";
const ENCRE = "#14172F";
const MUTED = "#3E4948";
const PAPER = "#F4F6FA";

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

/** One A4 page per ticket. Returns the finished PDF bytes. */
export async function renderTicketsPdf(tickets: TicketPdfInput[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  for (const ticket of tickets) {
    const qr = await QRCode.toBuffer(ticketPayload(ticket.ref, ticket.eventSlug), {
      margin: 1,
      width: 420,
      errorCorrectionLevel: "M",
      color: { dark: ENCRE, light: "#FFFFFF" },
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

  // Header band
  doc.rect(0, 0, pageWidth, 96).fill(ENCRE);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text("eventick", margin, 36, { continued: true });
  doc.fillColor(SAFRAN).text(".ma");
  doc
    .fillColor("#C5D0CE")
    .font("Helvetica")
    .fontSize(9)
    .text("BILLET ÉLECTRONIQUE", pageWidth - margin - 160, 44, { width: 160, align: "right" });

  let y = 140;

  doc.fillColor(ENCRE).font("Helvetica-Bold").fontSize(24).text(ticket.eventTitle, margin, y, { width });
  y = doc.y + 8;

  const date = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(ticket.startAt);
  doc.fillColor(LAGON).font("Helvetica-Bold").fontSize(12).text(date, margin, y, { width });
  y = doc.y + 4;
  doc.fillColor(MUTED).font("Helvetica").fontSize(11).text(`${ticket.venue} · ${ticket.city}`, margin, y, { width });
  y = doc.y + 24;

  // QR, with the detail block beside it
  const qrSize = 180;
  doc.image(qr, margin, y, { width: qrSize, height: qrSize });

  const infoX = margin + qrSize + 28;
  const infoWidth = width - qrSize - 28;
  let infoY = y + 4;

  const row = (label: string, value: string) => {
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(label.toUpperCase(), infoX, infoY, { width: infoWidth });
    doc.fillColor(ENCRE).font("Helvetica-Bold").fontSize(13).text(value, infoX, doc.y + 1, { width: infoWidth });
    infoY = doc.y + 10;
  };

  row("Titulaire", ticket.holderName);
  row("Catégorie", ticket.tierName);
  row("Zone / Porte", `${ticket.zone} · ${ticket.gate}`);
  row(
    "Place",
    ticket.seatRow && ticket.seatNumber ? `Rang ${String(ticket.seatRow).padStart(2, "0")} · Place ${ticket.seatNumber}` : "Placement libre",
  );

  y = Math.max(y + qrSize, infoY) + 20;

  // Reference strip
  doc.rect(margin, y, width, 54).fill(PAPER);
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("RÉFÉRENCE", margin + 16, y + 12);
  doc.fillColor(LAGON).font("Courier-Bold").fontSize(15).text(ticket.ref, margin + 16, y + 24);
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text("MONTANT", margin + width - 160, y + 12, { width: 144, align: "right" });
  doc
    .fillColor(ENCRE)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(`${money(ticket.priceCents)} MAD`, margin + width - 160, y + 23, { width: 144, align: "right" });

  y += 78;

  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Présentez ce QR code à l'entrée. Un billet ne peut être scanné qu'une seule fois. " +
        `Commande ${ticket.orderId}.`,
      margin,
      y,
      { width },
    );
}
