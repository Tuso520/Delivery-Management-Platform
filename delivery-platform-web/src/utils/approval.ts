const businessLabels: Record<string, string> = {
  report: '工作报告',
  knowledge: '知识发布',
  'knowledge-file-update': '知识库文件更新',
  checklist: '检查模板记录',
  process_record: '项目过程记录',
  performance: '绩效评分',
}

export function getApprovalBusinessLabel(businessType: string): string {
  return businessLabels[businessType] ?? businessType
}

export function getApprovalBusinessRoute(
  businessType: string,
  businessId: string,
): string {
  if (businessType === 'report') return `/report/detail/${businessId}`
  if (businessType === 'knowledge') return `/knowledge/${businessId}`
  if (businessType === 'knowledge-file-update') return '/knowledge'
  if (businessType === 'checklist') return '/field-check'
  if (businessType === 'performance') return '/okr'
  return '/todo'
}
