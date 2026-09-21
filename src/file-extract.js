// Extract text on the device. Nothing is uploaded merely to read a file.
// Pages/slides stay distinct so source suggestions can point back to them.
const MAX_SIZE = 30 * 1024 * 1024;

function xmlText(xml, paragraphTag) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('This Office file contains unreadable text.');
  const paragraphs = [...doc.getElementsByTagName(paragraphTag)];
  return paragraphs.map((p) => [...p.getElementsByTagName('a:t'), ...p.getElementsByTagName('w:t')]
    .map((n) => n.textContent).join('')).filter(Boolean).join('\n');
}

export async function extractFile(file) {
  if (file.size > MAX_SIZE) throw new Error('Choose a file under 30 MB.');
  const name = file.name.toLowerCase();
  if (/\.(txt|md)$/i.test(name)) return { text: await file.text(), pages: 1 };
  if (/\.pdf$/i.test(name)) {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const document = await task.promise;
    try {
      const pages = [];
      for (let i = 1; i <= document.numPages; i++) {
        const page = await document.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((part) => part.str || '').join(' '));
      }
      return { text: pages.join('\f'), pages: pages.length,
        warning: pages.every((page) => !page.trim()) ? 'No selectable text found. This may be a scanned PDF.' : null };
    } finally { await task.destroy(); }
  }
  if (/\.(docx|pptx)$/i.test(name)) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: ({ name: path }) => name.endsWith('.docx') ? path === 'word/document.xml' : /^ppt\/slides\/slide\d+\.xml$/.test(path)
    });
    if (name.endsWith('.docx')) {
      if (!entries['word/document.xml']) throw new Error('The document has no readable body.');
      return { text: xmlText(strFromU8(entries['word/document.xml']), 'w:p'), pages: 1 };
    }
    const slides = Object.entries(entries).sort(([a], [b]) => Number(/slide(\d+)/.exec(a)?.[1]) - Number(/slide(\d+)/.exec(b)?.[1]));
    if (!slides.length) throw new Error('The presentation has no readable slides.');
    return { text: slides.map(([, bytes]) => xmlText(strFromU8(bytes), 'a:p')).join('\f'), pages: slides.length };
  }
  throw new Error('Use a PDF, Word document, presentation, text file, or calendar feed.');
}
