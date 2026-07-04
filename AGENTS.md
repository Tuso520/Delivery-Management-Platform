# AGENTS.md — 交付管理平台

> **AI 交互宪法**：每个新 session 都会重新加载此文件。所有规范必须显式记录，不可依赖"AI应该知道"。

---

## 项目身份

- **名称**：交付管理平台 (Delivery Management Platform)
- **定位**：面向交付中心的企业级项目管理系统，非网盘
- **业务范围**：多国家（越南、泰国、马来、印尼、新加坡、阿曼等）、多币种、多语言、多项目类型
- **开发模式**：纯 AI 驱动，零历史代码，全模块骨架先行

---

## 技术栈（不可更改）

```
前端：Vue 3.4+ + TypeScript + Element Plus + Pinia + Vue Router + Axios + Vite + vue-i18n
后端：NestJS 10+ + TypeScript + Prisma 5+ + MySQL 8.0
缓存：Redis 7
存储：MinIO (S3协议，兼容阿里云OSS)
部署：Docker / Docker Compose + Nginx
测试：Vitest (前端) + Jest (后端)
包管理：pnpm (前后端统一)
```

---

## 一、全局铁律（违反 = 回滚）

1. **后端必须校验权限**——前端权限仅用于 UI 展示，后端是最后防线
2. **所有 API 响应使用统一格式**——`{ code, message, data, timestamp }` 不允许绕过
3. **金额字段必须存储**——原币金额 + 原币币种 + 汇率 + 折算币种 + 折算金额 + 汇率日期，缺一不可
4. **文件不存入数据库**——统一存 MinIO，数据库只存索引
5. **所有配置项必须配置化**——国家、币种、语言、项目类型、档案模板、检查项模板、审核规则均不可硬编码
6. **敏感操作必须留痕**——合同查看、成本查看、文件下载、权限变更、系统备份下载全部写入 operation_logs
7. **软删除原则**——项目、用户、文件、档案等核心数据使用软删除，不做物理删除
8. **DRY 原则**——复用优先。提取公共组件、公共工具、公共 Service。
9. **不使用 any 类型**——TypeScript 严格模式，必须显式类型

---

## 二、项目结构规范

### 后端 (delivery-platform-server/)

```
src/
├── main.ts                         # 入口
├── app.module.ts                   # 根模块
├── common/                         # 全局共享
│   ├── decorators/                 # @Roles, @Permissions, @CurrentUser, @Public
│   ├── guards/                     # JwtAuthGuard, RolesGuard, PermissionsGuard
│   ├── interceptors/               # TransformInterceptor (统一响应包装)
│   ├── filters/                    # HttpExceptionFilter (统一异常处理)
│   ├── pipes/                      # ValidationPipe
│   ├── dto/                        # 公共DTO (如分页)
│   └── utils/                      # 纯函数工具
├── config/                         # 配置模块
│   ├── app.config.ts
│   ├── database.config.ts
│   ├── redis.config.ts
│   ├── storage.config.ts           # MinIO 配置
│   └── auth.config.ts
├── modules/                        # 业务模块（每个一个目录）
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   └── register.dto.ts
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts
│   │   └── __tests__/
│   ├── user/                       # 同结构...
│   ├── role/
│   ├── permission/
│   ├── project/
│   ├── project-member/
│   ├── archive-template/
│   ├── project-archive/
│   ├── file/
│   ├── review/
│   ├── checklist/
│   ├── workflow/
│   ├── template/
│   ├── knowledge/
│   ├── tool/
│   ├── country/
│   ├── currency/
│   ├── language/
│   ├── notification/
│   ├── dashboard/
│   ├── operation-log/
│   └── system-config/
├── database/
│   ├── migrations/
│   └── seed/
└── integrations/                   # 第三方集成
    ├── email/
    ├── enterprise-wechat/
    ├── oss/
    └── third-party/
```

### 前端 (delivery-platform-web/)

