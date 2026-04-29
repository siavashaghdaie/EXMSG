/**
 * Linda File Processor — Extracts content from various document formats
 * so Linda can understand and analyze any file users send.
 *
 * Supported formats:
 * - PDF: Sent natively to Claude API as base64 document (full layout understanding)
 * - Images: Sent natively to Claude API as base64 image (vision)
 * - DOCX: Extracted via ZIP/XML parsing (Node.js built-in zlib)
 * - XLSX: Extracted via ZIP/XML parsing (shared strings + sheets)
 * - CSV/TSV: Read as text
 * - Text-based: TXT, MD, JSON, XML, YAML, code files — read as UTF-8
 * - Other: Metadata description only
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProcessedFile {
  /** How to send to Claude API */
  type: 'vision' | 'document' | 'text' | 'metadata-only';
  /** For vision/document: base64-encoded file data */
  base64?: string;
  /** For vision: mime type */
  mediaType?: string;
  /** For text: extracted text content */
  textContent?: string;
  /** Human-readable description of the file */
  fileDescription: string;
  /** Whether the file was successfully processed */
  success: boolean;
}

// ─── Extension & MIME mappings ──────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml',
  '.html', '.htm', '.css', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c',
  '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt',
  '.scala', '.r', '.sql', '.sh', '.bash', '.zsh', '.bat', '.ps1', '.lua',
  '.perl', '.pl', '.ini', '.cfg', '.conf', '.toml', '.env', '.log', '.rtf',
  '.tex', '.latex', '.bib', '.graphql', '.gql', '.proto', '.vue', '.svelte',
  '.astro', '.dockerfile', '.makefile', '.cmake', '.gradle', '.sbt',
]);

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

// ─── Main Processor ─────────────────────────────────────────────────────────

export async function processFile(
  filePath: string,
  fileName: string,
  mimeType: string,
  fileSize: number,
): Promise<ProcessedFile> {
  const ext = path.extname(fileName).toLowerCase();
  const sizeKB = (fileSize / 1024).toFixed(1);
  const fileDesc = `[File: "${fileName}" (${mimeType}, ${sizeKB} KB)]`;

  try {
    // 1. Images → Claude Vision API
    if (IMAGE_MIMES.has(mimeType)) {
      return processImage(filePath, fileName, mimeType, fileDesc);
    }

    // 2. PDF → Claude native document support
    if (mimeType === 'application/pdf' || ext === '.pdf') {
      return processPDF(filePath, fileDesc);
    }

    // 3. DOCX → Extract text from ZIP/XML
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') {
      return processDOCX(filePath, fileDesc);
    }

    // 4. XLSX → Extract data from ZIP/XML
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === '.xlsx') {
      return processXLSX(filePath, fileDesc);
    }

    // 5. PPTX → Extract text from ZIP/XML
    if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || ext === '.pptx') {
      return processPPTX(filePath, fileDesc);
    }

    // 6. DOC (old format) — try reading as text, often has embedded readable text
    if (ext === '.doc') {
      return processLegacyDoc(filePath, fileDesc);
    }

    // 7. Audio files — voice notes, recordings, etc. → Transcribe with Whisper
    if (mimeType.startsWith('audio/') || ['.webm', '.ogg', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.mp4'].includes(ext)) {
      try {
        const { transcribeAudio, isVoiceServiceAvailable } = await import('./voiceService');
        if (isVoiceServiceAvailable()) {
          const transcript = await transcribeAudio(filePath, fileName);
          if (transcript) {
            return {
              type: 'text',
              fileDescription: fileDesc,
              textContent: `${fileDesc}\n\n--- Voice Message Transcript ---\n\n${transcript}\n\n(This was automatically transcribed from the user's voice note. Respond naturally to what they said.)`,
              success: true,
            };
          }
        }
      } catch (err: any) {
        console.warn('[FileProcessor] Voice transcription failed, falling back to metadata:', err?.message);
      }
      // Fallback if transcription not available or failed
      return {
        type: 'metadata-only',
        fileDescription: fileDesc,
        textContent: `${fileDesc}\n\nThis is an audio file (voice message or recording). I cannot directly listen to audio files. If the user's message includes a transcript of the audio, I should respond based on that transcript content.`,
        success: true,
      };
    }

    // 8. Text-based files
    if (isTextFile(mimeType, ext)) {
      return processTextFile(filePath, fileName, fileDesc);
    }

    // 9. Unknown binary — metadata only
    return {
      type: 'metadata-only',
      fileDescription: fileDesc,
      textContent: `${fileDesc}\n\nThis is a binary file format that I cannot directly read. I can see it's a ${mimeType} file named "${fileName}" (${sizeKB} KB).`,
      success: true,
    };
  } catch (err: any) {
    console.error(`[FileProcessor] Error processing ${fileName}:`, err?.message);
    return {
      type: 'metadata-only',
      fileDescription: fileDesc,
      textContent: `${fileDesc}\n\nI received this file but encountered an error reading it: ${err?.message || 'unknown error'}`,
      success: false,
    };
  }
}

