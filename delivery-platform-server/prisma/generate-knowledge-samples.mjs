import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, 'seed-files', 'knowledge-samples');

await mkdir(outputDir, { recursive: true });

await writeFile(
  resolve(outputDir, 'knowledge-preview-doc.doc'),
  `<!doctype html>
<html>
<head><meta charset="utf-8"><title>知识库 DOC 预览样例</title></head>
<body>
  <h1>知识库 DOC 预览样例</h1>
  <p>专业：项目管理</p>
  <p>用途：验证旧版 doc 文件上传后可在线查阅。</p>
  <p>检查点：标题、段落、责任人和交付动作应能在平台预览窗口中显示。</p>
</body>
</html>
`,
  'utf8',
);

await writeFile(
  resolve(outputDir, 'knowledge-preview-slides.ppt'),
  `<!doctype html>
<html>
<head><meta charset="utf-8"><title>知识库 PPT 预览样例</title></head>
<body>
  <h1>知识库 PPT 预览样例</h1>
  <h2>第一页：交付启动</h2>
  <p>确认客户范围、项目团队、里程碑和风险清单。</p>
  <h2>第二页：专业协同</h2>
  <p>电气、软件、运维按阶段沉淀知识条目。</p>
</body>
</html>
`,
  'utf8',
);

await writeFile(
  resolve(outputDir, 'knowledge-preview-table.xlsx'),
  await buildXlsx(),
);

await writeFile(
  resolve(outputDir, 'knowledge-preview-pdf.pdf'),
  buildPdf(),
);

await writeFile(
  resolve(outputDir, 'knowledge-preview-image.png'),
  buildPng(640, 360),
);

console.log(`Knowledge sample files generated in ${outputDir}`);

async function buildXlsx() {
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
  <sheets><sheet name="知识预览" sheetId="1" r:id="rId1"/></sheets>
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
    ['专业', '交付阶段', '查阅重点', '状态'],
    ['项目管理', '启动', '范围、计划、责任人', '已验证'],
    ['电气工程', '设计', '点表、控制柜、电缆清单', '已验证'],
    ['软件工程', '调试', '版本、配置、回归记录', '已验证'],
    ['运维管理', '验收', '巡检、备份、远程连接', '已验证'],
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

function buildPdf() {
  const objects = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const stream = [
    'BT',
    '/F1 22 Tf',
    '72 720 Td',
    '(Knowledge Base PDF Preview Sample) Tj',
    '/F1 12 Tf',
    '0 -36 Td',
    '(Purpose: verify secure online PDF preview in local Docker.) Tj',
    '0 -24 Td',
    '(Scope: project management, engineering, operations and delivery evidence.) Tj',
    'ET',
  ].join('\n');
  objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);

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
      const inHeader = y < 92;
      const stripe = Math.floor(x / 80) % 2 === 0;
      raw[offset] = inHeader ? 22 : stripe ? 232 : 247;
      raw[offset + 1] = inHeader ? 93 : stripe ? 243 : 248;
      raw[offset + 2] = inHeader ? 255 : stripe ? 255 : 250;
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 2, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
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
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}