```
src/
├── main.ts
├── App.vue
├── api/                            # API 调用层（一个 module 一个文件）
│   ├── request.ts                  # Axios 实例 + 拦截器
│   ├── auth.ts
│   ├── user.ts
│   ├── project.ts
│   ├── archive.ts
│   └── ...
├── assets/                         # 静态资源
├── components/                     # 全局共享组件
│   ├── ArchiveTree/
│   ├── FileUploader/
│   ├── FilePreview/
│   ├── StatusTag/
│   ├── PermissionButton/
│   ├── ProjectSelector/
│   ├── UserSelector/
│   ├── CurrencyAmount/
│   └── LanguageText/
├── composables/                    # 组合式函数
│   ├── useAuth.ts
│   ├── usePermission.ts
│   ├── useTable.ts                 # 表格通用逻辑
│   └── useForm.ts                  # 表单通用逻辑
├── layouts/
│   ├── BasicLayout.vue             # 主布局（侧边栏+顶栏+内容）
│   └── BlankLayout.vue
├── router/
│   ├── index.ts                    # 路由定义
│   └── permission.ts               # 路由守卫
├── store/
│   ├── user.ts
│   ├── permission.ts
│   ├── project.ts
│   └── app.ts
├── styles/
│   ├── variables.scss              # SCSS 变量
│   ├── mixins.scss                 # SCSS 混入
│   └── global.scss                 # 全局样式
├── types/                          # TypeScript 类型定义
│   ├── api.ts                      # API 响应类型
│   ├── user.ts
│   ├── project.ts
│   └── ...
├── utils/                          # 纯函数工具
│   ├── request.ts                  # Axios 配置
│   ├── auth.ts                     # Token 管理
│   ├── permission.ts               # 权限判断
│   ├── file.ts                     # 文件处理
│   ├── format.ts                   # 金额/日期格式化
│   ├── currency.ts                 # 币种工具
│   └── validator.ts                # 表单校验规则
├── views/                          # 页面（按模块分目录）
│   ├── login/
│   ├── dashboard/
│   ├── project/
│   ├── archive/
│   ├── checklist/
│   ├── workflow/
│   ├── template/
│   ├── knowledge/
│   ├── tools/
│   ├── country/
│   ├── currency/
│   ├── language/
│   ├── user/
│   ├── role/
│   └── system/
└── locales/                        # 国际化
    ├── zh-CN.json
    ├── en-US.json
    └── index.ts
```

---

## 三、后端编码规范

### 3.1 NestJS 模块规范

每个业务模块必须包含：

```typescript
// ✅ 正确的模块结构
@Module({
  imports: [PrismaModule],          // 按需导入
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],           // 仅当其他模块需要时导出
})
export class UserModule {}
```

**禁止**：在 Controller 里写业务逻辑、在 Service 里直接用 req/res 对象

### 3.2 API 响应格式（强制）

```typescript
// ✅ 成功响应
{
  "code": 0,
  "message": "success",
  "data": { ... },
  "timestamp": "2026-06-22T10:00:00Z"
}

// ✅ 分页响应
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}

// ✅ 错误响应
{
  "code": 422,
  "message": "项目名称不能为空",
  "data": null,
  "timestamp": "2026-06-22T10:00:00Z"
}
```

**全部通过 TransformInterceptor 包装**，Controller 只返回 data 部分。

### 3.3 API 端点命名（RESTful + 权限字段名）

```
GET    /api/v1/projects                  # 列表
POST   /api/v1/projects                  # 创建
GET    /api/v1/projects/:id              # 详情
PUT    /api/v1/projects/:id              # 更新
DELETE /api/v1/projects/:id              # 删除
GET    /api/v1/projects/:id/members      # 子资源列表
POST   /api/v1/projects/:id/members      # 添加子资源
DELETE /api/v1/projects/:id/members/:mid # 移除子资源

# 非 CRUD 操作使用动词后缀
POST   /api/v1/projects/:id/archives/generate
POST   /api/v1/archive-items/:id/mark-not-applicable
POST   /api/v1/files/:id/set-current
POST   /api/v1/files/:id/review
```

**URL 参数命名**：使用 camelCase —— `pageSize` 不是 `page_size`

### 3.4 DTO 规范

```typescript
// ✅ 正确：使用 class-validator 装饰器
import { IsString, IsNotEmpty, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: '客户名称' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiProperty({ description: '国家代码', example: 'VN' })
  @IsString()
  @IsNotEmpty()
  countryCode: string;
}

// ✅ 查询 DTO 继承分页基类
export class QueryProjectDto extends PaginationDto {
  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '项目状态' })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
```

### 3.5 Prisma 使用规范

