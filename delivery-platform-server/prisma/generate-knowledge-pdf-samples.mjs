import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(__dirname, 'seed-data', 'knowledge-catalog.json');
const outputDir = resolve(__dirname, 'seed-files', 'knowledge-catalog');
const tempDir = resolve(__dirname, '../../artifacts/knowledge-pdf-source');

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const chrome = await findChrome();

await mkdir(outputDir, { recursive: true });
await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

let generated = 0;
for (const module of catalog.modules) {
  for (const content of module.contents) {
    for (const file of content.files) {
      if (file.kind !== 'pdf' && extname(file.name).toLowerCase() !== '.pdf') continue;

      generated += 1;
      const htmlPath = resolve(tempDir, `${String(generated).padStart(2, '0')}.html`);
      const pdfPath = resolve(outputDir, file.name);
      await writeFile(htmlPath, buildHtml({ module, content, file }), 'utf8');
      await execFileAsync(chrome, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ]);
      console.log(`Generated ${file.name}`);
    }
  }
}

console.log(`Generated ${generated} knowledge PDF sample files.`);

async function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 5000 });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error('Chrome/Chromium was not found. Set CHROME_PATH to generate PDF samples.');
}

function buildHtml({ module, content, file }) {
  const title = file.name.replace(/\.pdf$/i, '');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(file.name)}</title>
<style>
  @page { size: A4; margin: 18mm 18mm; }
  body {
    font-family: "Microsoft YaHei", "Noto Sans SC", "SimSun", Arial, sans-serif;
    color: #1d2129;
    line-height: 1.72;
  }
  h1 { font-size: 24px; margin: 0 0 18px; color: #1f5fbf; }
  h2 { font-size: 16px; margin: 22px 0 8px; border-bottom: 1px solid #d9e2f2; padding-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; margin-top: 10px; font-size: 12px; }
  th, td { border: 1px solid #c9d6ea; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #eef5ff; }
  .meta { display: grid; grid-template-columns: 90px 1fr; gap: 6px 12px; padding: 14px 16px; background: #f7f9fc; border: 1px solid #d9e2f2; }
  .badge { display: inline-block; margin-top: 8px; padding: 2px 8px; border: 1px solid #91caff; background: #e6f4ff; color: #0958d9; font-size: 12px; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <section class="meta">
    <strong>所属分类</strong><span>${escapeHtml(module.name)}</span>
    <strong>主要内容</strong><span>${escapeHtml(content.title)}</span>
    <strong>更新频率</strong><span>${escapeHtml(content.updateFrequency || '按制度变更维护')}</span>
    <strong>文件状态</strong><span>知识库在线预览样例，支持 PDF 实际内容查看</span>
  </section>
  <h2>文档说明</h2>
  <p>本文件用于交付管理平台知识库的 PDF 在线预览验收。预览时应在平台弹窗中显示完整页面、正文内容和页码，不应出现空白页、乱码或“内容被屏蔽”的错误提示。</p>
  <p>平台人员可按岗位分类查找该文件，点击标题即可打开只读预览，并可查看在线预览热度和下载热度。</p>
  <h2>使用要点</h2>
  <table>
    <thead><tr><th>检查项</th><th>验收要求</th><th>责任角色</th></tr></thead>
    <tbody>
      <tr><td>分类归属</td><td>文件必须挂载在一级分类“${escapeHtml(module.name)}”下，二级内容保留在主要内容说明中。</td><td>知识库管理员</td></tr>
      <tr><td>在线预览</td><td>PDF 页面应以只读方式完整展示，标题不重复，主系统路由不跳转。</td><td>平台使用人员</td></tr>
      <tr><td>版本更新</td><td>替换历史文件时必须进入审批流程，审批人可查看新旧差异。</td><td>审批负责人</td></tr>
      <tr><td>下载记录</td><td>下载次数和预览次数应被记录，用于热度展示。</td><td>系统后台</td></tr>
    </tbody>
  </table>
  <span class="badge">PDF 预览验收文件</span>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
