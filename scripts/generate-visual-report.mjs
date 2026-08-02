import { access, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function parseArguments(values) {
  const result = {}
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/u, '')
    const value = values[index + 1]
    if (!key || !value) throw new Error('arguments must use --name value pairs')
    result[key] = value
  }
  return result
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function assertInsideProject(filePath) {
  const normalizedRoot = `${projectRoot.replaceAll('\\', '/').replace(/\/$/u, '')}/`
  const normalizedPath = resolve(filePath).replaceAll('\\', '/')
  if (!normalizedPath.startsWith(normalizedRoot)) {
    throw new Error(`visual report path escapes PROJECT_ROOT: ${filePath}`)
  }
  return resolve(filePath)
}

async function copyVisual(source, destinationDirectory, caseId, kind) {
  const sourcePath = assertInsideProject(resolve(projectRoot, source))
  if (!(await exists(sourcePath))) return null
  const targetName = `${caseId}-${kind}${extname(sourcePath).toLowerCase()}`
  const targetPath = resolve(destinationDirectory, targetName)
  await copyFile(sourcePath, targetPath)
  return { name: targetName, bytes: (await stat(sourcePath)).size }
}

async function main() {
  const args = parseArguments(process.argv.slice(2))
  const manifestPath = assertInsideProject(
    resolve(projectRoot, args.manifest ?? 'delivery-platform-web/tests/visual-comparison.json'),
  )
  const outputDirectory = assertInsideProject(
    resolve(projectRoot, args.output ?? '.ai-work/visual-report'),
  )
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases)) {
    throw new Error('unsupported visual comparison manifest')
  }
  await mkdir(outputDirectory, { recursive: true })
  const assetsDirectory = resolve(outputDirectory, 'assets')
  await mkdir(assetsDirectory, { recursive: true })

  const cases = []
  for (const visualCase of manifest.cases) {
    if (!/^[a-z0-9-]+$/u.test(visualCase.id ?? '')) throw new Error('invalid visual case id')
    cases.push({
      ...visualCase,
      referenceAsset: await copyVisual(
        visualCase.reference,
        assetsDirectory,
        visualCase.id,
        'reference',
      ),
      actualAsset: await copyVisual(
        visualCase.actual,
        assetsDirectory,
        visualCase.id,
        'actual',
      ),
    })
  }

  const cards = cases
    .map((visualCase) => {
      const reference = visualCase.referenceAsset
      const actual = visualCase.actualAsset
      const status = reference && actual ? '可比较' : actual ? '缺少设计基准' : '缺少本次截图'
      const comparison =
        reference && actual
          ? `<div class="comparison">
              <figure><figcaption>设计参考</figcaption><img src="assets/${escapeHtml(reference.name)}" alt="${escapeHtml(visualCase.title)}设计参考"></figure>
              <figure><figcaption>本次实现</figcaption><img src="assets/${escapeHtml(actual.name)}" alt="${escapeHtml(visualCase.title)}本次实现"></figure>
              <figure class="difference"><figcaption>差异叠加（亮色区域表示视觉差异）</figcaption><div><img src="assets/${escapeHtml(reference.name)}" alt=""><img src="assets/${escapeHtml(actual.name)}" alt=""></div></figure>
            </div>`
          : `<div class="missing">${escapeHtml(status)}。参考路径：${escapeHtml(visualCase.reference)}；截图路径：${escapeHtml(visualCase.actual)}</div>`
      return `<article><header><h2>${escapeHtml(visualCase.title)}</h2><span class="status">${status}</span></header>${comparison}</article>`
    })
    .join('\n')

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>交付管理平台视觉对比报告</title>
<style>
:root{color-scheme:light;font-family:Inter,"Microsoft YaHei",sans-serif;background:#f4f6f8;color:#17233d}body{margin:0;padding:28px}main{max-width:1680px;margin:auto}h1{margin:0 0 8px;font-size:28px}.meta{color:#667085;margin-bottom:24px}article{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin:0 0 22px;box-shadow:0 4px 18px #1018280d}article header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}h2{margin:0;font-size:20px}.status{background:#eef4ff;color:#3538cd;padding:5px 10px;border-radius:999px;font-size:13px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:14px}.comparison figure{margin:0;min-width:0}.comparison figcaption{font-size:13px;color:#475467;margin-bottom:7px}.comparison img{display:block;width:100%;height:auto;border:1px solid #d0d5dd;border-radius:8px}.difference{grid-column:1/-1}.difference div{position:relative}.difference div img+img{position:absolute;inset:0;mix-blend-mode:difference;opacity:.72}.missing{padding:28px;border:1px dashed #f79009;background:#fffaeb;border-radius:8px;color:#93370d}@media(max-width:900px){body{padding:14px}.comparison{grid-template-columns:1fr}.difference{grid-column:auto}}
</style></head><body><main><h1>设计 / 实现 / 差异对比</h1><p class="meta">生成时间：${escapeHtml(new Date().toISOString())}。报告只复制本机忽略目录中的图片，不把截图产物提交到 Git。</p>${cards}</main></body></html>`
  const outputPath = resolve(outputDirectory, 'index.html')
  await writeFile(outputPath, html, 'utf8')
  process.stdout.write(`${outputPath}\n`)
}

main().catch((error) => {
  process.stderr.write(`[visual-report] ${error.message}\n`)
  process.exitCode = 1
})