```typescript
// ✅ 正确：注入 PrismaService
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id, deletedAt: null },  // 软删除过滤
      select: {                         // 明确 select，不要 select all
        id: true,
        username: true,
        realName: true,
        email: true,
      },
    });
  }

  async findMany(query: QueryUserDto) {
    const { page, pageSize, keyword } = query;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(keyword && {
        OR: [
          { username: { contains: keyword } },
          { realName: { contains: keyword } },
        ],
      }),
    };

    const [total, list] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: { id: true, username: true, realName: true, email: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { list, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
}
```

### 3.6 权限校验规范

```typescript
// ✅ 类级别权限控制
@Controller('projects')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectController {

  // ✅ 公开接口
  @Public()
  @Get('health')
  health() {}

  // ✅ 角色控制
  @Roles('PROJECT_MANAGER', 'DELIVERY_MANAGER')
  @Get()
  findAll() {}

  // ✅ 细粒度权限
  @Permissions('project:create')
  @Post()
  create() {}

  // ✅ 数据范围校验（Service 层处理）
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    // Service 层校验：该用户是否有权访问此项目
    return this.projectService.findOne(id, user);
  }
}
```

### 3.7 敏感操作日志

```typescript
// ✅ 敏感操作必须写入日志
@Post(':id/view-cost')
async viewCost(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  const result = await this.projectService.getCostData(id, user);

  // 敏感操作记录
  await this.operationLogService.log({
    userId: user.sub,
    module: 'project',
    action: 'view_cost',
    targetType: 'project',
    targetId: id,
    ipAddress: '', // 从 request 获取
    result: 'success',
  });

  return result;
}
```

---

## 四、前端编码规范

### 4.1 Vue 组件规范

```vue
<!-- ✅ 正确：组合式 API + <script setup> + TypeScript -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useProjectStore } from '@/store/project'
import type { Project } from '@/types/project'

// Props
const props = defineProps<{
  projectId: string
  readonly?: boolean
}>()

// Emits (使用 kebab-case)
const emit = defineEmits<{
  (e: 'update-success', project: Project): void
  (e: 'close'): void
}>()

// Store
const projectStore = useProjectStore()

// State
const loading = ref(false)
const formData = ref<Partial<Project>>({})

// Computed
const canEdit = computed(() => !props.readonly)

// Methods
const handleSubmit = async () => {
  loading.value = true
  try {
    await projectStore.update(props.projectId, formData.value)
    emit('update-success', formData.value as Project)
    ElMessage.success('更新成功')
  } catch (error) {
    ElMessage.error('更新失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 初始化
})
</script>

<template>
  <el-form :model="formData" :disabled="!canEdit" @submit.prevent="handleSubmit">
    <!-- form items -->
  </el-form>
</template>

<style scoped lang="scss">
// 使用 scoped，必要时用 :deep()
</style>
```

### 4.2 状态命名

- 禁止使用 `data`、`info`、`list` 等无意义变量名
- 使用描述性名称：`projectList`、`archiveTree`、`fileVersions`
- Ref 变量不加 `$` 前缀
- 函数名以动词开头：`fetchProjects`、`handleSubmit`、`onFileSelect`

### 4.3 API 调用规范

```typescript
// ✅ src/api/project.ts — 一个 module 一个文件
import request from './request'
import type { ApiResponse, PaginatedData } from '@/types/api'
import type { Project, CreateProjectDto, QueryProjectDto } from '@/types/project'

export const projectApi = {
  getList(params: QueryProjectDto) {
    return request.get<ApiResponse<PaginatedData<Project>>>('/api/v1/projects', { params })
  },

  getById(id: string) {
    return request.get<ApiResponse<Project>>(`/api/v1/projects/${id}`)
  },

  create(data: CreateProjectDto) {
    return request.post<ApiResponse<Project>>('/api/v1/projects', data)
  },

  update(id: string, data: Partial<CreateProjectDto>) {
    return request.put<ApiResponse<Project>>(`/api/v1/projects/${id}`, data)
  },

  delete(id: string) {
    return request.delete<ApiResponse<void>>(`/api/v1/projects/${id}`)
  },

  getMembers(projectId: string) {
    return request.get<ApiResponse<ProjectMember[]>>(`/api/v1/projects/${projectId}/members`)
  },

  addMember(projectId: string, data: { userId: string; projectRole: string }) {
    return request.post<ApiResponse<void>>(`/api/v1/projects/${projectId}/members`, data)
  },
}
```

### 4.4 Element Plus 使用规范

