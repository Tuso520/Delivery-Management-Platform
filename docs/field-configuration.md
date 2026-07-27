# 字段配置架构

## 1. 目标

字段配置是平台枚举字段、默认值、排序、启用状态和展示名称的唯一业务来源。前端不维护国家、币种、项目类型、客户类型等备用数组；后端写入时再次校验配置，不信任前端选项。

## 2. 数据模型

`DictionaryCategory` 表示一个字段定义，核心属性包括：

- `categoryCode`、`categoryName`：稳定编码和展示名称。
- `fieldType`：字段类型。
- `required`、`defaultValue`：必填和默认值。
- `visibleScopes`：允许消费该字段的业务模块。
- `permissions`：字段级读写约束元数据。
- `status`、`sortOrder`、`revision`：启用、排序和并发版本。

`DictionaryItem` 表示字段选项，保存稳定值、展示名、排序、状态、系统内置标记和修订信息。业务表只保存稳定值或显式外键，不复制展示名称。

知识分类保留 `KnowledgeCategory` 业务实体以承载已有知识外键，同时通过 `fieldOptionId` 与 `KNOWLEDGE_CATEGORY` 选项一对一关联；对外展示名来自字段选项。标准按类型、交付阶段、管理领域、业务类型、状态、启用状态和国家分别保存稳定编码或关联主键，不通过显示名称关联。

## 3. 配置字段与消费页面

| 配置编码 | 主要消费方 |
|---|---|
| `COUNTRY` | 项目、档案模板、审批规则、标准使用国家、国家元数据页 |
| `CURRENCY` | 项目合同、币种与汇率页 |
| `CUSTOMER_TYPE` | 项目列表、详情和表单 |
| `CONTRACT_TYPE` | 项目列表、详情和表单 |
| `PRODUCT_TYPE` | 项目详情和表单 |
| `PROJECT_KEYWORD` | 项目详情和表单 |
| `PROJECT_STAGE` | 项目列表、详情、进度和表单 |
| `PROJECT_STATUS` | 项目状态展示和写入校验 |
| `JOB_POSITION` | 字段配置和组织岗位引用 |
| `PROJECT_TYPE` | 项目、档案模板 |
| `STANDARD_TYPE` | 标准类型筛选、列表、详情和表单 |
| `STANDARD_DELIVERY_STAGE` | 标准库交付阶段页签、分类、列表和表单 |
| `STANDARD_MANAGEMENT_DOMAIN` | 标准库管理领域页签、分类、列表和表单 |
| `STANDARD_BUSINESS_TYPE` | 标准业务类型筛选、详情和表单 |
| `STANDARD_STATUS` | 标准发布状态展示和写入校验 |
| `STANDARD_ENABLED_STATUS` | 标准启停展示、默认值和写入校验 |
| `STANDARD_CURRENT_VERSION` | 标准当前版本字段定义和展示名 |
| `STANDARD_EFFECTIVE_DATE` | 标准版本生效日期字段定义和展示名 |
| `KNOWLEDGE_CATEGORY` | 知识筛选、列表、详情和表单 |
| `FILE_TYPE` | 档案模板允许类型、项目档案上传选择与服务端上传校验 |

Figma 字段配置页只呈现目标节点定义的用户可管理页签；标准、知识和文件类型仍由同一服务提供，但不擅自增加到项目档案节点中。

## 4. API

管理接口使用 `/api/v1/field-config`：

- `GET /field-config`、`GET /field-config/module/:moduleCode`、`GET /field-config/version`。
- `GET /field-config/code-availability`。
- `POST /field-config`、`PATCH /field-config/:id`、`PATCH /field-config/:id/status`、`PUT /field-config/sort`。
- `GET /field-config/categories`、`GET /field-config/categories/:id/values`。
- `POST /field-config/categories/:id/values`、`PATCH /field-config/values/:id`、`PATCH /field-config/values/:id/status`。
- `PUT /field-config/categories/:id/sort`、`GET /field-config/values/:id/reference-status`、`DELETE /field-config/values/:id`。

业务页面使用只读接口 `/api/v1/field-options`：

