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
