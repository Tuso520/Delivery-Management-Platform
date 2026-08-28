import JSZip = require('jszip');

export interface PptxOutlineSlide {
  slideNumber: number;
  title: string;
  texts: string[];
}

export interface PptxOutline {
  slides: PptxOutlineSlide[];
}

const maxArchiveBytes = 25 * 1024 * 1024;
const maxSlideBytes = 2 * 1024 * 1024;
const maxExtractedBytes = 20 * 1024 * 1024;
const maxSlides = 200;
const maxTextFragments = 10_000;
const maxTextLength = 1_000;

export class PptxParseError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function parsePptxOutline(source: Buffer): Promise<PptxOutline> {
  if (source.length === 0 || source.length > maxArchiveBytes) {
    throw new PptxParseError(
      source.length > maxArchiveBytes ? 'PPTX_INPUT_TOO_LARGE' : 'PPTX_INVALID_ARCHIVE',
    );
  }

  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(source, { checkCRC32: true, createFolders: false });
  } catch {
    throw new PptxParseError('PPTX_INVALID_ARCHIVE');
  }

  const entries = Object.values(archive.files)
    .map((entry) => ({ entry, match: /^ppt\/slides\/slide(\d+)\.xml$/u.exec(entry.name) }))
    .filter(
      (candidate): candidate is { entry: JSZip.JSZipObject; match: RegExpExecArray } =>
        !candidate.entry.dir && Boolean(candidate.match),
    )
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));

  if (entries.length === 0) throw new PptxParseError('PPTX_SLIDES_MISSING');
  if (entries.length > maxSlides) throw new PptxParseError('PPTX_TOO_MANY_SLIDES');

  let extractedBytes = 0;
  let fragmentCount = 0;
  const slides: PptxOutlineSlide[] = [];
  for (const { entry, match } of entries) {
    assertEntrySize(entry);
    let xml: string;
    try {
      xml = await entry.async('string');
    } catch {
      throw new PptxParseError('PPTX_SLIDE_INVALID');
    }
    const slideBytes = Buffer.byteLength(xml, 'utf8');
    extractedBytes += slideBytes;
    if (slideBytes > maxSlideBytes || extractedBytes > maxExtractedBytes) {
      throw new PptxParseError('PPTX_CONTENT_TOO_LARGE');
    }

    const texts: string[] = [];
    for (const textMatch of xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gu)) {
      fragmentCount += 1;
      if (fragmentCount > maxTextFragments) throw new PptxParseError('PPTX_TOO_MUCH_TEXT');
      const text = normalizeText(decodeXmlText(textMatch[1] ?? ''));
      if (text && texts.at(-1) !== text) texts.push(text.slice(0, maxTextLength));
    }

    const slideNumber = Number(match[1]);
    slides.push({
      slideNumber,
      title: texts[0] ?? `第 ${slideNumber} 页`,
      texts,
    });
  }

  return { slides };
}

function assertEntrySize(entry: JSZip.JSZipObject): void {
  const uncompressedSize = (entry as JSZip.JSZipObject & { _data?: { uncompressedSize?: unknown } })
    ._data?.uncompressedSize;
  if (typeof uncompressedSize === 'number' && uncompressedSize > maxSlideBytes) {
    throw new PptxParseError('PPTX_CONTENT_TOO_LARGE');
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/giu, (entity, key: string) => {
    const normalized = key.toLowerCase();
    const named: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
    };
    if (named[normalized]) return named[normalized];
    const codePoint = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}
