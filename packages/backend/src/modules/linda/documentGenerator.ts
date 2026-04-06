/**
 * Document Generator — Creates proper .docx and .pdf binary files
 * from text/markdown content using only Node.js built-ins.
 *
 * No external dependencies required:
 * - DOCX: Built as a ZIP archive containing Office Open XML
 * - PDF: Built using raw PDF 1.4 syntax
 */

import * as zlib from 'zlib';

// ─── DOCX Generation ────────────────────────────────────────────────────────

/**
 * Generate a .docx file buffer from text content.
 * Supports basic markdown: # headings, **bold**, *italic*, - bullet lists, numbered lists.
 */
export function generateDocx(content: string, title?: string): Buffer {
  const paragraphs = parseContentToParagraphs(content);
  const documentXml = buildDocumentXml(paragraphs, title);
  const stylesXml = buildStylesXml();
  const contentTypesXml = buildContentTypesXml();
  const relsXml = buildRelsXml();
  const docRelsXml = buildDocRelsXml();

  // Build ZIP archive
  const files: Array<{ path: string; content: string }> = [
    { path: '[Content_Types].xml', content: contentTypesXml },
    { path: '_rels/.rels', content: relsXml },
    { path: 'word/_rels/document.xml.rels', content: docRelsXml },
    { path: 'word/document.xml', content: documentXml },
    { path: 'word/styles.xml', content: stylesXml },
  ];

  return createZipBuffer(files);
}

interface DocParagraph {
  text: string;
  style: 'Title' | 'Heading1' | 'Heading2' | 'Heading3' | 'Normal' | 'ListBullet' | 'ListNumber';
  runs: Array<{ text: string; bold?: boolean; italic?: boolean }>;
}

function parseContentToParagraphs(content: string): DocParagraph[] {
  const lines = content.split('\n');
  const paragraphs: DocParagraph[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    // Skip empty lines but add spacing
    if (!trimmed) {
      paragraphs.push({ text: '', style: 'Normal', runs: [{ text: '' }] });
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      const text = trimmed.slice(4);
      paragraphs.push({ text, style: 'Heading3', runs: parseInlineFormatting(text) });
    } else if (trimmed.startsWith('## ')) {
      const text = trimmed.slice(3);
      paragraphs.push({ text, style: 'Heading2', runs: parseInlineFormatting(text) });
    } else if (trimmed.startsWith('# ')) {
      const text = trimmed.slice(2);
      paragraphs.push({ text, style: 'Heading1', runs: parseInlineFormatting(text) });
    }
    // Bullet lists
    else if (/^[-*•]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*•]\s+/, '');
      paragraphs.push({ text, style: 'ListBullet', runs: parseInlineFormatting(text) });
    }
    // Numbered lists
    else if (/^\d+[.)]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^\d+[.)]\s+/, '');
      paragraphs.push({ text, style: 'ListNumber', runs: parseInlineFormatting(text) });
    }
    // Normal paragraph
    else {
      paragraphs.push({ text: trimmed, style: 'Normal', runs: parseInlineFormatting(trimmed) });
    }
  }

  return paragraphs;
}

