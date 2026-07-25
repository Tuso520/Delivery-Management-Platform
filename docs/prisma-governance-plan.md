# Prisma 历史结构治理方案

> 状态：方案已完成，物理删除未执行。适用基线：2026-07-26 当前 schema、三个数据 migrator、只读 verify、二次幂等 seed 和 `check-prisma-runtime-boundaries.mjs`。

## 1. 治理原则

1. 27 个历史 Model 和 7 个旧字段当前生产运行时 delegate/字段调用均为 0，但这只证明代码隔离，不证明生产数据为空。
2. 在备份、行数、外键、迁移例外、migrator dry-run/apply/verify、幂等 seed 和回滚演练全部有证据前，不删除 Model、字段、关系或数据库表。
3. 旧源只允许 migrator 和只读 verify 访问，不得重新接入运行时双读、双写或回退查询。
4. 每批迁移使用独立 migration，先停止兼容读取，再停止旧字段写入，最后才物理删除；禁止把 27 个 Model 合并为一次不可回滚变更。

## 2. 27 个历史 Model 台账

| 批次 | Model | 当前用途 | 目标 | 迁移/验证 | 回滚 |
| --- | --- | --- | --- | --- | --- |
| A 文件档案 | `ArchiveTemplateItem`、`ProjectArchiveItem`、`FileReview` | 旧档案结构、旧文件审核迁移源 | 映射到统一档案目标、`LogicalFile/FileVersion`、`ReviewTask` 后退役 | 档案 migrator dry-run/apply/verify；新旧总数、版本链、审核终态一致 | 保留表只读；按迁移批次 ID 删除目标写入后重跑 |
| B 知识内容 | `KnowledgeArticle`、`KnowledgeArticleVersion` | 旧知识迁移源 | 映射到 `KnowledgeItem/KnowledgeVersion` | 内容 migrator；FILE/MARKDOWN/LINK 主源唯一性、支持文件集合、发布版本一致 | 保留旧表只读；按 source ID 清理目标记录 |
| C 流程文档 | `WorkflowCategory`、`WorkflowDocument`、`DocumentTemplateVersion` | 历史流程文档 | 评估归档导出；确认无合规保留要求后退役 | 行数、附件引用、最新版本、负责人抽样 | 恢复表备份；不在运行时回接 |
| D 检查项 | `ChecklistTemplateItem`、`ProjectChecklistItem` | 旧检查明细 | 评估是否迁入配置化检查模板；未确认前永久保留 | 模板覆盖率、项目关联、完成状态 | 只读恢复 |
| E 迁移治理 | `MigrationException` | migrator 例外台账 | 最后一批删除之后仍保留一个发布周期 | OPEN 例外必须为 0；RESOLVED 可导出归档 | 从导出恢复 |
| F 系统旧功能 | `DashboardWidget`、`ExternalContactCandidate`、`ApiKey`、`DailyReport`、`BackupRecord` | 无生产调用的旧功能数据 | 产品、合规、安全逐项签字后分表退役 | 行数、最近写入时间、外键、审计/备份保留期 | 单表备份恢复 |
| G 绩效审批 | `OkrObjective`、`KeyResult`、`PerformanceScore`、`ApprovalTask`、`ApprovalAction` | 非当前交付平台核心；旧审批已由 Review 取代 | 业务负责人确认导出后退役 | 对象/动作链完整性、未完成状态为 0 | 单批恢复；禁止回接旧审批运行时 |
| H 培训复盘 | `SkillDefinition`、`SkillAssessment`、`TrainingPlan`、`TrainingParticipant`、`ProjectRetrospective`、`RetrospectiveAction` | 历史扩展域 | 独立归档或拆分到未来系统 | 参与人、项目、行动项未完成数 | 独立备份恢复 |

## 3. 旧字段与兼容关系

| 结构 | 当前状态 | 退役前置条件 | 删除批次 |
| --- | --- | --- | --- |
| `StandardVersion.structuredContent`、`applicability`、`legacySnapshot` | 运行时读写 0 | 标准 migrator verify 全通过；正文只使用统一 `FileVersion` | 标准内容批次 |
| `KnowledgeVersion.legacySnapshot` | 运行时读写 0 | 知识 migrator verify、主内容源唯一性和支持文件集合验证 | 知识内容批次 |
| `NotificationRule.channel`、`recipientRole`、`template` | 运行时读写 0 | `channels/recipientPolicy/templateId` 非空规则验证；通知回归 | 通知批次 |
| `Project` 永久删除对旧 `File` 的保护查询 | 有意保留 | 旧文件表行数和项目关联全部迁移并只读 verify | 文件最后批次 |
| `legacy-folder:` stable key | 兼容读取 | 所有档案目标 stable key 迁移并验证无前缀 | 档案批次 |
| `DATA_CENTER`、`LIGHTWEIGHT` 项目类型 | 输入兼容 | 配置值和存量项目全部归一，API 监控一个发布周期无旧值 | 项目配置批次 |
| `ProjectAccessService` facade | 兼容服务 | 所有消费者直接依赖 `DataScopeService` 或公开 port | 代码批次，无 DB migration |

## 4. 每批执行清单

1. 冻结写入窗口，记录 releaseId、schema migration 基线和目标 commit。
2. 完成全量数据库备份与恢复演练，记录校验和、时间和恢复耗时。
3. 查询旧表/字段行数、NULL 分布、孤儿外键、最近写入时间和业务终态。
4. 执行三个 migrator 的 dry-run；OPEN `MigrationException` 必须为 0。
5. apply 后执行只读 verify，再执行第二次 apply 证明幂等。
6. 执行二次 seed，确认权限、配置和数据不被重置。
7. 观察一个发布周期；门禁持续禁止生产代码调用旧 delegate/字段。
8. 创建独立删除 migration；先测试库，再灰度，再生产。
9. 若任一计数、关联或业务抽样不一致，立即停止删除并按批次 ID 回滚目标写入。

## 5. 当前阻塞

- 尚未取得生产数据库的行数、外键和最后写入时间证据。
- 尚未完成生产级备份恢复演练和各批次业务负责人签字。
- 因此所有物理删除均为 `BLOCKED`；当前正确动作是保留 schema、持续运行时隔离和准备验证脚本。
