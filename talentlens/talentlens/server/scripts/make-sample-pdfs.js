/** Render the demo resumes to simple text-based PDFs in ../../samples (run: node scripts/make-sample-pdfs.js). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { RESUMES } from './sample-resumes.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../samples');
fs.mkdirSync(out, { recursive: true });

const HEADERS = /^(summary|profile|skills|technical skills|experience|work experience|education|projects)$/i;

for (const [file, text] of Object.entries(RESUMES)) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  text.split('\n').forEach((line, i) => {
    const isName = i === 0;
    const isHeader = HEADERS.test(line.trim());
    const size = isName ? 20 : isHeader ? 13 : 10.5;
    if (isHeader) y -= 8;
    // Wrap long lines at ~95 characters.
    const parts = line.length > 95 ? line.match(/.{1,95}(\s|$)/g) : [line];
    for (const part of parts) {
      if (y < 60) { page = pdf.addPage([595, 842]); y = 790; }
      page.drawText(part.trim(), { x: 50, y, size, font: isName || isHeader ? bold : regular, color: isHeader ? rgb(0.31, 0.42, 0.3) : rgb(0.14, 0.19, 0.15) });
      y -= size + 6;
    }
  });
  fs.writeFileSync(path.join(out, file), await pdf.save());
  console.log('wrote', file);
}