// ─── Image Processing ───────────────────────────────────────────────────────

function processImage(filePath: string, fileName: string, mimeType: string, fileDesc: string): ProcessedFile {
  const data = fs.readFileSync(filePath);
  const base64 = data.toString('base64');
  return {
    type: 'vision',
    base64,
    mediaType: mimeType,
    fileDescription: fileDesc,
    success: true,
  };
}

// ─── PDF Processing (native Claude document support) ────────────────────────

function processPDF(filePath: string, fileDesc: string): ProcessedFile {
  const data = fs.readFileSync(filePath);
  // Check file size — Claude supports PDFs up to ~32MB / 100 pages
  const sizeMB = data.length / (1024 * 1024);
  if (sizeMB > 30) {
    return {
      type: 'metadata-only',
      fileDescription: fileDesc,
      textContent: `${fileDesc}\n\nThis PDF is ${sizeMB.toFixed(1)} MB which exceeds the processing limit. Please share a shorter version or extract the relevant pages.`,
      success: false,
    };
  }
  const base64 = data.toString('base64');
  return {
    type: 'document',
    base64,
    mediaType: 'application/pdf',
    fileDescription: fileDesc,
    success: true,
  };
}

// ─── DOCX Processing ───────────────────────────────────────────────────────

function processDOCX(filePath: string, fileDesc: string): ProcessedFile {
  const data = fs.readFileSync(filePath);
  const text = extractTextFromZipXml(data, 'word/document.xml');

  if (!text || text.trim().length === 0) {
    return {
      type: 'metadata-only',
      fileDescription: fileDesc,
      textContent: `${fileDesc}\n\nI could read this Word document but it appears to be empty or contain only images/embedded objects.`,
      success: true,
    };
  }

  const truncated = text.slice(0, 50000);
  const wasTruncated = text.length > 50000;

  return {
    type: 'text',
    textContent: `${fileDesc}\n\n--- Document Content${wasTruncated ? ' (truncated to ~50K chars)' : ''} ---\n\n${truncated}`,
    fileDescription: fileDesc,
    success: true,
  };
}

// ─── XLSX Processing ────────────────────────────────────────────────────────

function processXLSX(filePath: string, fileDesc: string): ProcessedFile {
  const data = fs.readFileSync(filePath);

  // Extract shared strings
  const sharedStringsXml = extractFileFromZip(data, 'xl/sharedStrings.xml');
  const sharedStrings: string[] = [];
  if (sharedStringsXml) {
    const matches = sharedStringsXml.match(/<t[^>]*>([^<]*)<\/t>/g) || [];
    for (const m of matches) {
      const text = m.replace(/<t[^>]*>/, '').replace(/<\/t>/, '');
      sharedStrings.push(decodeXmlEntities(text));
    }
  }

  // Extract sheets (try up to 5 sheets)
  const allSheetsText: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const sheetXml = extractFileFromZip(data, `xl/worksheets/sheet${i}.xml`);
    if (!sheetXml) break;

    const rows = sheetXml.match(/<row[^>]*>[\s\S]*?<\/row>/g) || [];
    const sheetRows: string[] = [];

    for (const row of rows) {
      const cells = row.match(/<c[^>]*>[\s\S]*?<\/c>/g) || [];
      const cellValues: string[] = [];

      for (const cell of cells) {
        const typeMatch = cell.match(/t="([^"]*)"/);
        const valueMatch = cell.match(/<v>([^<]*)<\/v>/);

        if (valueMatch) {
          const val = valueMatch[1];
          if (typeMatch && typeMatch[1] === 's') {
            // Shared string reference
            const idx = parseInt(val, 10);
            cellValues.push(sharedStrings[idx] || val);
          } else {
            cellValues.push(val);
          }
        } else {
          cellValues.push('');
        }
      }

      if (cellValues.some(v => v.trim())) {
        sheetRows.push(cellValues.join('\t'));
      }
    }

    if (sheetRows.length > 0) {
      allSheetsText.push(`--- Sheet ${i} ---\n${sheetRows.join('\n')}`);
    }
  }

  if (allSheetsText.length === 0) {
    return {
      type: 'metadata-only',
      fileDescription: fileDesc,
      textContent: `${fileDesc}\n\nI could open this spreadsheet but it appears to be empty or uses a format I cannot parse.`,
      success: true,
    };
  }

  const fullText = allSheetsText.join('\n\n');
  const truncated = fullText.slice(0, 50000);
  const wasTruncated = fullText.length > 50000;

  return {
    type: 'text',
    textContent: `${fileDesc}\n\n--- Spreadsheet Data${wasTruncated ? ' (truncated)' : ''} ---\n\n${truncated}`,
    fileDescription: fileDesc,
    success: true,
  };
}

