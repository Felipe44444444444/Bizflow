import { jsPDF } from 'jspdf';

export function generateAndDownloadPDF(
  title: string,
  clientName: string,
  company: string,
  content: string,
  filename: string,
  options?: { signatureData?: string | null; signedAt?: string | null }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const usableWidth = pageWidth - (margin * 2);
  let y = margin;

  const clean = content
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-•]\s+/gm, '  ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]*)\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  doc.setFontSize(18);
  doc.setTextColor(0, 170, 102);
  doc.text('XENTTECH', margin, y);
  y += 3;
  doc.setDrawColor(0, 170, 102);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Cliente: ${clientName} — ${company || ''}`, margin, y);
  y += 5;
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`, margin, y);
  y += 10;

  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(title.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 12;

  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);

  const lines = doc.splitTextToSize(clean, usableWidth);

  for (const line of lines) {
    if (y > pageHeight - 30) {
      addFooter(doc, pageWidth, pageHeight, margin);
      doc.addPage();
      y = margin;
    }

    if (/^[A-ZÁÉÍÓÚÑ\s]{8,}$/.test(line.trim()) || /^(PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|SEPTIMA|OCTAVA|NOVENA|DECIMA|DECLARACIONES|CLAUSULAS)/.test(line.trim())) {
      y += 4;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(line, margin, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      y += 6;
    } else {
      doc.text(line, margin, y);
      y += 5;
    }
  }

  if (title.toLowerCase().includes('contrato')) {
    if (y > pageHeight - 80) {
      addFooter(doc, pageWidth, pageHeight, margin);
      doc.addPage();
      y = margin;
    }
    y += 15;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('FIRMAS', pageWidth / 2, y, { align: 'center' });
    y += 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Por "LA AGENCIA":', margin, y);
    doc.text('Por "EL CLIENTE":', pageWidth / 2 + 10, y);
    y += 20;
    doc.line(margin, y, margin + 60, y);
    doc.line(pageWidth / 2 + 10, y, pageWidth / 2 + 70, y);
    y += 5;
    doc.text('Nombre: ___________________', margin, y);
    doc.text(`Nombre: ${clientName}`, pageWidth / 2 + 10, y);
    y += 6;
    doc.text('Cargo: Director General', margin, y);
    doc.text('Cargo: ___________________', pageWidth / 2 + 10, y);
    y += 6;
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX')}`, margin, y);
    doc.text('Fecha: ___________________', pageWidth / 2 + 10, y);

    if (options?.signatureData) {
      try {
        y += 8;
        doc.addImage(options.signatureData, 'PNG', pageWidth / 2 + 10, y - 20, 50, 16);
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        const sigDate = options.signedAt ? new Date(options.signedAt).toLocaleDateString('es-MX') : new Date().toLocaleDateString('es-MX');
        doc.text(`Firmado digitalmente el ${sigDate}`, pageWidth / 2 + 10, y);
      } catch (e) { console.error('Sig image failed', e); }
    }
  }

  addFooter(doc, pageWidth, pageHeight, margin);
  doc.save(filename);
}

function addFooter(doc: jsPDF, pageWidth: number, pageHeight: number, _margin: number) {
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    'Documento generado por XENTTECH — Confidencial',
    pageWidth / 2, pageHeight - 10,
    { align: 'center' }
  );
}