function parseInlineFormatting(text: string): Array<{ text: string; bold?: boolean; italic?: boolean }> {
  const runs: Array<{ text: string; bold?: boolean; italic?: boolean }> = [];
  // Match **bold**, *italic*, and plain text
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push({ text: match[2], bold: true });
    } else if (match[3]) {
      runs.push({ text: match[3], italic: true });
    } else if (match[4]) {
      runs.push({ text: match[4] });
    }
  }

  if (runs.length === 0) {
    runs.push({ text });
  }

  return runs;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDocumentXml(paragraphs: DocParagraph[], title?: string): string {
  let body = '';

  // Add title if provided
  if (title) {
    body += `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="56"/></w:rPr><w:t>${escapeXml(title)}</w:t></w:r></w:p>`;
  }

  for (const para of paragraphs) {
    body += '<w:p>';

    // Paragraph properties
    if (para.style !== 'Normal' || !para.text) {
      body += '<w:pPr>';
      if (para.style !== 'Normal') {
        body += `<w:pStyle w:val="${para.style}"/>`;
      }
      if (para.style === 'ListBullet') {
        body += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>';
      } else if (para.style === 'ListNumber') {
        body += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>';
      }
      body += '</w:pPr>';
    }

    // Runs
    for (const run of para.runs) {
      body += '<w:r>';
      if (run.bold || run.italic) {
        body += '<w:rPr>';
        if (run.bold) body += '<w:b/>';
        if (run.italic) body += '<w:i/>';
        body += '</w:rPr>';
      }
      body += `<w:t xml:space="preserve">${escapeXml(run.text)}</w:t>`;
      body += '</w:r>';
    }

    body += '</w:p>';
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 wp14">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:after="300"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="56"/><w:szCs w:val="56"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/><w:color w:val="2E74B5"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="1F4D78"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListNumber"><w:name w:val="List Number"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
  </w:style>
  <w:style w:type="numbering" w:styleId="BulletList"><w:name w:val="BulletList"/></w:style>
</w:styles>`;
}

function buildContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
}

function buildRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function buildDocRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

// ─── PDF Generation ─────────────────────────────────────────────────────────

/**
 * Generate a .pdf file buffer from text content.
 * Uses raw PDF 1.4 syntax — no external libraries needed.
 * Supports basic formatting: headings (larger/bold), body text, bullet lists.
 */
export function generatePdf(content: string, title?: string): Buffer {
  const lines = content.split('\n');
  const pageWidth = 612; // Letter size in points
  const pageHeight = 792;
  const marginLeft = 72;
  const marginRight = 72;
  const marginTop = 72;
  const marginBottom = 72;
  const usableWidth = pageWidth - marginLeft - marginRight;

  // Parse lines into styled entries
  interface PdfLine {
    text: string;
    fontSize: number;
    bold: boolean;
    indent: number;
    spacingAfter: number;
  }

  const pdfLines: PdfLine[] = [];

  if (title) {
    pdfLines.push({ text: title, fontSize: 22, bold: true, indent: 0, spacingAfter: 16 });
    pdfLines.push({ text: '', fontSize: 12, bold: false, indent: 0, spacingAfter: 8 });
  }

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (!trimmed) {
      pdfLines.push({ text: '', fontSize: 12, bold: false, indent: 0, spacingAfter: 6 });
      continue;
    }

    // Strip markdown bold/italic markers for PDF (we handle bold via font)
    const cleanText = trimmed.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

    if (trimmed.startsWith('### ')) {
      pdfLines.push({ text: cleanText.slice(4), fontSize: 14, bold: true, indent: 0, spacingAfter: 8 });
    } else if (trimmed.startsWith('## ')) {
      pdfLines.push({ text: cleanText.slice(3), fontSize: 16, bold: true, indent: 0, spacingAfter: 10 });
    } else if (trimmed.startsWith('# ')) {
      pdfLines.push({ text: cleanText.slice(2), fontSize: 20, bold: true, indent: 0, spacingAfter: 12 });
    } else if (/^[-*•]\s+/.test(trimmed)) {
      const text = '\u2022  ' + cleanText.replace(/^[-*•]\s+/, '');
      pdfLines.push({ text, fontSize: 12, bold: false, indent: 20, spacingAfter: 4 });
    } else if (/^\d+[.)]\s+/.test(trimmed)) {
      pdfLines.push({ text: cleanText, fontSize: 12, bold: false, indent: 20, spacingAfter: 4 });
    } else {
      // Word-wrap long lines
      const wrappedLines = wordWrap(cleanText, usableWidth, 12);
      for (const wl of wrappedLines) {
        pdfLines.push({ text: wl, fontSize: 12, bold: false, indent: 0, spacingAfter: 2 });
      }
      pdfLines.push({ text: '', fontSize: 12, bold: false, indent: 0, spacingAfter: 4 });
    }
  }

  // Split into pages
  const pages: PdfLine[][] = [[]];
  let currentY = pageHeight - marginTop;

  for (const pdfLine of pdfLines) {
    const lineHeight = pdfLine.fontSize * 1.4 + pdfLine.spacingAfter;
    if (currentY - lineHeight < marginBottom) {
      pages.push([]);
      currentY = pageHeight - marginTop;
    }
    pages[pages.length - 1].push(pdfLine);
    currentY -= lineHeight;
  }

  // Build PDF
  return buildPdfBuffer(pages, pageWidth, pageHeight, marginLeft, marginTop);
}

function wordWrap(text: string, maxWidth: number, fontSize: number): string[] {
  // Approximate: average char width ≈ fontSize * 0.5 for Helvetica
  const avgCharWidth = fontSize * 0.5;
  const maxChars = Math.floor(maxWidth / avgCharWidth);

  if (text.length <= maxChars) return [text];

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine.trim()) lines.push(currentLine.trim());

  return lines;
}

function escapePdfString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    // Replace common unicode with ASCII equivalents
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/\u2022/g, '\\267') // bullet
    .replace(/\u2026/g, '...')
    // Remove any remaining non-ASCII
    .replace(/[^\x00-\x7F]/g, '?');
}

interface PdfLine {
  text: string;
  fontSize: number;
  bold: boolean;
  indent: number;
  spacingAfter: number;
}

function buildPdfBuffer(
  pages: PdfLine[][],
  pageWidth: number,
  pageHeight: number,
  marginLeft: number,
  marginTop: number,
): Buffer {
  const objects: string[] = [];
  const offsets: number[] = [];
  let output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';

  function addObject(content: string): number {
    const objNum = objects.length + 1;
    offsets.push(output.length);
    const obj = `${objNum} 0 obj\n${content}\nendobj\n`;
    output += obj;
    objects.push(obj);
    return objNum;
  }

  // Object 1: Catalog
  const catalogObj = addObject('<< /Type /Catalog /Pages 2 0 R >>');

  // Object 2: Pages (placeholder - we'll fix later)
  const pagesObjNum = objects.length + 1;
  offsets.push(0); // placeholder
  objects.push(''); // placeholder
  output += ''; // placeholder - we'll rebuild

  // Object 3: Font - Helvetica
  const fontObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  // Object 4: Font - Helvetica Bold
  const fontBoldObj = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  // Build page objects
  const pageObjNums: number[] = [];
  for (const page of pages) {
    // Build content stream
    let stream = '';
    stream += 'BT\n';

    let y = pageHeight - marginTop;
    for (const line of page) {
      if (!line.text && !line.spacingAfter) continue;

      if (line.text) {
        const fontRef = line.bold ? '/F2' : '/F1';
        stream += `${fontRef} ${line.fontSize} Tf\n`;
        stream += `${marginLeft + line.indent} ${y.toFixed(1)} Td\n`;
        stream += `(${escapePdfString(line.text)}) Tj\n`;
      }

      y -= line.fontSize * 1.4 + line.spacingAfter;
    }

    stream += 'ET\n';

    // Content stream object
    const streamObj = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);

    // Page object
    const pageObj = addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Contents ${streamObj} 0 R /Resources << /Font << /F1 ${fontObj} 0 R /F2 ${fontBoldObj} 0 R >> >> >>`
    );
    pageObjNums.push(pageObj);
  }

  // Now rebuild the output with the correct Pages object
  const pagesContent = `<< /Type /Pages /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>`;

  // Rebuild entire PDF
  output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const finalOffsets: number[] = [];

  // Re-serialize all objects with correct offsets
  // Object 1: Catalog
  finalOffsets.push(output.length);
  output += `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;

  // Object 2: Pages
  finalOffsets.push(output.length);
  output += `2 0 obj\n${pagesContent}\nendobj\n`;

  // Object 3: Font
  finalOffsets.push(output.length);
  output += `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;

  // Object 4: Font Bold
  finalOffsets.push(output.length);
  output += `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;

  // Remaining objects (streams and pages)
  for (let i = 4; i < objects.length; i++) {
    finalOffsets.push(output.length);
    // Re-extract content from the object string
    const origObj = objects[i];
    const objContent = origObj.replace(/^\d+ 0 obj\n/, '').replace(/\nendobj\n$/, '');
    output += `${i + 1} 0 obj\n${objContent}\nendobj\n`;
  }

  // Cross-reference table
  const xrefOffset = output.length;
  output += 'xref\n';
  output += `0 ${finalOffsets.length + 1}\n`;
  output += '0000000000 65535 f \n';
  for (const offset of finalOffsets) {
    output += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }

  // Trailer
  output += 'trailer\n';
  output += `<< /Size ${finalOffsets.length + 1} /Root 1 0 R >>\n`;
  output += 'startxref\n';
  output += `${xrefOffset}\n`;
  output += '%%EOF\n';

  return Buffer.from(output, 'binary');
}

// ─── ZIP Builder (for DOCX) ─────────────────────────────────────────────────

function createZipBuffer(files: Array<{ path: string; content: string }>): Buffer {
  const entries: Array<{
    path: string;
    compressed: Buffer;
    uncompressed: Buffer;
    crc32: number;
    offset: number;
  }> = [];

  let offset = 0;
  const localHeaders: Buffer[] = [];

  for (const file of files) {
    const uncompressed = Buffer.from(file.content, 'utf-8');
    const compressed = zlib.deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    const entry = {
      path: file.path,
      compressed,
      uncompressed,
      crc32: crc,
      offset,
    };

    // Local file header
    const pathBuf = Buffer.from(file.path, 'utf-8');
    const localHeader = Buffer.alloc(30 + pathBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // compression: deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14); // crc32
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(uncompressed.length, 22); // uncompressed size
    localHeader.writeUInt16LE(pathBuf.length, 26); // filename length
    localHeader.writeUInt16LE(0, 28); // extra field length
    pathBuf.copy(localHeader, 30);

    localHeaders.push(Buffer.concat([localHeader, compressed]));
    offset += localHeader.length + compressed.length;

    entries.push(entry);
  }

  // Central directory
  const centralEntries: Buffer[] = [];
  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.path, 'utf-8');
    const centralEntry = Buffer.alloc(46 + pathBuf.length);
    centralEntry.writeUInt32LE(0x02014b50, 0); // signature
    centralEntry.writeUInt16LE(20, 4); // version made by
    centralEntry.writeUInt16LE(20, 6); // version needed
    centralEntry.writeUInt16LE(0, 8); // flags
    centralEntry.writeUInt16LE(8, 10); // compression
    centralEntry.writeUInt16LE(0, 12); // mod time
    centralEntry.writeUInt16LE(0, 14); // mod date
    centralEntry.writeUInt32LE(entry.crc32, 16); // crc32
    centralEntry.writeUInt32LE(entry.compressed.length, 20); // compressed size
    centralEntry.writeUInt32LE(entry.uncompressed.length, 24); // uncompressed size
    centralEntry.writeUInt16LE(pathBuf.length, 28); // filename length
    centralEntry.writeUInt16LE(0, 30); // extra field length
    centralEntry.writeUInt16LE(0, 32); // comment length
    centralEntry.writeUInt16LE(0, 34); // disk number start
    centralEntry.writeUInt16LE(0, 36); // internal file attributes
    centralEntry.writeUInt32LE(0, 38); // external file attributes
    centralEntry.writeUInt32LE(entry.offset, 42); // offset of local header
    pathBuf.copy(centralEntry, 46);
    centralEntries.push(centralEntry);
  }

  const centralDir = Buffer.concat(centralEntries);
  const centralDirOffset = offset;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central dir disk
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, centralDir, eocd]);
}

// Simple CRC32 implementation
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
