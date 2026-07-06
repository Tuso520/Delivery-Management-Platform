import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(__dirname, 'seed-data', 'knowledge-catalog.json');
const outputDir = resolve(__dirname, 'seed-files', 'knowledge-catalog');

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
await mkdir(outputDir, { recursive: true });

const files = catalog.modules.flatMap((module) =>
  module.contents.flatMap((content) =>
    content.files.map((file) => ({
      ...file,
      moduleName: module.name,
      contentTitle: content.title,
      updateFrequency: content.updateFrequency ?? '',
    })),
  ),
);

for (const file of files) {
  const ext = extname(file.name).replace('.', '').toLowerCase();
  const target = resolve(outputDir, file.name);
  await writeFile(target, await buildFile(file, ext));
}

console.log(`Generated ${files.length} knowledge sample files in ${outputDir}`);

async function buildFile(file, ext) {
  if (ext === 'docx') return buildDocx(file);
  if (ext === 'doc') return buildLegacyOfficeHtml(file, 'Word 文档');
  if (ext === 'xlsx') return buildXlsx(file);
  if (ext === 'pptx') return buildPptx(file);
  if (ext === 'ppt') return buildLegacyOfficeHtml(file, 'PPT 演示');
  if (ext === 'pdf') return buildPdf(file);
  if (['png', 'jpg', 'jpeg'].includes(ext)) return buildPng(960, 540);
  return Buffer.from(buildPlainText(file), 'utf8');
}

async function buildDocx(file) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
  );
  zip.file(
    '_rels/.rels',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
  );
  zip.file(
    'word/document.xml',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${docParagraph(file.name)}
    ${docParagraph(`所属模块：${file.moduleName}`)}
    ${docParagraph(`主要内容：${file.contentTitle}`)}
    ${docParagraph(file.updateFrequency ? `更新频率：${file.updateFrequency}` : '更新频率：按制度变更维护')}
    ${docParagraph('本文件由本地知识库种子脚本生成，用于验证上传、存储、下载和在线预览链路。')}
    ${docParagraph('验收要点：分类匹配正确、附件可查阅、预览弹窗能显示文档正文。')}
  </w:body>
</w:document>`),
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

function buildLegacyOfficeHtml(file, typeName) {
  return Buffer.from(
    `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title></head>
<body>
  <h1>${escapeHtml(file.name)}</h1>
  <p>文件类型：${typeName}</p>
  <p>所属模块：${escapeHtml(file.moduleName)}</p>
  <p>主要内容：${escapeHtml(file.contentTitle)}</p>
  <p>用途：验证旧版 Office 文件在知识库中的上传、存储和在线查阅。</p>
</body>
</html>
`,
    'utf8',
  );
}

async function buildXlsx(file) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
  );
  zip.file(
    '_rels/.rels',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
  );
  zip.file(
    'xl/workbook.xml',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="知识库样例" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
  );

  const rows = [
    ['字段', '内容', '验收标准', '状态'],
    ['文件名', file.name, '附件名称完整展示', '通过'],
    ['所属模块', file.moduleName, '分类链路正确', '通过'],
    ['主要内容', file.contentTitle, '子分类匹配正确', '通过'],
    ['在线预览', '表格内容可在弹窗中查阅', '无需下载即可查看', '通过'],
  ];

  zip.file(
    'xl/worksheets/sheet1.xml',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rows
      .map((row, rowIndex) => `<row r="${rowIndex + 1}">
        ${row
          .map((cell, cellIndex) => `<c r="${columnName(cellIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`)
          .join('')}
      </row>`)
      .join('')}
  </sheetData>
</worksheet>`),
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}

async function buildPptx(file) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`),
  );
  zip.file(
    '_rels/.rels',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`),
  );
  zip.file(
    'ppt/presentation.xml',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>`),
  );
  zip.file(
    'ppt/_rels/presentation.xml.rels',
    xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`),
  );
  zip.file('ppt/slides/slide1.xml', buildSlideXml(file.name, [`模块：${file.moduleName}`, `主要内容：${file.contentTitle}`]));
  zip.file('ppt/slides/slide2.xml', buildSlideXml('知识库预览验收', ['文件已写入本地存储目录', '附件接口可下载原文件', '预览接口可抽取演示文稿文本']));
  return zip.generateAsync({ type: 'nodebuffer' });
}

function buildPdf(file) {
  const safeTitle = file.name.replace(/[^\x20-\x7e]/gu, ' ');
  const safeModule = file.moduleName.replace(/[^\x20-\x7e]/gu, ' ');
  const stream = [
    'BT',
    '/F1 20 Tf',
    '72 720 Td',
    `(${escapePdfText(safeTitle)}) Tj`,
    '/F1 12 Tf',
    '0 -34 Td',
    `(Module: ${escapePdfText(safeModule)}) Tj`,
    '0 -22 Td',
    '(Purpose: verify PDF online preview in the delivery knowledge base.) Tj',
    '0 -22 Td',
    '(Storage: local sample file generated by the seed script.) Tj',
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function buildPng(width, height) {
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 3;
      const header = y < 110;
      const grid = Math.floor(x / 80) % 2 === Math.floor(y / 80) % 2;
      raw[offset] = header ? 22 : grid ? 236 : 249;
      raw[offset + 1] = header ? 93 : grid ? 246 : 248;
      raw[offset + 2] = header ? 255 : grid ? 255 : 250;
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 2, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildPlainText(file) {
  return [
    file.name,
    `所属模块：${file.moduleName}`,
    `主要内容：${file.contentTitle}`,
    '用途：验证知识库附件存储和在线查阅。',
  ].join('\n');
}

function buildSlideXml(title, lines) {
  return xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp><p:txBody><a:p><a:r><a:t>${escapeXml(title)}</a:t></a:r></a:p></p:txBody></p:sp>
      ${lines.map((line) => `<p:sp><p:txBody><a:p><a:r><a:t>${escapeXml(line)}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}
    </p:spTree>
  </p:cSld>
</p:sld>`);
}

function docParagraph(text) {
  return `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function columnName(index) {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function xml(value) {
  return value.trim();
}

function escapeXml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function escapePdfText(value) {
  return String(value).replace(/[()\\]/gu, '\\$&');
}