- `GET /field-options/module/:moduleCode`。
- `POST /field-options/batch`。
- `GET /field-options/:code`。

所有响应继续由全局拦截器包装为 `{ code, message, data, timestamp, traceId }`。

## 5. 前端同步与缓存

`src/platform/field-configuration/useFieldConfig.ts` 是业务页面的统一访问层：

1. 按模块调用 `field-options/module/:moduleCode`。
2. 使用按 `moduleCode` 分区的 `moduleStates` 共享缓存与进行中请求去重，避免同一页面重复请求。
3. 暴露字段定义、启用选项、默认值和历史值展示方法。
4. 管理端写入成功后使字段配置查询失效；业务模块下一次读取获得新版本。
5. 字段设置页面同时刷新管理列表和模块缓存，避免一个页面内出现旧名称或旧排序。

新增数据只使用启用选项；历史记录如果引用了已停用选项，详情和列表仍可通过完整配置或业务关联显示原标签。

标准库使用 `STANDARD_TYPE`、`STANDARD_DELIVERY_STAGE`、`STANDARD_MANAGEMENT_DOMAIN`、`STANDARD_BUSINESS_TYPE`、`STANDARD_STATUS`、`STANDARD_ENABLED_STATUS`、`STANDARD_CURRENT_VERSION`、`STANDARD_EFFECTIVE_DATE` 和 `COUNTRY`。重命名、排序、默认值或启停更新后，标准库筛选、分类、列表、详情和表单读取同一配置版本；旧 `STANDARD_CATEGORY` 已迁移并停用，不再参与运行时双读或双写。详细映射见 [标准库](standard-library.md)。

## 6. 权限

- `field_setting:view`：查看管理配置。
- `field_setting:edit`：修改字段定义、选项内容、排序和删除未引用选项。
- `field_setting:option_create`：新增选项。
- `field_setting:option_toggle`：启用或停用选项。

业务只读接口要求已认证；具体业务写入仍由项目、标准、知识、审批等模块自己的权限保护。前端按钮只是展示控制，NestJS Controller 和 Service 执行最终校验。

## 7. 停用、删除与迁移

- 停用后不再出现在新建/编辑可选项中，不改写历史业务数据。
- 删除前执行引用检查；项目、项目进度记录、模板、标准、知识等任一业务引用存在即拒绝。
- 系统内置选项不允许直接删除。
- 重命名只改变标签，稳定值不变，因此列表、详情、筛选和表单同步显示新名称。
- 排序只改变选项顺序，不改变稳定值；项目进度前进/回退判断也按 `PROJECT_STAGE` 当前排序执行，不再使用代码内阶段数组。
- 国家和币种迁移把既有元数据导入 `COUNTRY`、`CURRENCY`；原表继续保存国家/汇率专属元数据，不再充当枚举来源。
- 知识分类迁移为既有分类建立字段选项关联；无法直接启用的历史分类以停用选项保留展示。
- 文件类型使用小写扩展名作为稳定值；模板和项目快照保存稳定值，历史文件保留原扩展名。停用后上传选择器立即隐藏该类型，后端拒绝新上传，但历史文件、版本和下载不受影响。
- seed 只补齐缺失配置并幂等更新平台定义，不重置既有账号密码或覆盖业务数据。

## 8. 避免双枚举

- 前端没有国家、币种、项目类型、客户类型的备用数组。
- 项目 `ProjectConfigurationService` 只作为写入校验适配层读取同一组 `DictionaryCategory/DictionaryItem`，不维护第二套值。
- 项目阶段 DTO 只校验稳定编码格式，默认阶段、可用性和顺序由 `PROJECT_STAGE` 配置在 Service 层校验；新增启用阶段无需修改前后端常量。
- `CountryService` 和 `CurrencyService` 以字段选项决定可见集合，再关联各自专属元数据。
- 标准和知识的 DTO/Service 在保存时调用字段配置校验。
- 标准的交付阶段、管理领域、业务类型、状态和启停分别校验对应稳定编码；使用国家通过 `StandardCountry` 关联 `COUNTRY` 稳定编码，停用选项只禁止新引用，不破坏历史显示。
