/** Extract plain text from uploaded PDF / DOCX buffers with clear, user-facing errors. */
import { HttpError } from '../middleware/index.js';

const isPdf = (buf) => buf.subarray(0, 5).toString('latin1') === '%PDF-';
const isZip = (buf) => buf[0] === 0x50 && buf[1] === 0x4b; // DOCX is a zip container

export async function extractText(buffer, fileName = '') {
  if (!buffer?.length) throw new HttpError(400, 'The uploaded file is empty.');
  if (isPdf(buffer)) {
    // Import the library entry directly: the package index runs a debug self-test.
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    try {
      const data = await pdfParse(new Uint8Array(buffer));
      return { text: data.text || '', kind: 'pdf', pages: data.numpages };
    } catch (err) {
      throw new HttpError(422, `We could not read this PDF (${/password|encrypt/i.test(err.message) ? 'it is password-protected' : 'it may be corrupted'}). Please export it again and re-upload.`);
    }
  }
  if (isZip(buffer) && /\.docx$/i.test(fileName)) {
    const mammoth = await import('mammoth');
    try {
      const { value } = await (mammoth.default || mammoth).extractRawText({ buffer });
      return { text: value || '', kind: 'docx' };
    } catch {
      throw new HttpError(422, 'We could not read this Word document. Please save it as PDF and try again.');
    }
  }
  throw new HttpError(415, 'Unsupported or mislabelled file. Please upload a PDF or DOCX resume.');
}
