import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

/**
 * Downloads a DOM element as a high-fidelity PDF file, opening the OS file picker if supported
 * or triggering an automatic download to the user's computer.
 */
export async function downloadElementAsPdf(
  elementId: string, 
  filename: string = 'splendor-official-document.pdf'
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with id "${elementId}" not found for PDF export.`);
  }

  // Create canvas from element with high scale for crystal clear luxury printing
  const canvas = await html2canvas(element, {
    scale: 2.5,
    useCORS: true,
    logging: false,
    allowTaint: true,
    backgroundColor: '#ffffff'
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.98);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const ratio = imgWidth / imgHeight;

  let renderWidth = pdfWidth;
  let renderHeight = pdfWidth / ratio;

  if (renderHeight > pdfHeight) {
    // Fit to A4
    renderHeight = pdfHeight;
    renderWidth = pdfHeight * ratio;
  }

  const xOffset = (pdfWidth - renderWidth) / 2;
  const yOffset = 0;

  pdf.addImage(imgData, 'JPEG', xOffset, yOffset, renderWidth, renderHeight);
  
  const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const pdfBlob = pdf.output('blob');

  // Check if File System Access API (showSaveFilePicker) is supported in user's browser
  // This opens the real OS "Save As" file dialog so the user can choose the exact folder!
  if (typeof (window as any).showSaveFilePicker === 'function') {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: safeFilename,
        types: [{
          description: 'Adobe PDF Document (*.pdf)',
          accept: { 'application/pdf': ['.pdf'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(pdfBlob);
      await writable.close();
      return;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User deliberately cancelled the file picker dialog
        return;
      }
      // On permission or sandbox restriction, fall through to blob download
    }
  }

  // Universal fallback: Direct browser download trigger
  const blobUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
}

/**
 * Opens a dedicated print preview window and triggers the native OS printer selection dialog.
 * This guarantees the user can choose physical printers, adjust margins, and preview before printing.
 */
export function printElementDirectly(elementId: string, docTitle: string = 'طباعة مستند سبلندر الرسمي'): void {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element #${elementId} not found for printing.`);
    window.print();
    return;
  }

  const printWindow = window.open('', '_blank', 'width=950,height=1050,menubar=yes,toolbar=yes,scrollbars=yes');
  if (!printWindow) {
    // If popup blocker intervened, fallback to current window print
    window.print();
    return;
  }

  const clonedHtml = element.outerHTML;

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>${docTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @page {
            size: A4 portrait;
            margin: 0;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body {
            margin: 0;
            padding: 0;
            background-color: #ffffff;
            font-family: 'Cairo', 'Tajawal', system-ui, -apple-system, sans-serif;
          }
          .no-print {
            display: none !important;
          }
        </style>
      </head>
      <body class="p-0 m-0 bg-white">
        <div style="width: 210mm; min-height: 297mm; max-height: 297mm; margin: 0 auto; background: #ffffff; overflow: hidden; box-sizing: border-box;">
          ${clonedHtml}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 400);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
