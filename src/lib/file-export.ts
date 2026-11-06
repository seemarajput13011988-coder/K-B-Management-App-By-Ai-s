import { Capacitor, registerPlugin } from '@capacitor/core';

interface DocumentSaverPlugin {
  saveFile(options: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
  }): Promise<{ uri: string }>;
}

const DocumentSaver = registerPlugin<DocumentSaverPlugin>('DocumentSaver');

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function saveNativeFile(fileName: string, mimeType: string, base64Data: string): Promise<void> {
  // Android's Storage Access Framework opens the system "Save as" picker.
  // It grants access only to the file selected by the user; broad storage
  // permissions are not required on modern Android versions.
  const result = await DocumentSaver.saveFile({ fileName, mimeType, dataBase64: base64Data });
  if (!result?.uri) throw new Error('Android did not confirm that the file was saved.');
}

export async function exportCsvFile(fileName: string, rows: unknown[][]): Promise<void> {
  const content = '\uFEFF' + rows.map(row => row.map(value =>
    '"' + String(value ?? '').replace(/"/g, '""') + '"'
  ).join(',')).join('\r\n');
  if (Capacitor.isNativePlatform()) {
    await saveNativeFile(fileName, 'text/csv', toBase64(content));
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 3000);
}

export async function exportPdfFile(fileName: string, pdfDataUri: string): Promise<void> {
  const base64 = pdfDataUri.slice(pdfDataUri.indexOf(',') + 1);
  if (!base64) throw new Error('The PDF could not be generated.');
  if (Capacitor.isNativePlatform()) {
    await saveNativeFile(fileName, 'application/pdf', base64);
    return;
  }
  const link = document.createElement('a');
  link.href = pdfDataUri;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), 1000);
}

export async function exportPdfReport(fileName: string, title: string, rows: unknown[][]): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const landscape = (rows[0]?.length || 0) >= 7;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usableWidth = pageWidth - margin * 2;
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const columnWidth = usableWidth / columnCount;
  const lineHeight = 4;
  let y = 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20, 59, 103);
  doc.text('K&B NET SERVICE', margin, y);
  y += 7;
  doc.setFontSize(12);
  doc.setTextColor(25, 38, 58);
  doc.text(title, margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Management Nexus · Generated ' + new Date().toLocaleString('en-IN'), margin, y);
  y += 8;
  rows.forEach((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, index) => String(row[index] ?? ''));
    const wrapped = cells.map(value => doc.splitTextToSize(value, Math.max(8, columnWidth - 4)).slice(0, 5));
    const height = Math.max(8, ...wrapped.map(lines => lines.length * lineHeight + 4));
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    cells.forEach((_, colIndex) => {
      const x = margin + colIndex * columnWidth;
      if (rowIndex === 0) {
        doc.setFillColor(21, 63, 105);
        doc.setDrawColor(21, 63, 105);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setFillColor(rowIndex % 2 ? 248 : 255, rowIndex % 2 ? 250 : 255, rowIndex % 2 ? 252 : 255);
        doc.setDrawColor(220, 228, 237);
        doc.setTextColor(40, 52, 70);
        doc.setFont('helvetica', 'normal');
      }
      doc.rect(x, y, columnWidth, height, 'FD');
      doc.setFontSize(7);
      doc.text(wrapped[colIndex], x + 2, y + 4);
    });
    y += height;
  });
  await exportPdfFile(fileName, doc.output('datauristring'));
}