```vue
<!-- ✅ 表格 -->
<el-table :data="projectList" v-loading="loading" border stripe>
  <el-table-column prop="projectCode" label="项目编号" width="160" />
  <el-table-column prop="projectName" label="项目名称" min-width="200" />
  <el-table-column prop="countryCode" label="国家" width="80">
    <template #default="{ row }">
      <StatusTag :type="'country'" :value="row.countryCode" />
    </template>
  </el-table-column>
  <el-table-column label="操作" width="200" fixed="right">
    <template #default="{ row }">
      <PermissionButton :permission="'project:update'" @click="handleEdit(row)" />
    </template>
  </el-table-column>
</el-table>

<!-- ✅ 表单 -->
<el-form ref="formRef" :model="formData" :rules="rules" label-width="120px">
  <el-form-item label="项目名称" prop="projectName">
    <el-input v-model="formData.projectName" maxlength="100" show-word-limit />
  </el-form-item>
</el-form>

<!-- ✅ 对话框 -->
<el-dialog
  v-model="visible"
  :title="isEdit ? '编辑项目' : '创建项目'"
  width="680px"
  :close-on-click-modal="false"
  @closed="handleClosed"
>
  <!-- content -->
</el-dialog>
```

### 4.5 权限控制

```vue
<!-- ✅ 组件级别 -->
<PermissionButton permission="project:delete" :data="row" @click="handleDelete(row)" />

<!-- ✅ 指令级别 -->
<el-button v-permission="'file:download'" @click="handleDownload">下载</el-button>

<!-- ✅ 编码级别 -->
<script setup>
const { hasPermission, hasRole } = usePermission()
const canEdit = computed(() => hasPermission('project:update') || hasRole('PROJECT_MANAGER'))
</script>
```

### 4.6 文件上传组件使用模式

```vue
<script setup lang="ts">
import FileUploader from '@/components/FileUploader/index.vue'

const handleUploadSuccess = (file: UploadedFile) => {
  // 上传成功后联动：更新档案目录项状态
  archiveStore.updateItemStatus(props.archiveItemId, 'Uploaded')
}
</script>

<template>
  <FileUploader
    :project-id="projectId"
    :archive-item-id="archiveItemId"
    :allowed-types="['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'png']"
    :max-size="100 * 1024 * 1024"
    @upload-success="handleUploadSuccess"
  />
</template>
```

---

## 五、数据库规范

### 5.1 命名约定

| 对象 | 规范 | 示例 |
|---|---|---|
| 表名 | 小写复数 + 下划线 | `projects`, `archive_template_items` |
| 主键 | `id` (UUID, varchar) | `id` |
| 外键 | `xxx_id` | `project_id`, `user_id` |
| 时间戳 | `created_at`, `updated_at` | — |
| 软删除 | `deleted_at` (nullable datetime) | — |
| 状态字段 | `status` (enum 或 varchar) | — |
| 枚举值 | PascalCase | `Draft`, `Active`, `Approved` |

### 5.2 Prisma Schema 模式

```prisma
model Project {
  id              String    @id @default(uuid())
  projectCode     String    @unique @map("project_code")
  projectName     String    @map("project_name")
  countryCode     String    @map("country_code")
  city            String?
  customerName    String?   @map("customer_name")
  projectType     String?   @map("project_type")
  contractCurrency String?  @map("contract_currency")
  baseCurrency    String?   @map("base_currency")
  contractAmount  Decimal?  @map("contract_amount") @db.Decimal(18, 2)
  projectLanguage String?   @map("project_language")
  currentStage    String?   @map("current_stage")
  projectStatus   String    @default("Draft") @map("project_status")
  riskLevel       String    @default("Low") @map("risk_level")
  startDate       DateTime? @map("start_date")
  plannedEndDate  DateTime? @map("planned_end_date")
  actualEndDate   DateTime? @map("actual_end_date")
  createdBy       String?   @map("created_by")
  deletedAt       DateTime? @map("deleted_at")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  // 关联
  members         ProjectMember[]
  archiveItems    ProjectArchiveItem[]
  files           File[]
  checklistItems  ProjectChecklistItem[]

  @@index([projectStatus])
  @@index([countryCode])
  @@index([deletedAt])
  @@map("projects")
}
```

### 5.3 金额字段专门处理

