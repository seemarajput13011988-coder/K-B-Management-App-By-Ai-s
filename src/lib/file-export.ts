import { jsPDF } from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const APP_FOLDER = 'K&B Management Nexus';

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function saveNativeFile(fileName: string, base64Data: string): Promise<void> {
  const saved = await Filesystem.writeFile({
    path: APP_FOLDER + '/' + fileName,
    data: base64Data,
    directory: Directory.Documents,
    recursive: true,
  });
  try {
    await Share.share({
      title: fileName,
      text: 'Saved by K&B Management Nexus',
      url: saved.uri,
      dialogTitle: 'Save or share ' + fileName,
    });
  } catch (error) {
    console.warn('The file is saved in Documents, but the share sheet could not be opened.', error);
  }
}

export async function exportCsvFile(fileName: string, rows: unknown[][]): Promise<void> {
  const content = '\uFEFF' + rows.map(row => row.map(value =>
    '"' + String(value ?? '').replace(/"/g, '""') + '"'
  ).join(',')).join('\r\n');
  if (Capacitor.isNativePlatform()) {
    await saveNativeFile(fileName, toBase64(content));
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
    await saveNativeFile(fileName, base64);
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
