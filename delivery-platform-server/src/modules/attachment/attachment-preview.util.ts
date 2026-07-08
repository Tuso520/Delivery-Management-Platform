import JSZip = require('jszip');
import { XMLParser } from 'fast-xml-parser';

export type AttachmentPreviewKind =
  | 'image'
  | 'pdf'
  | 'html'
  | 'text'
  | 'unsupported';

export interface AttachmentPreviewResult {
  fileName: string;
  fileExt: string;
  mimeType: string;
  previewKind: AttachmentPreviewKind;
  viewer: 'image' | 'pdf' | 'document' | 'spreadsheet' | 'presentation' | 'text' | 'download';
  title: string;
  html?: string;
  text?: string;
  reason?: string;
}

interface PreviewInput {
  fileName: string;
  fileExt: string;
  mimeType: string;
  buffer?: Buffer;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: false,
});

const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const pdfExtensions = new Set(['pdf']);
const textExtensions = new Set(['md', 'txt', 'csv', 'log']);
const serverPreviewExtensions = new Set([
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  ...textExtensions,
]);

export function canPreviewWithoutServer(fileExt: string, mimeType: string): boolean {
  const ext = normalizeExt(fileExt);
  return (
    imageExtensions.has(ext) ||
    pdfExtensions.has(ext) ||
    mimeType.startsWith('image/') ||
    mimeType === 'application/pdf'
  );
}

export function needsServerPreview(fileExt: string): boolean {
  return serverPreviewExtensions.has(normalizeExt(fileExt));
}

