type QueryParams = object

function snapshot<T extends QueryParams>(params: T): T {
  return { ...params }
}

export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    publicConfig: () => ['auth', 'public-config'] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    projectSummary: () => ['dashboard', 'project-summary'] as const,
    myTasks: () => ['dashboard', 'my-tasks'] as const,
    highRisks: () => ['dashboard', 'high-risks'] as const,
    recentProjects: () => ['dashboard', 'recent-projects'] as const,
    recentActivities: () => ['dashboard', 'recent-activities'] as const,
  },
  projects: {
    all: ['projects'] as const,
    lists: () => ['projects', 'list'] as const,
    list: <T extends QueryParams>(params: T) => ['projects', 'list', snapshot(params)] as const,
    summary: () => ['projects', 'summary'] as const,
    details: () => ['projects', 'detail'] as const,
    detail: (projectId: string) => ['projects', 'detail', projectId] as const,
    payments: (projectId: string) => ['projects', 'detail', projectId, 'payments'] as const,
    userOptions: (purpose: string) => ['projects', 'user-options', purpose] as const,
    formOptions: () => ['projects', 'form-options'] as const,
    archiveTemplateOptions: () => ['projects', 'archive-template-options'] as const,
  },
  archive: {
    all: ['archive'] as const,
    projectOptions: () => ['archive', 'project-options'] as const,
    tree: (projectId: string) => ['archive', 'tree', projectId] as const,
    templateDiff: (projectId: string) => ['archive', 'template-diff', projectId] as const,
    userOptions: () => ['archive', 'user-options'] as const,
  },
  archiveTemplates: {
    all: ['archive-templates'] as const,
    lists: () => ['archive-templates', 'list'] as const,
    list: <T extends QueryParams>(params: T) =>
      ['archive-templates', 'list', snapshot(params)] as const,
    detail: (templateId: string) => ['archive-templates', 'detail', templateId] as const,
    versions: (templateId: string) => ['archive-templates', 'versions', templateId] as const,
    version: (versionId: string) => ['archive-templates', 'version', versionId] as const,
    formOptions: () => ['archive-templates', 'form-options'] as const,
  },
  reviews: {
    all: ['file-reviews'] as const,
    lists: () => ['file-reviews', 'list'] as const,
    list: <T extends QueryParams>(params: T) => ['file-reviews', 'list', snapshot(params)] as const,
    summary: () => ['file-reviews', 'summary'] as const,
    detail: (taskId: string) => ['file-reviews', 'detail', taskId] as const,
    history: (taskId: string) => ['file-reviews', 'history', taskId] as const,
  },
  standards: {
    all: ['standards'] as const,
    lists: () => ['standards', 'list'] as const,
    list: <T extends QueryParams>(params: T) => ['standards', 'list', snapshot(params)] as const,
    summary: () => ['standards', 'summary'] as const,
    detail: (standardId: string) => ['standards', 'detail', standardId] as const,
    relations: (standardId: string) => ['standards', 'detail', standardId, 'relations'] as const,
    relationCandidates: () => ['standards', 'relation-candidates'] as const,
  },
  knowledge: {
    all: ['knowledge'] as const,
    lists: () => ['knowledge', 'list'] as const,
    list: <T extends QueryParams>(params: T) => ['knowledge', 'list', snapshot(params)] as const,
    summary: () => ['knowledge', 'summary'] as const,
    categories: () => ['knowledge', 'categories'] as const,
    detail: (itemId: string) => ['knowledge', 'detail', itemId] as const,
  },
  files: {
    all: ['files'] as const,
    previewSessions: () => ['files', 'preview-session'] as const,
    previewSession: (fileId: string) => ['files', 'preview-session', fileId] as const,
  },
  tools: {
    all: ['tools'] as const,
    lists: () => ['tools', 'list'] as const,
    list: (includeDisabled: boolean) => ['tools', 'list', { includeDisabled }] as const,
  },
  currencies: {
    all: ['currencies'] as const,
    list: () => ['currencies', 'list'] as const,
  },
  users: {
    all: ['users'] as const,
    lists: () => ['users', 'list'] as const,
    list: <T extends QueryParams>(params: T) => ['users', 'list', snapshot(params)] as const,
  },
  roles: {
    all: ['roles'] as const,
    list: () => ['roles', 'list'] as const,
    detail: (roleId: string) => ['roles', 'detail', roleId] as const,
  },
  permissions: {
    all: ['permissions'] as const,
    groups: () => ['permissions', 'groups'] as const,
  },
  departments: {
    all: ['departments'] as const,
    tree: () => ['departments', 'tree'] as const,
  },
  settings: {
    all: ['settings'] as const,
    system: () => ['settings', 'system'] as const,
    systemTime: () => ['settings', 'system-time'] as const,
    approvalTemplateLists: () => ['settings', 'approval-templates'] as const,
    approvalTemplates: <T extends QueryParams>(params: T) =>
      ['settings', 'approval-templates', snapshot(params)] as const,
    integrations: () => ['settings', 'integrations'] as const,
    integrationLogLists: (provider: string) =>
      ['settings', 'integrations', provider, 'logs'] as const,
    integrationLogs: <T extends QueryParams>(provider: string, params: T) =>
      ['settings', 'integrations', provider, 'logs', snapshot(params)] as const,
    auditLogs: <T extends QueryParams>(params: T) =>
      ['settings', 'audit-logs', snapshot(params)] as const,
    auditLog: (logId: string) => ['settings', 'audit-logs', 'detail', logId] as const,
    notificationRules: () => ['settings', 'notification-rules'] as const,
  },
} as const