```typescript
// ✅ Service 层金额处理
async calculateAmount(amountInOriginal: Decimal, fromCurrency: string, toCurrency: string) {
  const rate = await this.exchangeRateService.getRate(fromCurrency, toCurrency);
  return {
    originalAmount: amountInOriginal,
    originalCurrency: fromCurrency,
    exchangeRate: rate.rate,
    convertedCurrency: toCurrency,
    convertedAmount: new Decimal(amountInOriginal).times(rate.rate),
    rateDate: rate.rateDate,
    rateSource: rate.source,
  };
}
```

---

## 六、测试规范

### 6.1 测试分层

```
单元测试（Vitest/Jest） —— Service、Util、Composable 独立逻辑
集成测试 —— Controller + Service + DB（需要 Prisma 测试环境）
E2E —— 关键业务链路（项目创建→档案生成→文件上传→审核通过）
权限测试 —— 不同角色 × 不同资源 × 不同动作 矩阵
```

### 6.2 测试文件位置

```
后端：src/modules/project/__tests__/project.service.spec.ts
前端：src/views/project/__tests__/project-list.spec.ts
```

### 6.3 测试覆盖率目标

- 后端 Service：≥ 80%
- 后端 Controller：≥ 60%（核心链路）
- 前端组件：≥ 50%（关键业务组件）
- 权限测试：100% 矩阵覆盖

---

## 七、Git 规范

### 7.1 分支策略

```
main          —— 生产分支，永远可部署
develop       —— 开发主分支
feature/*     —— 功能分支（从 develop 切出，合回 develop）
fix/*         —— 修复分支
release/*     —— 发布分支
```

### 7.2 Commit 格式（Conventional Commits）

```
feat(project): 项目创建和列表查询功能
fix(archive): 档案目录生成国家差异未应用的问题
refactor(user): 提取用户权限校验为独立 Guard
docs(readme): 更新部署说明
test(auth): 补充登录失败次数限制测试
chore(deps): 升级 NestJS 到 10.3.0
```

### 7.3 提交前检查

- [ ] pnpm lint 通过
- [ ] pnpm test 通过（相关测试）
- [ ] 无 console.log 残留（调试用）
- [ ] 无 hardcode 的配置值
- [ ] 敏感文件未提交（.env、密钥等）

---

## 八、添加新模块的标准流程

假设要添加一个「项目评论」新模块，按以下步骤操作：

```
1. Prisma Schema 新增 Comment Model → prisma migrate dev
2. 后端创建 modules/comment/（module + controller + service + dto）
3. 在 app.module.ts 注册 CommentModule
4. 前端创建 types/comment.ts（类型定义）
5. 前端创建 api/comment.ts（API 调用）
6. 前端创建 views/comment/（页面组件）
7. 在 router/index.ts 添加路由
8. 在 BasicLayout.vue 菜单中添加入口
9. 后端升级 Guard 或 Decorator（如需新权限）
10. 测试验证整个链路
```

**严格遵守：不跳过任何步骤。**

---

## 九、常见错误（禁止列表）

| 错误 | 修正 |
|---|---|
| 在 Controller 里直接调用 Prisma | 必须通过 Service 层 |
| 硬编码国家代码或币种 | 从数据库配置读取 |
| 金额只存一个数字 | 存原币+汇率+折算五要素 |
| API 返回直接使用 Prisma 模型对象 | 使用 DTO 映射，排除敏感字段 |
| 前端的 fetch 直接写 URL 字符串 | 使用 api/ 层的封装函数 |
| 修改已有 API 的响应字段名 | 版本号升级或确保前端同步更新 |
| 密码明文存储 | 始终 bcrypt |
| 使用 any 类型 | 定义具体 interface / type |
| 忽略软删除查询条件 | 所有查询添加 `deletedAt: null` |

---

## 十、AI 交互规范

### 10.1 给 AI 的指令优先级

1. AGENTS.md（本文）优先级最高
2. 产品范围（docs/requirements/产品与业务范围.md）次之
3. 当前架构（docs/design/系统架构.md、docs/design/数据与权限架构.md）再次之
4. 用户当前消息最末

### 10.2 代码生成要求

- 始终生成完整可运行的代码，不允许 `// TODO` 或 `// ...`
- 类型定义必须完整
- 新模块必须包含基础 CRUD
- 权限注解不能遗漏
- Swagger 文档注解不能遗漏
- 返回给用户时，简要说明做了什么、生成/修改了哪些文件

### 10.3 对用户的输出格式

- 文件创建后使用工作区绝对路径链接
- 不要用代码块展示完整的文件内容（用户自己打开看）
- 描述变更时用"做了什么"而非"文件内容是什么"