export async function buildAttachmentPreview(
  input: PreviewInput,
): Promise<AttachmentPreviewResult> {
  const fileExt = normalizeExt(input.fileExt || extFromName(input.fileName));
  const base = {
    fileName: input.fileName,
    fileExt,
    mimeType: input.mimeType,
    title: input.fileName,
  };

  if (imageExtensions.has(fileExt) || input.mimeType.startsWith('image/')) {
    const mimeType = input.mimeType || `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
    return {
      ...base,
      mimeType,
      previewKind: 'image',
      viewer: 'image',
      html: input.buffer
        ? `<img class="preview-image" src="data:${escapeHtml(mimeType)};base64,${input.buffer.toString('base64')}" alt="${escapeHtml(input.fileName)}" />`
        : undefined,
    };
  }
  if (pdfExtensions.has(fileExt) || input.mimeType === 'application/pdf') {
    return {
      ...base,
      previewKind: 'pdf',
      viewer: 'pdf',
      html: input.buffer ? renderPdfFallback(input.buffer, input.fileName) : undefined,
    };
  }

  if (!input.buffer) {
    return unsupported(base, '该文件类型需要服务端解析后才能预览。');
  }

  if (fileExt === 'docx') {
    return {
      ...base,
      previewKind: 'html',
      viewer: 'document',
      html: await renderDocx(input.buffer, input.fileName),
    };
  }
  if (fileExt === 'xlsx') {
    return {
      ...base,
      previewKind: 'html',
      viewer: 'spreadsheet',
      html: await renderXlsx(input.buffer, input.fileName),
    };
  }
  if (fileExt === 'pptx') {
    return {
      ...base,
      previewKind: 'html',
      viewer: 'presentation',
      html: await renderPptx(input.buffer, input.fileName),
    };
  }
  if (fileExt === 'doc' || fileExt === 'xls' || fileExt === 'ppt') {
    return renderLegacyOffice(input.buffer, base, fileExt);
  }
  if (textExtensions.has(fileExt)) {
    return {
      ...base,
      previewKind: 'text',
      viewer: 'text',
      text: decodeText(input.buffer),
    };
  }

  return unsupported(base, '暂不支持该文件格式在线预览，请下载查看。');
}

function unsupported(
  base: Pick<AttachmentPreviewResult, 'fileName' | 'fileExt' | 'mimeType' | 'title'>,
  reason: string,
): AttachmentPreviewResult {
  return {
    ...base,
    previewKind: 'unsupported',
    viewer: 'download',
    reason,
  };
}

async function renderDocx(buffer: Buffer, fileName: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await readZipText(zip, 'word/document.xml');
  if (!documentXml) {
    return renderMessage(fileName, '未找到 Word 正文内容。');
  }

  const parsed = xmlParser.parse(documentXml) as unknown;
  const body = getPath(parsed, ['document', 'body']);
  const paragraphs = asArray(getProperty(body, 'p'))
    .map((paragraph) => collectTagText(paragraph, 't').join(''))
    .map((text) => text.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return renderMessage(fileName, '文档没有可提取的文本内容。');
  }

  const bodyParagraphs = isLikelyDuplicateFileTitle(paragraphs[0], fileName)
    ? paragraphs.slice(1)
    : paragraphs;
  const documentBodyHtml = bodyParagraphs
    .map((paragraph, index) =>
      index === 0
        ? `<h1>${escapeHtml(paragraph)}</h1>`
        : `<p>${escapeHtml(paragraph)}</p>`,
    )
    .join('\n');

  return wrapPreviewHtml(
    fileName,
    `
      <section class="word-page">
        <div class="word-page-meta">Word 只读预览</div>
        <article class="word-body">
          ${documentBodyHtml || renderMessageBody('文档没有可提取的正文内容。')}
        </article>
      </section>
    `,
    'office-word',
  );
}

async function renderPptx(buffer: Buffer, fileName: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name))
    .sort((left, right) => extractNumber(left) - extractNumber(right));

  if (!slideNames.length) {
    return renderMessage(fileName, '未找到演示文稿幻灯片。');
  }

  const slides: string[] = [];
  for (const slideName of slideNames.slice(0, 30)) {
    const slideXml = await readZipText(zip, slideName);
    if (!slideXml) continue;
    const parsed = xmlParser.parse(slideXml) as unknown;
    const lines = collectTagText(parsed, 't')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    const title = lines[0];
    const body = lines.slice(1);
    slides.push(`
      <section class="preview-slide">
        <h3>${escapeHtml(title)}</h3>
        ${body.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')}
      </section>
    `);
  }

  return wrapPreviewHtml(
    fileName,
    slides.length ? slides.join('\n') : renderMessageBody('演示文稿没有可提取的文本内容。'),
    'office-presentation',
  );
}

async function renderXlsx(buffer: Buffer, fileName: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings = await readSharedStrings(zip);
  const workbookSheetNames = await readWorkbookSheetNames(zip);
  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(name))
    .sort((left, right) => extractNumber(left) - extractNumber(right));

  if (!sheetNames.length) {
    return renderMessage(fileName, '未找到工作表内容。');
  }

  const tables: string[] = [];
  for (const [index, sheetName] of sheetNames.slice(0, 8).entries()) {
    const sheetXml = await readZipText(zip, sheetName);
    if (!sheetXml) continue;
    const parsed = xmlParser.parse(sheetXml) as unknown;
    const sheetData = getPath(parsed, ['worksheet', 'sheetData']);
    const rows = asArray(getProperty(sheetData, 'row'))
      .slice(0, 120)
      .map((row) => readXlsxRow(row, sharedStrings));

    const rowGroups = splitXlsxTableGroups(rows);
    if (!rowGroups.length) continue;
    const sheetTitle = workbookSheetNames[index] || `工作表 ${index + 1}`;
    const sheetHeading = isLikelyDuplicateFileTitle(sheetTitle, fileName)
      ? ''
      : `<h3>${escapeHtml(sheetTitle)}</h3>`;

    tables.push(`
      <section class="preview-sheet">
        ${sheetHeading}
        ${rowGroups.map((visibleRows, groupIndex) => {
          const columnCount = Math.min(
            Math.max(...visibleRows.map((row) => row.length), 1),
            32,
          );
          return `
            <div class="preview-table-block">
              ${rowGroups.length > 1 ? `<div class="preview-table-caption">表 ${groupIndex + 1}</div>` : ''}
              <div class="preview-table-wrap">
                <table>
                  <tbody>
                    ${visibleRows
                      .map((row) => `
                        <tr>
                          ${Array.from({ length: columnCount }, (_, cellIndex) =>
                            `<td>${escapeHtml(row[cellIndex] ?? '')}</td>`,
                          ).join('')}
                        </tr>
                      `)
                      .join('\n')}
                  </tbody>
                </table>
              </div>
            </div>
          `;
        }).join('\n')}
      </section>
    `);
  }

  return wrapPreviewHtml(
    fileName,
    tables.length
      ? `<div class="excel-workbook">${tables.join('\n')}</div>`
      : renderMessageBody('工作簿没有可提取的单元格内容。'),
    'office-excel',
  );
}

function renderLegacyOffice(
  buffer: Buffer,
  base: Pick<AttachmentPreviewResult, 'fileName' | 'fileExt' | 'mimeType' | 'title'>,
  fileExt: string,
): AttachmentPreviewResult {
  const text = decodeText(buffer);
  const readableText = htmlToPlainText(text) || rtfToPlainText(text) || text.trim();
  if (!readableText || containsBinaryControlChars(readableText)) {
    return unsupported(
      base,
      '该旧版 Office 二进制文件需要转换为 docx/xlsx/pptx 后才能在线预览。',
    );
  }

  const viewer =
    fileExt === 'ppt'
      ? 'presentation'
      : fileExt === 'xls'
        ? 'spreadsheet'
        : 'document';

  return {
    ...base,
    previewKind: 'html',
    viewer,
    html: wrapPreviewHtml(
      base.fileName,
      `
        <section class="word-page">
          <div class="word-page-meta">Office 只读预览</div>
          <article class="word-body">
            ${readableText
              .split(/\r?\n/u)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join('\n')}
          </article>
        </section>
      `,
      viewer === 'spreadsheet' ? 'office-excel' : 'office-word',
    ),
  };
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const sharedStringsXml = await readZipText(zip, 'xl/sharedStrings.xml');
  if (!sharedStringsXml) return [];

  const parsed = xmlParser.parse(sharedStringsXml) as unknown;
  const entries = asArray(getPath(parsed, ['sst', 'si']));
  return entries.map((entry) => collectTagText(entry, 't').join(''));
}

async function readWorkbookSheetNames(zip: JSZip): Promise<string[]> {
  const workbookXml = await readZipText(zip, 'xl/workbook.xml');
  if (!workbookXml) return [];

  const parsed = xmlParser.parse(workbookXml) as unknown;
  return asArray(getPath(parsed, ['workbook', 'sheets', 'sheet']))
    .map((sheet) => stringifyValue(getProperty(sheet, '@_name')).trim())
    .filter(Boolean);
}

function readXlsxRow(row: unknown, sharedStrings: string[]): string[] {
  const cells = asArray(getProperty(row, 'c'));
  const values: string[] = [];

  for (const cell of cells) {
    const reference = String(getProperty(cell, '@_r') ?? '');
    const columnIndex = reference ? columnNameToIndex(reference) : values.length;
    values[columnIndex] = readXlsxCellValue(cell, sharedStrings);
  }

  return values;
}

function readXlsxCellValue(cell: unknown, sharedStrings: string[]): string {
  const type = String(getProperty(cell, '@_t') ?? '');
  const rawValue = stringifyValue(getProperty(cell, 'v'));

  if (type === 's') {
    return sharedStrings[Number(rawValue)] ?? '';
  }
  if (type === 'inlineStr') {
    return collectTagText(cell, 't').join('');
  }
  if (type === 'str') {
    return rawValue;
  }
  return rawValue;
}

function splitXlsxTableGroups(rows: string[][]): string[][][] {
  const groups: string[][][] = [];
  let current: string[][] = [];

  for (const row of rows) {
    const hasValue = row.some((cell) => cell.trim());
    if (!hasValue) {
      if (current.length) {
        groups.push(current);
        current = [];
      }
      continue;
    }
    current.push(row);
  }

  if (current.length) {
    groups.push(current);
  }

  return groups;
}

function columnNameToIndex(reference: string): number {
  const letters = reference.replace(/[^A-Z]/giu, '').toUpperCase();
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return Math.max(index - 1, 0);
}

async function readZipText(zip: JSZip, path: string): Promise<string | undefined> {
  const file = zip.file(path);
  return file ? file.async('text') : undefined;
}

function getPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => getProperty(current, key), value);
}

function getProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function collectTagText(value: unknown, tagName: string): string[] {
  const result: string[] = [];

  function visit(node: unknown, keyName?: string): void {
    if (node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      if (keyName === tagName) result.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, keyName));
      return;
    }
    if (isRecord(node)) {
      for (const [childKey, childValue] of Object.entries(node)) {
        visit(childValue, childKey);
      }
    }
  }

  visit(value);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return collectTagText(value, 't').join('');
}

function decodeText(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/\u0000/g, '').trim();
}

function htmlToPlainText(value: string): string {
  if (!/<html|<body|<p|<table|<div/iu.test(value)) return '';
  return value
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<style[\s\S]*?<\/style>/giu, '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/giu, '\n')
    .replace(/<[^>]+>/gu, '')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .trim();
}

function rtfToPlainText(value: string): string {
  if (!value.startsWith('{\\rtf')) return '';
  return value
    .replace(/\\par[d]?/gu, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/gu, '')
    .replace(/\\[a-zA-Z]+\d* ?/gu, '')
    .replace(/[{}]/gu, '')
    .trim();
}

function containsBinaryControlChars(value: string): boolean {
  const controlChars = value.match(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/gu);
  return (controlChars?.length ?? 0) > 8;
}

function renderPdfFallback(buffer: Buffer, fileName: string): string {
  const text = extractSimplePdfText(buffer);
  const body = text.length
    ? text.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')
    : renderMessageBody('当前文件未能提取到可读文本层，请下载后查看原文件。');

  return wrapPreviewHtml(
    fileName,
    `
      <section class="pdf-page-fallback">
        <div class="pdf-page-label">PDF 只读文本预览</div>
        ${body}
      </section>
    `,
    'office-pdf',
  );
}

function extractSimplePdfText(buffer: Buffer): string[] {
  const source = buffer.toString('latin1');
  const texts: string[] = [];
  const textOperator = /\((?:\\.|[^\\()])*\)\s*Tj/gu;
  let match: RegExpExecArray | null;
  while ((match = textOperator.exec(source))) {
    const raw = match[0].replace(/\)\s*Tj$/u, '').slice(1);
    const decoded = decodePdfLiteral(raw).trim();
    if (decoded) texts.push(decoded);
  }

  const textArrayOperator = /\[(?<content>[\s\S]*?)\]\s*TJ/gu;
  while ((match = textArrayOperator.exec(source))) {
    const content = match.groups?.content ?? '';
    const segments = content.match(/\((?:\\.|[^\\()])*\)|<[\dA-Fa-f\s]+>/gu) ?? [];
    const decoded = segments
      .map((segment) =>
        segment.startsWith('<')
          ? decodePdfHexString(segment)
          : decodePdfLiteral(segment.slice(1, -1)),
      )
      .join('')
      .trim();
    if (decoded) texts.push(decoded);
  }

  const hexTextOperator = /<(?<content>[\dA-Fa-f\s]+)>\s*Tj/gu;
  while ((match = hexTextOperator.exec(source))) {
    const decoded = decodePdfHexString(`<${match.groups?.content ?? ''}>`).trim();
    if (decoded) texts.push(decoded);
  }

  return texts
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

function decodePdfLiteral(value: string): string {
  return value
    .replace(/\\n/gu, '\n')
    .replace(/\\r/gu, '\r')
    .replace(/\\t/gu, '\t')
    .replace(/\\\(/gu, '(')
    .replace(/\\\)/gu, ')')
    .replace(/\\\\/gu, '\\');
}

function decodePdfHexString(value: string): string {
  const hex = value.replace(/[<>\s]/gu, '');
  if (!hex) return '';
  const normalized = hex.length % 2 === 0 ? hex : `${hex}0`;
  const buffer = Buffer.from(normalized, 'hex');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const chars: string[] = [];
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      chars.push(String.fromCharCode(buffer.readUInt16BE(index)));
    }
    return chars.join('');
  }
  return buffer.toString('latin1');
}

function isLikelyDuplicateFileTitle(paragraph: string | undefined, fileName: string): boolean {
  if (!paragraph) return false;
  const normalize = (value: string) =>
    value
      .replace(/\.[^.]+$/u, '')
      .replace(/[\s\-＿_—–·•《》“”"']/gu, '')
      .toLowerCase();
  return normalize(paragraph) === normalize(fileName);
}

function wrapPreviewHtml(title: string, body: string, className = ''): string {
  return `
    <article class="attachment-preview ${escapeHtml(className)}" aria-label="${escapeHtml(title)}">
      ${body}
    </article>
  `;
}

function renderMessage(fileName: string, message: string): string {
  return wrapPreviewHtml(fileName, renderMessageBody(message));
}

function renderMessageBody(message: string): string {
  return `<p>${escapeHtml(message)}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function normalizeExt(value: string): string {
  return value.replace(/^\./u, '').toLowerCase();
}

function extFromName(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index + 1) : '';
}

function extractNumber(value: string): number {
  return Number(value.match(/\d+/u)?.[0] ?? 0);
}
