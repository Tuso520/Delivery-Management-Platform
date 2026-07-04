# 数据权限与 API 设计

## 数据模型分组

Prisma schema 当前覆盖以下模型分组：

- 用户权限：User、Role、Permission、UserRole、RolePermission。
- 项目交付：Project、ProjectMember、ProjectProcessRecord、ProjectPayment。
- 档案文件：ArchiveTemplate、ArchiveTemplateItem、ProjectArchiveItem、File、FileReview、Attachment。
- 检查流程：ChecklistTemplate、ChecklistTemplateItem、ProjectChecklistItem、WorkflowCategory、WorkflowDocument。
- 知识模板：DocumentTemplate、DocumentTemplateVersion、KnowledgeCategory、KnowledgeArticle、KnowledgeArticleVersion、ToolCategory、ToolItem。
- 组织绩效：Department、DailyReport、OkrObjective、KeyResult、PerformanceScore、SkillDefinition、SkillAssessment、TrainingPlan、TrainingParticipant。
- 系统配置：Country、Currency、ExchangeRate、Language、Translation、Notification、NotificationRule、OperationLog、SystemConfig、DashboardWidget、IntegrationConfig、ApiKey、BackupRecord。

## API 响应

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "timestamp": "2026-07-05T00:00:00.000Z"
}
```

异常响应：

```json
{
  "code": 403,
  "message": "Forbidden",
  "data": null,
  "timestamp": "2026-07-05T00:00:00.000Z"
}
```

## 权限设计

- 登录后签发 JWT。
- 后端通过 Guard 校验登录态、角色和权限码。
- 前端根据用户权限控制菜单和按钮显示。
- 敏感动作写入 OperationLog。

## 文件与预览

- 文件上传到 MinIO，数据库保存对象键、文件名、类型、大小、版本和业务关联。
- 预览按 MIME 类型分流：PDF、图片、Office 文档、未知格式。
- 知识库附件、项目档案文件和文档模板版本可复用同一预览能力。
