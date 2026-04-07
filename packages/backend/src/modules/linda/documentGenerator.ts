/**
 * Document Generator — Creates .docx and .pdf files.
 *
 * DOCX: Uses Python's built-in zipfile module (no pip packages needed) to create
 *       valid Office Open XML archives. XML content is generated in TypeScript.
 * PDF:  Generated in pure Node.js (valid PDF 1.4 with Helvetica).
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// ─── Markdown Parsing ────────────────────────────────────────────

interface DocNode {
  type: 'heading' | 'paragraph' | 'bullet' | 'numbered' | 'blockquote' | 'hr';
  level?: number;
  text: string;
  runs: Array<{ text: string; bold?: boolean; italic?: boolean }>;
  index?: number;
}

function parseInline(text: string): Array<{ text: string; bold?: boolean; italic?: boolean }> {
  const runs: Array<{ text: string; bold?: boolean; italic?: boolean }> = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) runs.push({ text: match[2], bold: true, italic: true });
    else if (match[3]) runs.push({ text: match[3], bold: true });
    else if (match[4]) runs.push({ text: match[4], italic: true });
    else if (match[5]) runs.push({ text: match[5] });
  }
  return runs.length > 0 ? runs : [{ text }];
}

function parseMarkdown(content: string): DocNode[] {
  const lines = content.split('\n');
  const nodes: DocNode[] = [];
  let numIdx = 0;

  for (const line of lines) {
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      nodes.push({ type: 'hr', text: '', runs: [] });
      numIdx = 0;
      continue;
    }
    const hm = line.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      nodes.push({ type: 'heading', level: hm[1].length, text: hm[2].trim(), runs: parseInline(hm[2].trim()) });
      numIdx = 0;
      continue;
    }
    const bm = line.match(/^\s*[-*+]\s+(.+)/);
    if (bm) {
      nodes.push({ type: 'bullet', text: bm[1].trim(), runs: parseInline(bm[1].trim()) });
      numIdx = 0;
      continue;
    }
    const nm = line.match(/^\s*(\d+)[.)]\s+(.+)/);
    if (nm) {
      numIdx++;
      nodes.push({ type: 'numbered', text: nm[2].trim(), runs: parseInline(nm[2].trim()), index: numIdx });
      continue;
    }
    const qm = line.match(/^>\s*(.*)/);
    if (qm) {
      nodes.push({ type: 'blockquote', text: qm[1].trim(), runs: parseInline(qm[1].trim()) });
      continue;
    }
    if (!line.trim()) { numIdx = 0; continue; }
    nodes.push({ type: 'paragraph', text: line.trim(), runs: parseInline(line.trim()) });
    numIdx = 0;
  }
  return nodes;
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── DOCX XML Building ──────────────────────────────────────────

function makeRun(run: { text: string; bold?: boolean; italic?: boolean }, sz: number, color: string): string {
  let rPr = `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>`;
  rPr += `<w:sz w:val="${sz * 2}"/><w:szCs w:val="${sz * 2}"/>`;
  if (run.bold) rPr += '<w:b/><w:bCs/>';
  if (run.italic) rPr += '<w:i/><w:iCs/>';
  rPr += `<w:color w:val="${color}"/>`;
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${escXml(run.text)}</w:t></w:r>`;
}

function buildDocXml(title: string, nodes: DocNode[]): string {
  const hClr: Record<number, string> = { 1: '1A568E', 2: '1E6BB8', 3: '2980B9', 4: '3498DB', 5: '5DADE2', 6: '7FB3D8' };
  const hSz: Record<number, number> = { 1: 24, 2: 20, 3: 16, 4: 14, 5: 13, 6: 12 };
  let b = '';

  // Title
  b += '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>';
  b += `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:bCs/><w:sz w:val="56"/><w:szCs w:val="56"/><w:color w:val="1A568E"/></w:rPr><w:t xml:space="preserve">${escXml(title)}</w:t></w:r></w:p>`;
  // Separator
  b += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="1A568E"/></w:pBdr><w:spacing w:after="300"/></w:pPr></w:p>';

  for (const n of nodes) {
    if (n.type === 'heading') {
      const lv = n.level || 1;
      b += `<w:p><w:pPr><w:spacing w:before="${lv <= 2 ? '240' : '160'}" w:after="120"/></w:pPr>`;
      for (const r of n.runs) b += makeRun({ ...r, bold: true }, hSz[lv] || 14, hClr[lv] || '1A568E');
      b += '</w:p>';
    } else if (n.type === 'paragraph') {
      b += '<w:p><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>';
      for (const r of n.runs) b += makeRun(r, 11, '333333');
      b += '</w:p>';
    } else if (n.type === 'bullet') {
      b += '<w:p><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/></w:pPr>';
      b += makeRun({ text: '\u2022  ' }, 11, '1A568E');
      for (const r of n.runs) b += makeRun(r, 11, '333333');
      b += '</w:p>';
    } else if (n.type === 'numbered') {
      b += '<w:p><w:pPr><w:spacing w:after="60" w:line="276" w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/></w:pPr>';
      b += makeRun({ text: `${n.index || 1}.  ` }, 11, '1A568E');
      for (const r of n.runs) b += makeRun(r, 11, '333333');
      b += '</w:p>';
    } else if (n.type === 'blockquote') {
      b += '<w:p><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="1A568E"/></w:pBdr><w:ind w:left="480"/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/><w:shd w:val="clear" w:color="auto" w:fill="F0F4F8"/></w:pPr>';
      for (const r of n.runs) b += makeRun({ ...r, italic: true }, 11, '555555');
      b += '</w:p>';
    } else if (n.type === 'hr') {
      b += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>';
    }
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    ${b}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

// ─── DOCX Generation via Python zipfile (built-in, no pip) ──────

function createDocxZip(files: Record<string, string>, outputPath: string): void {
  // Write all XML files to a temp directory, then use Python's zipfile to package them
  const tmpDir = path.join('/tmp', `linda_docx_${Date.now()}_${Math.round(Math.random() * 1e9)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // Write the file map as JSON for Python to read
  const manifest = path.join(tmpDir, 'manifest.json');
  const fileEntries: Array<{ arcname: string; filepath: string }> = [];

  for (const [arcname, content] of Object.entries(files)) {
    const safeName = arcname.replace(/\//g, '__');
    const filePath = path.join(tmpDir, safeName);
    fs.writeFileSync(filePath, content, 'utf-8');
    fileEntries.push({ arcname, filepath: filePath });
  }

  fs.writeFileSync(manifest, JSON.stringify(fileEntries), 'utf-8');

  // Use Python's built-in zipfile (no pip packages needed)
  const pyScript = `
import json, zipfile, sys
with open(sys.argv[1]) as f:
    entries = json.load(f)
with zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_STORED) as zf:
    for e in entries:
        zf.write(e['filepath'], e['arcname'])
print('OK')
`;

  const pyFile = path.join(tmpDir, 'mkzip.py');
  fs.writeFileSync(pyFile, pyScript);

  try {
    const result = execSync(`python3 "${pyFile}" "${manifest}" "${outputPath}"`, {
      timeout: 15000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (!result.trim().startsWith('OK')) {
      throw new Error(`ZIP creation failed: ${result}`);
    }
  } finally {
    // Clean up temp files
    try {
      for (const entry of fileEntries) {
        try { fs.unlinkSync(entry.filepath); } catch {}
      }
      try { fs.unlinkSync(manifest); } catch {}
      try { fs.unlinkSync(pyFile); } catch {}
      try { fs.rmdirSync(tmpDir); } catch {}
    } catch {}
  }
}

// ─── PDF Generation (pure Node.js) ──────────────────────────────

function buildPdf(title: string, nodes: DocNode[]): Buffer {
  const W = 612, H = 792, M = 72;
  const usable = W - 2 * M;

  interface PLine { text: string; x: number; fontSize: number; bold: boolean; italic: boolean; color: string; isHR?: boolean; _y?: number }
  const allLines: PLine[] = [];

  function addLine(text: string, fontSize: number, bold: boolean, italic: boolean, indent: number, color: string) {
    const charsPerLine = Math.floor((usable - indent) / (fontSize * 0.52));
    const wrapped = wordWrap(text, charsPerLine);
    for (const wl of wrapped) {
      allLines.push({ text: wl, x: M + indent, fontSize, bold, italic, color });
    }
  }

  function wordWrap(text: string, max: number): string[] {
    if (text.length <= max) return [text];
    const words = text.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      if (cur.length + w.length + 1 > max && cur) { lines.push(cur); cur = w; }
      else { cur = cur ? cur + ' ' + w : w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Title
  addLine(title, 22, true, false, 0, '0.102 0.337 0.557');
  allLines.push({ text: '___HR___', x: M, fontSize: 0, bold: false, italic: false, color: '0.102 0.337 0.557', isHR: true });

  for (const n of nodes) {
    const sizes: Record<number, number> = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 11 };
    switch (n.type) {
      case 'heading': addLine(n.text, sizes[n.level || 1] || 14, true, false, 0, '0.102 0.337 0.557'); break;
      case 'paragraph': addLine(n.text, 11, false, false, 0, '0.2 0.2 0.2'); break;
      case 'bullet': addLine(`\u2022  ${n.text}`, 11, false, false, 18, '0.2 0.2 0.2'); break;
      case 'numbered': addLine(`${n.index || 1}.  ${n.text}`, 11, false, false, 18, '0.2 0.2 0.2'); break;
      case 'blockquote': addLine(`"${n.text}"`, 11, false, true, 28, '0.333 0.333 0.333'); break;
      case 'hr': allLines.push({ text: '___HR___', x: M, fontSize: 0, bold: false, italic: false, color: '0.8 0.8 0.8', isHR: true }); break;
    }
    // Spacing
    allLines.push({ text: '', x: 0, fontSize: 6, bold: false, italic: false, color: '0 0 0' });
  }

  // Paginate
  const pages: PLine[][] = [[]];
  let y = H - M;
  for (const ln of allLines) {
    if (ln.isHR) {
      if (y - 12 < M) { pages.push([]); y = H - M; }
      const hrLine = { ...ln, _y: y };
      pages[pages.length - 1].push(hrLine);
      y -= 12;
      continue;
    }
    if (ln.text === '' && ln.fontSize > 0) { y -= ln.fontSize; continue; }
    if (ln.text === '') continue;
    const lh = ln.fontSize * 1.5;
    if (y - lh < M) { pages.push([]); y = H - M; }
    ln._y = y;
    pages[pages.length - 1].push(ln);
    y -= lh;
  }

  // Build PDF
  const objs: string[] = [];
  let objNum = 0;
  function addObj(s: string): number { objNum++; objs.push(`${objNum} 0 obj\n${s}\nendobj\n`); return objNum; }

  addObj('<< /Type /Catalog /Pages 2 0 R >>');
  addObj('PLACEHOLDER');
  const f1 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const f3 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  const f4 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>');

  const pageRefs: number[] = [];
  for (const page of pages) {
    let stream = '';
    for (const ln of page) {
      if (ln.isHR) {
        const hrY = ln._y || (H - M);
        stream += `${ln.color} RG 0.5 w ${M} ${hrY} m ${W - M} ${hrY} l S\n`;
        continue;
      }
      const py = ln._y || (H - M);
      const fn = ln.bold && ln.italic ? 'F4' : ln.bold ? 'F2' : ln.italic ? 'F3' : 'F1';
      const esc = ln.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      stream += `BT /${fn} ${ln.fontSize} Tf ${ln.color} rg ${ln.x} ${py} Td (${esc}) Tj ET\n`;
    }
    const contentObj = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pgObj = addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${contentObj} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R /F4 ${f4} 0 R >> >> >>`);
    pageRefs.push(pgObj);
  }

  // Fix pages placeholder
  const kids = pageRefs.map(n => `${n} 0 R`).join(' ');
  objs[1] = `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`;

  // Build file
  const header = '%PDF-1.4\n%\xB5\xB5\xB5\xB5\n';
  const body = objs.join('');
  const offsets: number[] = [];
  let pos = header.length;
  for (const obj of objs) {
    offsets.push(pos);
    pos += obj.length;
  }

  let xref = `xref\n0 ${objNum + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) xref += `${o.toString().padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objNum + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;

  return Buffer.from(header + body + xref, 'latin1');
}

// ─── Public API ──────────────────────────────────────────────────

export function generateDocx(content: string, title?: string): Buffer {
  const docTitle = title || 'Document';
  const uid = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
  const tmpContent = path.join('/tmp', `linda_content_${uid}.txt`);
  const tmpOutput = path.join('/tmp', `linda_docx_${uid}.docx`);

  // Path to the Python script that uses xml.etree.ElementTree for proper XML generation
  // At runtime __dirname is dist/modules/linda/, so resolve back to src/modules/linda/
  const backendRoot = path.resolve(__dirname, '..', '..', '..');
  const scriptPath = path.join(backendRoot, 'src', 'modules', 'linda', 'generate_docx.py');

  try {
    // Write markdown content to temp file
    fs.writeFileSync(tmpContent, content, 'utf-8');

    // Call the Python script — uses xml.etree for valid OOXML and zipfile for proper ZIP
    const result = execSync(
      `python3 "${scriptPath}" --output "${tmpOutput}" --title "${docTitle.replace(/"/g, '\\"')}" --content-file "${tmpContent}"`,
      { timeout: 30000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );

    if (!result.trim().startsWith('OK')) {
      throw new Error(`DOCX generation failed: ${result}`);
    }

    return fs.readFileSync(tmpOutput);
  } finally {
    try { fs.unlinkSync(tmpContent); } catch {}
    try { fs.unlinkSync(tmpOutput); } catch {}
  }
}

export function generatePdf(content: string, title?: string): Buffer {
  const nodes = parseMarkdown(content);
  return buildPdf(title || 'Document', nodes);
}
