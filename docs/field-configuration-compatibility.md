# 字段配置兼容与后续动态化清单

## 本次兼容原则

- 字段配置中心复用并增强统一的 `DictionaryCategory`、`DictionaryItem`，不删除现有枚举、国家、币种或知识分类模型。
- 项目配置接口优先读取新的大写分类编码，同时兼容既有小写分类编码，避免现有项目表单中断。
- 本次只提供统一维护、管理员权限和业务只读接口，不把所有业务表单一次性改为动态字段。
- `Project.projectType` 的历史语义实际接近“客户类型”，当前继续由 `CUSTOMER_TYPE` 提供选项；新的 `PROJECT_TYPE` 保留给后续完成数据模型语义拆分后接入。

## 仍存在的硬编码或独立配置

| 字段 | 当前实现位置 | 后续接入建议 |
| --- | --- | --- |
| 国家 | `prisma/schema.prisma` 的 `Country`；`src/modules/country/`；前端 `src/api/country.ts`、项目和档案模板页面 | 以 `COUNTRY` 为展示选项源，保留 `Country` 的时区、语言等业务属性，并建立编码关联 |
| 原币币种 | `prisma/schema.prisma` 的 `Currency`、汇率关系；`src/modules/currency/`；前端 `src/api/currency.ts`、`src/views/currency/index.vue` | 以 `CURRENCY` 控制可选性和排序，继续由 `Currency` 保存精度、汇率锁定等财务属性 |
| 客户类型/项目类型 | `src/modules/project/project.constants.ts`、项目 DTO/Service；前端 `src/types/project.ts`、`src/utils/project-dictionaries.ts`、`src/views/project/ProjectDrawer.vue`、项目列表与详情 | 先为项目模型新增独立 `customerType`，迁移历史 `projectType` 语义，再分别接入 `CUSTOMER_TYPE` 与 `PROJECT_TYPE` |
| 合同类型、产品类型、项目关键词 | 项目配置 Service 与项目 DTO；前端 `ProjectDrawer.vue`、项目列表和详情 | 表单改用 `/field-options/:code`，数据库继续保存稳定编码 |
| 项目阶段 | 项目常量、状态流转 Service/DTO；前端 `src/utils/project-localization.ts`、`src/types/project.ts`、项目及工作台页面 | 选项展示可动态化，但流转规则仍需保留受控枚举和状态机校验 |
| 项目状态 | 项目常量、状态命令与归档逻辑；前端状态徽标和本地化 | 初始化配置仅含“进行中、已验收”；运行时仍有草稿、暂停、取消和归档语义，不应在状态机改造前删除 |
| 标准分类 | 标准模块 DTO/Service、标准发布页面及既有标准分类数据 | 先建立旧分类与 `STANDARD_CATEGORY` 编码映射，再将发布筛选与表单切换到只读接口 |
| 知识分类 | `KnowledgeCategory` 树模型、`src/modules/knowledge/knowledge-item.service.ts`；前端 `src/views/knowledge/index.vue`、`src/types/knowledge.ts` | 现有分类支持层级，不能直接以扁平字典替换；应增加映射或明确字段配置仅作为一级分类模板 |
| 岗位 | 用户/角色管理及 `ExternalContact.positionNames` 等自由文本/JSON 字段 | 明确岗位与权限角色的边界后，将人员与联系人表单接入 `JOB_POSITION` |
| 项目类型在档案/审批范围 | 档案模板、审批模板、检查清单、项目归档快照中的 `projectType`、`countryCode` | 与项目字段语义拆分同步迁移，避免同名字段继续承载不同业务含义 |
| 测试和迁移脚本中的固定样例 | `prisma/seed-test-data.ts`、三个数据 migrator、各模块测试夹具 | 保留迁移兼容值；业务动态化完成后统一替换测试数据工厂，不改写历史 migration |

## 动态化顺序建议

1. 先拆分项目的“客户类型”和“项目类型”数据语义，并为历史值建立映射。
2. 再让项目创建/编辑、档案模板和审批模板消费统一只读接口。
3. 随后接入标准分类；知识分类需单独设计树形兼容方案。
4. 最后处理阶段/状态等带业务状态机约束的字段，配置只控制展示与启用范围，不绕过后端流转规则。
