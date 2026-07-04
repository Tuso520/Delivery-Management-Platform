import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routerSource = readFileSync(
  resolve(process.cwd(), 'src/router/index.ts'),
  'utf8',
)

describe('application navigation', () => {
  it('uses the consolidated information architecture', () => {
    const groups = ['工作台', '项目管理', '标准与知识', '绩效与团队', '组织与权限', '系统设置']
    groups.forEach((group) => expect(routerSource).toContain(`title: '${group}'`))
    expect(groups.map((group) => routerSource.indexOf(`title: '${group}'`))).toEqual(
      [...groups.map((group) => routerSource.indexOf(`title: '${group}'`))].sort(
        (a, b) => a - b,
      ),
    )
  })

  it('removes duplicate knowledge and credential entries', () => {
    expect(routerSource).not.toContain("title: '人员证件'")
    expect(routerSource).not.toContain("title: '专业技术'")
    expect(routerSource).not.toContain("title: '制度文化'")
    expect(routerSource).not.toContain("title: '项目过程记录'")
    expect(routerSource).toContain("{ path: 'process-records', redirect: '/archive' }")
    expect(routerSource).toContain("title: '培训记录'")
    expect(routerSource).toContain("title: '币种与汇率'")
    expect(routerSource).toContain("title: '语言与翻译'")
  })
})
