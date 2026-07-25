# Prisma 历史模型运行时边界

## 目的

以下 27 个 Prisma Model 保留在 Schema 中，用作历史数据、迁移源或后续独立评审的依据。本阶段不删除模型、不删除表、不改变数据库结构，也不允许生产运行时重新接入这些 delegate。

受控 Migrator、迁移审计、只读 Verify 和历史数据核验可继续在 `delivery-platform-server/prisma/` 中访问相关模型；`delivery-platform-server/src/` 的 Controller、Service、Worker 和公共运行时代码不得读写它们。

## 固定模型清单

1. `ArchiveTemplateItem`
2. `ProjectArchiveItem`
3. `FileReview`
4. `MigrationException`
5. `ChecklistTemplateItem`
6. `ProjectChecklistItem`
7. `WorkflowCategory`
8. `WorkflowDocument`
9. `DocumentTemplateVersion`
10. `KnowledgeArticle`
11. `KnowledgeArticleVersion`
12. `DashboardWidget`
13. `ExternalContactCandidate`
14. `ApiKey`
15. `DailyReport`
16. `OkrObjective`
17. `KeyResult`
18. `PerformanceScore`
19. `ApprovalTask`
20. `ApprovalAction`
21. `SkillDefinition`
22. `SkillAssessment`
23. `TrainingPlan`
24. `TrainingParticipant`
25. `ProjectRetrospective`
26. `RetrospectiveAction`
27. `BackupRecord`

## 自动门禁

执行：

```powershell
node scripts/check-prisma-runtime-boundaries.mjs
```

检查同时验证：

- 清单恰好包含 27 个不重复模型；
- 每个模型仍存在于 `prisma/schema.prisma`；
- `delivery-platform-server/src/` 的非测试 TypeScript 文件没有对应 Prisma delegate 调用。

任何模型的物理删除、表清理或运行时重新接入都必须另立数据迁移任务，先完成备份、行数、外键、Migrator 幂等性、回滚和生产数据验证评审，不得通过放宽本门禁直接实施。