// ─── PPTX Processing ───────────────────────────────────────────────────────

function processPPTX(filePath: string, fileDesc: string): ProcessedFile {
  const data = fs.readFileSync(filePath);
  const slideTexts: string[] = [];

  // Extract text from up to 50 slides
  for (let i = 1; i <= 50; i++) {
    const slideXml = extractFileFromZip(data, `ppt/slides/slide${i}.xml`);
    if (!slideXml) break;

    const texts = slideXml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
    const slideContent = texts
      .map(t => decodeXmlEntities(t.replace(/<a:t>/, '').replace(/<\/a:t>/, '')))
      .filter(t => t.trim())
      .join(' ');

    if (slideContent.trim()) {
      slideTexts.push(`--- Slide ${i} ---\n${slideContent}`);
    }
  }

  if (slideTexts.length === 0) {
    return {
      type: 'metadata-only',
      fileDescription: fileDesc,
      textContent: `${fileDesc}\n\nI could open this presentation but it appears to contain only images or non-text content.`,
      success: true,
    };
  }

  const fullText = slideTexts.join('\n\n');
  const truncated = fullText.slice(0, 50000);

  return {
    type: 'text',
    textContent: `${fileDesc}\n\n--- Presentation Content ---\n\n${truncated}`,
    fileDescription: fileDesc,
    success: true,
  };
}

// ─── Legacy DOC Processing ──────────────────────────────────────────────────

function processLegacyDoc(filePath: string, fileDesc: string): ProcessedFile {
  // Old .doc files are OLE2 compound documents. We can try to extract
  // readable ASCII/UTF-8 text segments from the binary.
  const data = fs.readFileSync(filePath);
  const text = extractReadableText(data);

  if (text.length < 50) {
    return {
      type: 'metadata-only',
      fileDescription: fileDesc,
      textContent: `${fileDesc}\n\nThis is an older .doc format. I was unable to extract meaningful text. Try converting it to .docx or PDF.`,
      success: false,
    };
  }

  const truncated = text.slice(0, 30000);
  return {
    type: 'text',
    textContent: `${fileDesc}\n\n--- Extracted Text (legacy .doc, may have formatting artifacts) ---\n\n${truncated}`,
    fileDescription: fileDesc,
    success: true,
  };
}

// ─── Text File Processing ───────────────────────────────────────────────────

