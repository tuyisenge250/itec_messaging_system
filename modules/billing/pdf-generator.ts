import PDFDocument from "pdfkit";
import { formatMoney } from "@/shared/utils/money";

export interface InvoicePdfInput {
  invoiceNumber: string;
  createdAt: Date;
  organizationName: string;
  organizationAddress?: string | null;
  description: string;
  amountMinorUnits: number;
  currency: string;
  providerReference?: string | null;
}

/** Builds a one-page receipt PDF into a Buffer — no disk writes, streamed straight from pdfkit into memory. */
export function generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("SMS Gateway", { continued: false });
    doc.fontSize(10).fillColor("#666666").text("Payment receipt");
    doc.moveDown(1.5);

    doc.fillColor("#000000").fontSize(14).text(`Invoice ${input.invoiceNumber}`);
    doc.fontSize(10).fillColor("#666666").text(`Date: ${input.createdAt.toLocaleDateString("en-RW")}`);
    if (input.providerReference) doc.text(`Reference: ${input.providerReference}`);
    doc.moveDown(1);

    doc.fillColor("#000000").fontSize(11).text("Billed to:");
    doc.fontSize(10).fillColor("#333333").text(input.organizationName);
    if (input.organizationAddress) doc.text(input.organizationAddress);
    doc.moveDown(1.5);

    const tableTop = doc.y;
    doc.fontSize(10).fillColor("#000000");
    doc.text("Description", 50, tableTop, { width: 350 });
    doc.text("Amount", 420, tableTop, { width: 100, align: "right" });
    doc.moveTo(50, tableTop + 18).lineTo(520, tableTop + 18).strokeColor("#cccccc").stroke();

    const rowY = tableTop + 28;
    doc.fontSize(10).fillColor("#333333");
    doc.text(input.description, 50, rowY, { width: 350 });
    doc.text(formatMoney(input.amountMinorUnits, input.currency), 420, rowY, { width: 100, align: "right" });

    doc.moveTo(50, rowY + 24).lineTo(520, rowY + 24).strokeColor("#cccccc").stroke();
    doc.fontSize(11).fillColor("#000000").text("Total", 50, rowY + 34, { width: 350 });
    doc.text(formatMoney(input.amountMinorUnits, input.currency), 420, rowY + 34, { width: 100, align: "right" });

    doc.moveDown(3);
    doc.fontSize(10).fillColor("#0a8a0a").text("PAID", 50, doc.y);

    doc.end();
  });
}
