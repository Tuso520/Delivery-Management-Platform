import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type LocaleTree = { [key: string]: string | LocaleTree }

const root = process.cwd()
const localeFiles = {
  'zh-CN': resolve(root, 'src/locales/zh-CN.json'),
  'en-US': resolve(root, 'src/locales/en-US.json'),
} as const

const targetVueSources = [
  'src/layouts/BasicLayout.vue',
  'src/layouts/components/AppHeader.vue',
  'src/layouts/components/AppSidebar.vue',
  'src/views/login/index.vue',
  'src/views/NotFound.vue',
  'src/views/dashboard/index.vue',
  'src/views/dashboard/components/DashboardOverviewBand.vue',
  'src/views/dashboard/components/DashboardSection.vue',
  'src/views/dashboard/components/DashboardTasks.vue',
  'src/views/dashboard/components/HighRiskProjects.vue',
  'src/views/dashboard/components/RecentActivities.vue',
  'src/views/dashboard/components/RecentProjects.vue',
  'src/views/dashboard/components/StatCards.vue',
  'src/views/review/pending.vue',
  'src/views/review/components/ReviewDialog.vue',
  'src/views/project/index.vue',
  'src/views/project/ProjectDrawer.vue',
  'src/views/project/detail.vue',
  'src/views/archive/index.vue',
  'src/views/archive/template.vue',
  'src/views/standard/index.vue',
  'src/views/knowledge/index.vue',
  'src/views/tools/index.vue',
  'src/views/currency/index.vue',
  'src/views/system/notification.vue',
  'src/views/system/approvals.vue',
  'src/views/system/logs.vue',
  'src/views/system/config.vue',
  'src/views/system/integrations.vue',
  'src/components/FilePreviewRouter/index.vue',
  'src/components/AttachmentPreviewModal/index.vue',
] as const

const targetSupportSources = [
  'src/router/index.ts',
  'src/types/project.ts',
  'src/views/review/review-presenter.ts',
  'src/views/system/integration-form.ts',
] as const

function readSource(file: string): string {
  return readFileSync(resolve(root, file), 'utf8')
}

function readLocale(file: string): LocaleTree {
  return JSON.parse(readFileSync(file, 'utf8')) as LocaleTree
}

function flattenKeys(tree: LocaleTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [path] : flattenKeys(value, path)
  })
}

function localeValue(tree: LocaleTree, key: string): string | LocaleTree | undefined {
  let value: string | LocaleTree | undefined = tree
  for (const segment of key.split('.')) {
    if (!value || typeof value === 'string') return undefined
    value = value[segment]
  }
  return value
}

function referencedLocaleKeys(source: string): string[] {
  const prefixes = [
    'app',
    'menu',
    'common',
    'routes',
    'shell',
    'dashboard',
    'review',
    'notifications',
    'systemConfig',
    'logs',
    'approvals',
    'integrations',
    'currency',
    'tools',
    'projects',
    'notFound',
    'login',
    'archive',
    'archiveTemplate',
    'standard',
    'knowledge',
    'filePreview',
    'status',
    'risk',
    'stage',
  ].join('|')
  const patterns = [
    new RegExp(`\\bt\\(\\s*['"]((?:${prefixes})\\.[^'"]+)['"]`, 'gu'),
    new RegExp(
      `\\b(?:title|label|labelKey):\\s*['"]((?:${prefixes})\\.[^'"]+)['"]`,
      'gu',
    ),
  ]
  return patterns.flatMap((pattern) =>
    Array.from(source.matchAll(pattern), (match) => match[1]),
  )
}

describe('fixed UI text internationalization contract', () => {
  const zh = readLocale(localeFiles['zh-CN'])
  const en = readLocale(localeFiles['en-US'])

  it('keeps the zh-CN and en-US locale key sets identical', () => {
    expect(flattenKeys(zh).sort()).toEqual(flattenKeys(en).sort())
  })

  it('defines every statically referenced target key in both locales', () => {
    const keys = new Set(
      [...targetVueSources, ...targetSupportSources].flatMap((file) =>
        referencedLocaleKeys(readSource(file)),
      ),
    )

    for (const key of keys) {
      expect(localeValue(zh, key), `Missing zh-CN key: ${key}`).toEqual(expect.any(String))
      expect(localeValue(en, key), `Missing en-US key: ${key}`).toEqual(expect.any(String))
    }
  })

  it('uses vue-i18n in every visible target component', () => {
    for (const file of targetVueSources) {
      expect(readSource(file), `${file} must use vue-i18n`).toContain('useI18n')
    }
  })

  it('leaves no fixed Chinese UI copy in target templates', () => {
    for (const file of targetVueSources) {
      const source = readSource(file)
      const template = source.includes('<template>')
        ? source.slice(source.indexOf('<template>'))
        : source
      expect(template, `${file} still contains fixed Chinese UI copy`).not.toMatch(
        /\p{Script=Han}/u,
      )
    }
  })
})