function processTextFile(filePath: string, fileName: string, fileDesc: string): ProcessedFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  const truncated = content.slice(0, 50000);
  const wasTruncated = content.length > 50000;
  const ext = path.extname(fileName).toLowerCase();

  // Determine language hint for code files
  let prefix = 'File contents';
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.go', '.rs', '.rb', '.php', '.swift', '.kt'].includes(ext)) {
    prefix = `Source code (${ext.slice(1)})`;
  } else if (ext === '.csv' || ext === '.tsv') {
    prefix = 'Tabular data';
  } else if (ext === '.json') {
    prefix = 'JSON data';
  } else if (ext === '.xml' || ext === '.html' || ext === '.htm') {
    prefix = 'Markup content';
  }

  return {
    type: 'text',
    textContent: `${fileDesc}\n\n--- ${prefix}${wasTruncated ? ' (truncated to ~50K chars)' : ''} ---\n\n${truncated}`,
    fileDescription: fileDesc,
    success: true,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isTextFile(mimeType: string, ext: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  if (['application/json', 'application/xml', 'application/javascript',
       'application/typescript', 'application/x-yaml', 'application/sql',
       'application/graphql', 'application/x-sh'].includes(mimeType)) return true;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Check for source code mimes
  if (mimeType.includes('+xml') || mimeType.includes('+json')) return true;
  return false;
}

/**
 * Extract a file from a ZIP archive (DOCX, XLSX, PPTX are all ZIP-based)
 * Uses a minimal ZIP parser — no external dependencies needed.
 */
function extractFileFromZip(zipBuffer: Buffer, targetPath: string): string | null {
  try {
    // ZIP files have a central directory at the end. We'll scan for local file headers.
    const LOCAL_HEADER_SIG = 0x04034b50;
    let offset = 0;

    while (offset < zipBuffer.length - 30) {
      const sig = zipBuffer.readUInt32LE(offset);
      if (sig !== LOCAL_HEADER_SIG) {
        offset++;
        continue;
      }

      const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
      const compressedSize = zipBuffer.readUInt32LE(offset + 18);
      const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
      const fileNameLen = zipBuffer.readUInt16LE(offset + 26);
      const extraLen = zipBuffer.readUInt16LE(offset + 28);
      const fileName = zipBuffer.toString('utf-8', offset + 30, offset + 30 + fileNameLen);
      const dataStart = offset + 30 + fileNameLen + extraLen;

      if (fileName === targetPath) {
        let fileData: Buffer;

        if (compressionMethod === 0) {
          // Stored (no compression)
          fileData = zipBuffer.subarray(dataStart, dataStart + uncompressedSize);
        } else if (compressionMethod === 8) {
          // Deflate
          const compressed = zipBuffer.subarray(dataStart, dataStart + compressedSize);
          fileData = zlib.inflateRawSync(compressed);
        } else {
          return null; // Unsupported compression
        }

        return fileData.toString('utf-8');
      }

      // Move to next file
      offset = dataStart + compressedSize;
    }

    return null;
  } catch (err: any) {
    console.warn(`[FileProcessor] Failed to extract ${targetPath} from ZIP:`, err?.message);
    return null;
  }
}

function extractTextFromZipXml(zipBuffer: Buffer, xmlPath: string): string {
  const xml = extractFileFromZip(zipBuffer, xmlPath);
  if (!xml) return '';

  // Extract all text content from XML, handling paragraph breaks
  const paragraphs: string[] = [];
  const paraMatches = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];

  for (const para of paraMatches) {
    const textParts = para.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
    const paraText = textParts
      .map(t => decodeXmlEntities(t.replace(/<w:t[^>]*>/, '').replace(/<\/w:t>/, '')))
      .join('');
    paragraphs.push(paraText);
  }

  return paragraphs.join('\n');
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}

/**
 * Extract readable ASCII text from binary files (for legacy .doc etc.)
 * Looks for runs of printable characters.
 */
function extractReadableText(buffer: Buffer): string {
  const chunks: string[] = [];
  let current = '';

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    // Printable ASCII or common whitespace
    if ((byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length > 20) {
        // Only keep chunks with meaningful length
        chunks.push(current.trim());
      }
      current = '';
    }
  }

  if (current.length > 20) {
    chunks.push(current.trim());
  }

  return chunks.join('\n');
}

/**
 * Build Claude API message content for a processed file.
 * Returns the appropriate content block(s) for the Anthropic API.
 */
export function buildClaudeContentForFile(
  processed: ProcessedFile,
  userMessage: string,
): any {
  const defaultMsg = userMessage || 'Please analyze this file and help me with it.';

  switch (processed.type) {
    case 'vision':
      return [
        { type: 'image', source: { type: 'base64', media_type: processed.mediaType!, data: processed.base64! } },
        { type: 'text', text: `${processed.fileDescription}\n\n${defaultMsg}` },
      ];

    case 'document':
      return [
        { type: 'document', source: { type: 'base64', media_type: processed.mediaType!, data: processed.base64! } },
        { type: 'text', text: `${processed.fileDescription}\n\n${defaultMsg}` },
      ];

    case 'text':
      return `${processed.textContent}\n\nUser's message: ${defaultMsg}`;

    case 'metadata-only':
      return `${processed.textContent}\n\nUser's message: ${defaultMsg}`;

    default:
      return `${processed.fileDescription}\n\nUser's message: ${defaultMsg}`;
  }
}

/**
 * Check if the processed file needs multimodal API content (array of blocks)
 * vs. simple text content (string).
 */
export function isMultimodalContent(processed: ProcessedFile): boolean {
  return processed.type === 'vision' || processed.type === 'document';
}
