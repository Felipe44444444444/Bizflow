const pdfParse = require('pdf-parse');

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let i = 0;

  while (i < words.length) {
    const slice = words.slice(i, i + chunkSize).join(' ');
    if (slice.trim()) chunks.push(slice.trim());
    if (i + chunkSize >= words.length) break;
    i += chunkSize - overlap;
  }

  return chunks;
}

async function extractText(buffer, type) {
  switch (type) {
    case 'pdf': {
      const data = await pdfParse(buffer);
      return data.text;
    }
    case 'txt':
    case 'manual':
    case 'faq':
      return buffer.toString('utf-8');
    default:
      return buffer.toString('utf-8');
  }
}

module.exports = { chunkText, extractText };
