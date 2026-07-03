import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
// pdfkit is CommonJS — dynamic import avoids bundler issues in Next.js App Router
import PDFDocument from "pdfkit";

const BUCKET = "client-documents";
const XENTTECH_GREEN = "#16a34a";

function cleanForPDF(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^>\s*/gm, "");
}

function buildPDF(
  title: string,
  clientName: string,
  company: string,
  content: string,
  stepNumber?: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ bufferPages: true, margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Header ──────────────────────────────────────────────────────────────
    doc
      .fontSize(24)
      .fillColor(XENTTECH_GREEN)
      .font("Helvetica-Bold")
      .text("XENTTECH", 50, 45, { continued: false });

    doc
      .fontSize(10)
      .fillColor("#6b7280")
      .font("Helvetica")
      .text(`${clientName}${company ? " · " + company : ""}`, 50, 52, {
        align: "right",
      });

    doc
      .moveTo(50, 75)
      .lineTo(doc.page.width - 50, 75)
      .strokeColor(XENTTECH_GREEN)
      .lineWidth(1.5)
      .stroke();

    // ── Title ────────────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc
      .fontSize(18)
      .fillColor("#111827")
      .font("Helvetica-Bold")
      .text(title, { align: "left" });

    doc
      .fontSize(9)
      .fillColor("#9ca3af")
      .font("Helvetica")
      .text(new Date().toLocaleDateString("es-MX", { dateStyle: "long" }));

    doc
      .moveTo(50, doc.y + 8)
      .lineTo(doc.page.width - 50, doc.y + 8)
      .strokeColor("#e5e7eb")
      .lineWidth(0.5)
      .stroke();

    doc.moveDown(1.2);

    // ── Content ──────────────────────────────────────────────────────────────
    const lines = cleanForPDF(content).split("\n");
    for (const raw of lines) {
      const line = raw.trim();

      if (line === "" || line === "---") {
        doc.moveDown(0.4);
        continue;
      }

      // Markdown-style section heading: ##, ###
      if (/^#{1,3}\s/.test(line)) {
        const text = line.replace(/^#+\s*/, "");
        doc.moveDown(0.6);
        doc
          .fontSize(13)
          .fillColor(XENTTECH_GREEN)
          .font("Helvetica-Bold")
          .text(text);
        doc.moveDown(0.2);
        continue;
      }

      // Bold line surrounded by **
      if (/^\*\*(.+)\*\*$/.test(line)) {
        const text = line.replace(/^\*\*|\*\*$/g, "");
        doc
          .fontSize(11)
          .fillColor("#1f2937")
          .font("Helvetica-Bold")
          .text(text);
        continue;
      }

      // Bullet point
      if (/^[-•*]\s/.test(line)) {
        const text = line.replace(/^[-•*]\s+/, "");
        doc
          .fontSize(10)
          .fillColor("#374151")
          .font("Helvetica")
          .text(`• ${text}`, { indent: 12 });
        continue;
      }

      // Regular paragraph
      doc.fontSize(10).fillColor("#374151").font("Helvetica").text(line, {
        lineGap: 2,
      });
    }

    // ── Signature section (contracts only) ───────────────────────────────────
    if (stepNumber === 1) {
      doc.moveDown(2);
      doc
        .moveTo(50, doc.y)
        .lineTo(doc.page.width - 50, doc.y)
        .strokeColor("#e5e7eb")
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(1);
      doc
        .fontSize(12)
        .fillColor(XENTTECH_GREEN)
        .font("Helvetica-Bold")
        .text("FIRMAS");
      doc.moveDown(0.8);

      const colW = (doc.page.width - 100) / 2 - 10;
      const leftX = 50;
      const rightX = 50 + colW + 20;
      const baseY = doc.y;

      // Left column — CLIENT
      doc.fontSize(8).fillColor("#6b7280").font("Helvetica").text("REPRESENTANTE DEL CLIENTE", leftX, baseY);
      doc.moveDown(2.5);
      doc.moveTo(leftX, doc.y).lineTo(leftX + colW, doc.y).strokeColor("#d1d5db").lineWidth(0.5).stroke();
      doc.moveDown(0.3);
      doc.fontSize(8).fillColor("#9ca3af").text("Nombre y firma", leftX);
      doc.moveDown(1.2);
      doc.moveTo(leftX, doc.y).lineTo(leftX + colW, doc.y).strokeColor("#d1d5db").lineWidth(0.5).stroke();
      doc.moveDown(0.3);
      doc.fontSize(8).fillColor("#9ca3af").text("Fecha", leftX);

      // Right column — AGENCY
      doc.fontSize(8).fillColor("#6b7280").font("Helvetica").text("REPRESENTANTE DE LA AGENCIA", rightX, baseY);
      const agencyY = baseY + 20 + 8;
      doc.moveTo(rightX, agencyY + 20).lineTo(rightX + colW, agencyY + 20).strokeColor("#d1d5db").lineWidth(0.5).stroke();
      doc.fontSize(8).fillColor("#9ca3af").text("Nombre y firma", rightX, agencyY + 24);
      doc.moveTo(rightX, agencyY + 48).lineTo(rightX + colW, agencyY + 48).strokeColor("#d1d5db").lineWidth(0.5).stroke();
      doc.fontSize(8).fillColor("#9ca3af").text("Fecha", rightX, agencyY + 52);
    }

    // ── Page numbers ─────────────────────────────────────────────────────────
    const totalPages = (doc.bufferedPageRange().count) as number;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor("#9ca3af")
        .font("Helvetica")
        .text(`Página ${i + 1} de ${totalPages}`, 50, doc.page.height - 35, {
          align: "center",
          width: doc.page.width - 100,
        });
    }

    doc.end();
  });
}

const TABLE_MAP: Record<string, string> = {
  onboarding: "onboarding_documents",
  docs: "onboarding_documents",
  ads: "campaigns",
  design: "designs",
  "brand-manual": "strategies",
  strategy: "strategies",
};

export async function POST(req: NextRequest) {
  const {
    content,
    title,
    client_name,
    company,
    step_name,
    client_id,
    document_type,
    document_id,
    step_number,
  } = await req.json();

  if (!content || !client_id || !document_type || !document_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Generate PDF buffer
  const pdfBuffer = await buildPDF(
    title ?? step_name ?? "Documento",
    client_name ?? "",
    company ?? "",
    content,
    step_number ?? undefined
  );

  // Upload to Supabase Storage
  const safeName = (step_name ?? document_type ?? "doc")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const path = `${client_id}/${safeName}-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const pdf_url = urlData.publicUrl;

  // Update pdf_url in the corresponding table
  const table = TABLE_MAP[document_type];
  if (table) {
    const { error: dbError } = await supabase
      .from(table)
      .update({ pdf_url })
      .eq("id", document_id);

    if (dbError) {
      console.error("DB update error:", dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, pdf_url });
}
