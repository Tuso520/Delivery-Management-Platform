import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const serverRoot = resolve(projectRoot, 'delivery-platform-server')
const runtimeRoot = resolve(serverRoot, 'src')
const schemaPath = resolve(serverRoot, 'prisma/schema.prisma')

const historicalModels = [
  'ArchiveTemplateItem',
  'ProjectArchiveItem',
  'FileReview',
  'MigrationException',
  'ChecklistTemplateItem',
  'ProjectChecklistItem',
  'WorkflowCategory',
  'WorkflowDocument',
  'DocumentTemplateVersion',
  'KnowledgeArticle',
  'KnowledgeArticleVersion',
  'DashboardWidget',
  'ExternalContactCandidate',
  'ApiKey',
  'DailyReport',
  'OkrObjective',
  'KeyResult',
  'PerformanceScore',
  'ApprovalTask',
  'ApprovalAction',
  'SkillDefinition',
  'SkillAssessment',
  'TrainingPlan',
  'TrainingParticipant',
  'ProjectRetrospective',
  'RetrospectiveAction',
  'BackupRecord',
]

function collectRuntimeFiles(directory) {
  const result = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectRuntimeFiles(absolute))
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.test.ts')
    ) {
      result.push(absolute)
    }
  }
  return result
}

const schema = readFileSync(schemaPath, 'utf8')
const schemaModels = new Set(
  [...schema.matchAll(/^model\s+(\w+)\s+\{/gm)].map((match) => match[1]),
)
const failures = []

if (historicalModels.length !== 27 || new Set(historicalModels).size !== 27) {
  failures.push('Historical Prisma model allowlist must contain exactly 27 unique models.')
}

for (const model of historicalModels) {
  if (!schemaModels.has(model)) {
    failures.push(`Historical Prisma model is missing from schema: ${model}`)
  }
}

for (const file of collectRuntimeFiles(runtimeRoot)) {
  const source = readFileSync(file, 'utf8')
  for (const model of historicalModels) {
    const delegate = `${model.charAt(0).toLowerCase()}${model.slice(1)}`
    if (new RegExp(`\\.${delegate}\\b`, 'u').test(source)) {
      failures.push(
        `Production runtime references historical Prisma delegate ${delegate}: ${relative(
          projectRoot,
          file,
        ).replaceAll('\\', '/')}`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error('Prisma runtime boundary check failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log(
    `Prisma runtime boundary check passed: ${historicalModels.length} historical models remain outside production runtime.`,
  )
}
