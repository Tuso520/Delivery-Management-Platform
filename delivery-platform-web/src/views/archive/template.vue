<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import {
  archiveTemplateApi,
  type ArchiveTemplateItemPayload,
} from '@/api/archive-template'
import { countryApi } from '@/api/country'
import { languageApi } from '@/api/language'
import { dictionaryApi, referenceApi } from '@/api/platform'
import type { ArchiveTemplate, ArchiveTemplateItem } from '@/types/archive'
import type { Country } from '@/types/country'
import type { Language } from '@/types/language'
import type { DictionaryItem, RoleOption } from '@/types/platform'
import {
  flattenArchiveTemplateItems,
  parseAllowedFileTypes,
} from '@/utils/archive-template'

interface TemplateForm {
  templateCode: string
  templateName: string
  projectType: string
  countryCode: string
  languageCode: string
  version: string
  status: string
  description: string
}

const loading = ref(false)
const records = ref<ArchiveTemplate[]>([])
const countries = ref<Country[]>([])
const languages = ref<Language[]>([])
const projectTypes = ref<DictionaryItem[]>([])
const archiveStages = ref<DictionaryItem[]>([])
const fileTypes = ref<DictionaryItem[]>([])
const roles = ref<RoleOption[]>([])
const query = reactive({
  projectType: '',
  countryCode: '',
  languageCode: '',
})

const templateDialogVisible = ref(false)
const editingTemplateId = ref('')
const templateForm = reactive<TemplateForm>({
  templateCode: '',
  templateName: '',
  projectType: '',
  countryCode: '',
  languageCode: '',
  version: 'V1.0',
  status: 'Active',
  description: '',
})

const drawerVisible = ref(false)
const itemLoading = ref(false)
const selectedTemplate = ref<ArchiveTemplate>()
const templateItems = ref<ArchiveTemplateItem[]>([])
const itemDialogVisible = ref(false)
const editingItemId = ref('')
const itemForm = reactive<ArchiveTemplateItemPayload>({
  parentId: '',
  stageCode: '',
  name: '',
  secondName: '',
  usageDescription: '',
  isRequired: true,
  isStar: false,
  isSensitive: false,
  needReview: false,
  responsibleRole: '',
  reviewRole: '',
  evidenceFileTypes: [],
  sortOrder: 0,
})

const parentOptions = computed(() =>
  flattenArchiveTemplateItems(templateItems.value).filter(
    (item) => item.id !== editingItemId.value,
  ),
)

async function fetchRecords(): Promise<void> {
  loading.value = true
  try {
    records.value = await archiveTemplateApi.getList({
      projectType: query.projectType || undefined,
      countryCode: query.countryCode || undefined,
      languageCode: query.languageCode || undefined,
    })
  } finally {
    loading.value = false
  }
}

function resetTemplateForm(): void {
  Object.assign(templateForm, {
    templateCode: '',
    templateName: '',
    projectType: '',
    countryCode: '',
    languageCode: '',
    version: 'V1.0',
    status: 'Active',
    description: '',
  })
}

function openCreateTemplate(): void {
  editingTemplateId.value = ''
  resetTemplateForm()
  templateDialogVisible.value = true
}

function openEditTemplate(row: ArchiveTemplate): void {
  editingTemplateId.value = row.id
  Object.assign(templateForm, {
    templateCode: row.templateCode,
    templateName: row.templateName,
    projectType: row.projectType ?? '',
    countryCode: row.countryCode ?? '',
    languageCode: row.languageCode ?? '',
    version: row.version,
    status: row.status,
    description: row.description ?? '',
  })
  templateDialogVisible.value = true
}

async function saveTemplate(): Promise<void> {
  if (!templateForm.templateCode.trim() || !templateForm.templateName.trim()) {
    Message.warning('请填写模板编码和名称')
    return
  }
  const payload = {
    templateName: templateForm.templateName,
    projectType: templateForm.projectType || undefined,
    countryCode: templateForm.countryCode || undefined,
    languageCode: templateForm.languageCode || undefined,
    version: templateForm.version,
    status: templateForm.status,
    description: templateForm.description || undefined,
  }
  if (editingTemplateId.value) {
    await archiveTemplateApi.update(editingTemplateId.value, payload)
  } else {
    await archiveTemplateApi.create({
      templateCode: templateForm.templateCode,
      ...payload,
    })
  }
  Message.success('档案模板已保存')
  templateDialogVisible.value = false
  await fetchRecords()
}

async function deactivateTemplate(row: ArchiveTemplate): Promise<void> {
  await arcoConfirm(
    `停用模板“${row.templateName}”后将不再用于新项目，已有项目档案不受影响。`,
    '停用模板',
    { type: 'warning' },
  )
  await archiveTemplateApi.delete(row.id)
  Message.success('模板已停用')
  await fetchRecords()
}

async function fetchItems(): Promise<void> {
  if (!selectedTemplate.value) return
  itemLoading.value = true
  try {
    templateItems.value = await archiveTemplateApi.getItems(
      selectedTemplate.value.id,
      true,
    )
  } finally {
    itemLoading.value = false
  }
}

async function openItems(row: ArchiveTemplate): Promise<void> {
  selectedTemplate.value = row
  drawerVisible.value = true
  await fetchItems()
}

function resetItemForm(parentId = ''): void {
  Object.assign(itemForm, {
    parentId,
    stageCode: '',
    name: '',
    secondName: '',
    usageDescription: '',
    isRequired: true,
    isStar: false,
    isSensitive: false,
    needReview: false,
    responsibleRole: '',
    reviewRole: '',
    evidenceFileTypes: [],
    sortOrder: 0,
  })
}

function openCreateItem(parent?: ArchiveTemplateItem): void {
  editingItemId.value = ''
  resetItemForm(parent?.id)
  itemForm.stageCode = parent?.stageCode ?? archiveStages.value[0]?.itemValue ?? ''
  itemDialogVisible.value = true
}

function openEditItem(item: ArchiveTemplateItem): void {
  editingItemId.value = item.id
  Object.assign(itemForm, {
    parentId: item.parentId ?? '',
    stageCode: item.stageCode,
    name: item.name,
    secondName: item.secondName ?? '',
    usageDescription: item.usageDescription ?? '',
    isRequired: item.isRequired,
    isStar: item.isStar,
    isSensitive: item.isSensitive,
    needReview: item.needReview,
    responsibleRole: item.responsibleRole ?? '',
    reviewRole: item.reviewRole ?? '',
    evidenceFileTypes: parseAllowedFileTypes(item.allowedFileTypes),
    sortOrder: item.sortOrder,
  })
  itemDialogVisible.value = true
}

async function saveItem(): Promise<void> {
  if (!selectedTemplate.value || !itemForm.stageCode || !itemForm.name.trim()) {
    Message.warning('请选择阶段并填写目录名称')
    return
  }
  const payload: ArchiveTemplateItemPayload = {
    ...itemForm,
    parentId: itemForm.parentId || undefined,
    secondName: itemForm.secondName || undefined,
    usageDescription: itemForm.usageDescription || undefined,
    responsibleRole: itemForm.responsibleRole || undefined,
    reviewRole: itemForm.reviewRole || undefined,
  }
  if (editingItemId.value) {
    await archiveTemplateApi.updateItem(editingItemId.value, payload)
  } else {
    await archiveTemplateApi.createItem(selectedTemplate.value.id, payload)
  }
  Message.success('目录项已保存')
  itemDialogVisible.value = false
  await fetchItems()
}

async function deleteItem(item: ArchiveTemplateItem): Promise<void> {
  await arcoConfirm(
    `确定删除目录项“${item.name}”吗？已用于项目的目录项不会被删除。`,
    '删除目录项',
    { type: 'warning' },
  )
  await archiveTemplateApi.deleteItem(item.id)
  Message.success('目录项已删除')
  await fetchItems()
}

onMounted(async () => {
  const [countryPage, languageList, projectTypeDict, stageDict, fileTypeDict, roleList] =
    await Promise.all([
      countryApi.getList({ page: 1, pageSize: 100 }),
      languageApi.getList(),
      dictionaryApi.getByCode('project_type'),
      dictionaryApi.getByCode('archive_stage'),
      dictionaryApi.getByCode('archive_file_type'),
      referenceApi.getRoleOptions(),
    ])
  countries.value = countryPage.list
  languages.value = languageList
  projectTypes.value = projectTypeDict.items
  archiveStages.value = stageDict.items
  fileTypes.value = fileTypeDict.items
  roles.value = roleList
  await fetchRecords()
})
</script>

<template>
  <section class="template-page">
    <div class="page-toolbar">
      <div>
        <h2>档案模板</h2>
        <p>按项目类型、国家与语言配置交付档案目录</p>
      </div>
      <a-button v-permission="'archive_template:create'" type="primary" @click="openCreateTemplate">
        <a-icon><Plus /></a-icon>
        新建模板
      </a-button>
    </div>

    <a-form class="filter-bar" :model="query" inline>
      <a-form-item label="项目类型">
        <a-select v-model="query.projectType" clearable @change="fetchRecords">
          <a-option
            v-for="item in projectTypes"
            :key="item.id"
            :label="item.itemLabel"
            :value="item.itemValue"
          />
        </a-select>
      </a-form-item>
      <a-form-item label="国家">
        <a-select
          v-model="query.countryCode"
          clearable
          filterable
          @change="fetchRecords"
        >
          <a-option
            v-for="item in countries"
            :key="item.id"
            :label="item.nameZh"
            :value="item.countryCode"
          />
        </a-select>
      </a-form-item>
      <a-form-item label="语言">
        <a-select v-model="query.languageCode" clearable @change="fetchRecords">
          <a-option
            v-for="item in languages"
            :key="item.id"
            :label="item.languageName"
            :value="item.languageCode"
          />
        </a-select>
      </a-form-item>
    </a-form>

    <a-table
      v-loading="loading"
      :data="records"
      border
      stripe
    >
      <a-table-column prop="templateCode" label="模板编码" :width="170" />
      <a-table-column prop="templateName" label="模板名称" :min-width="220" />
      <a-table-column prop="projectType" label="项目类型" :width="130" />
      <a-table-column prop="countryCode" label="国家" :width="90" />
      <a-table-column prop="languageCode" label="语言" :width="100" />
      <a-table-column prop="_count.items" label="目录项" :width="90" />
      <a-table-column prop="version" label="版本" :width="90" />
      <a-table-column label="操作" :width="240" fixed="right">
        <template #default="{ row }">
          <a-button text type="primary" @click="openItems(row)">
            配置目录
          </a-button>
          <a-button v-permission="'archive_template:update'" text @click="openEditTemplate(row)">
            编辑
          </a-button>
          <a-button
            v-permission="'archive_template:delete'"
            text
            status="danger" type="secondary"
            @click="deactivateTemplate(row)"
          >
            停用
          </a-button>
        </template>
      </a-table-column>
    </a-table>

    <a-dialog
      v-model="templateDialogVisible"
      :title="editingTemplateId ? '编辑档案模板' : '新建档案模板'"
      width="680px"
      :close-on-click-modal="false"
    >
      <a-form :model="templateForm" label-width="100px">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="模板编码" required>
              <a-input v-model="templateForm.templateCode" :disabled="Boolean(editingTemplateId)" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="模板名称" required>
              <a-input v-model="templateForm.templateName" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="项目类型">
              <a-select v-model="templateForm.projectType" clearable>
                <a-option
                  v-for="item in projectTypes"
                  :key="item.id"
                  :label="item.itemLabel"
                  :value="item.itemValue"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="国家">
              <a-select v-model="templateForm.countryCode" clearable filterable>
                <a-option
                  v-for="item in countries"
                  :key="item.id"
                  :label="item.nameZh"
                  :value="item.countryCode"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="语言">
              <a-select v-model="templateForm.languageCode" clearable>
                <a-option
                  v-for="item in languages"
                  :key="item.id"
                  :label="item.languageName"
                  :value="item.languageCode"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="版本">
              <a-input v-model="templateForm.version" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="说明">
          <a-textarea v-model="templateForm.description" :rows="3" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="templateDialogVisible = false">
          取消
        </a-button><a-button type="primary" @click="saveTemplate">
          保存
        </a-button>
      </template>
    </a-dialog>

    <a-drawer v-model="drawerVisible" size="86%" :title="`${selectedTemplate?.templateName ?? ''} · 目录配置`">
      <div class="drawer-toolbar">
        <span>目录项按阶段和层级展示，编号由系统自动生成</span>
        <a-button v-permission="'archive_template:update'" type="primary" @click="openCreateItem()">
          <a-icon><Plus /></a-icon>
          新增根目录        </a-button>
      </div>
      <a-table
        v-loading="itemLoading"
        :data="templateItems"
        row-key="id"
        border
        default-expand-all
        :tree-props="{ children: 'children' }"
      >
        <a-table-column prop="name" label="目录名称" :min-width="260" />
        <a-table-column prop="stageCode" label="阶段" :width="145" />
        <a-table-column prop="responsibleRole" label="负责角色" :width="150" />
        <a-table-column
          prop="allowedFileTypes"
          label="文件类型"
          :min-width="160"
          show-overflow-tooltip
        />
        <a-table-column label="规则" :width="220">
          <template #default="{ row }">
            <a-tag v-if="row.isRequired" size="small">
              必需
            </a-tag>
            <a-tag v-if="row.needReview" size="small" color="orange">
              需审核
            </a-tag>
            <a-tag v-if="row.isSensitive" size="small" color="red">
              敏感
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="230" fixed="right">
          <template #default="{ row }">
            <a-button text type="primary" @click="openCreateItem(row)">
              新增下级
            </a-button>
            <a-button text @click="openEditItem(row)">
              编辑
            </a-button>
            <a-button text status="danger" type="secondary" @click="deleteItem(row)">
              删除
            </a-button>
          </template>
        </a-table-column>
      </a-table>
    </a-drawer>

    <a-dialog
      v-model="itemDialogVisible"
      :title="editingItemId ? '编辑目录项' : '新增目录项'"
      width="760px"
      :close-on-click-modal="false"
      append-to-body
    >
      <a-form :model="itemForm" label-width="110px">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="所属阶段" required>
              <a-select v-model="itemForm.stageCode">
                <a-option
                  v-for="item in archiveStages"
                  :key="item.id"
                  :label="item.itemLabel"
                  :value="item.itemValue"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="父级目录">
              <a-select v-model="itemForm.parentId" clearable filterable>
                <a-option
                  v-for="item in parentOptions"
                  :key="item.id"
                  :label="item.label"
                  :value="item.id"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="目录名称" required>
              <a-input v-model="itemForm.name" :maxlength="200" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="第二名称">
              <a-input v-model="itemForm.secondName" :maxlength="200" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="负责角色">
              <a-select v-model="itemForm.responsibleRole" clearable filterable>
                <a-option
                  v-for="role in roles"
                  :key="role.id"
                  :label="role.roleName"
                  :value="role.roleCode"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="审核角色">
              <a-select v-model="itemForm.reviewRole" clearable filterable>
                <a-option
                  v-for="role in roles"
                  :key="role.id"
                  :label="role.roleName"
                  :value="role.roleCode"
                />
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="允许文件类型">
          <a-select v-model="itemForm.evidenceFileTypes" multiple filterable>
            <a-option
              v-for="item in fileTypes"
              :key="item.id"
              :label="item.itemLabel"
              :value="item.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="用途说明">
          <a-textarea v-model="itemForm.usageDescription" :rows="3" />
        </a-form-item>
        <a-form-item label="目录规则" class="switches">
          <a-checkbox v-model="itemForm.isRequired">
            必需
          </a-checkbox>
          <a-checkbox v-model="itemForm.isStar">
            重点资料
          </a-checkbox>
          <a-checkbox v-model="itemForm.needReview">
            需要审核          </a-checkbox>
          <a-checkbox v-model="itemForm.isSensitive">
            敏感资料
          </a-checkbox>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="itemDialogVisible = false">
          取消
        </a-button><a-button type="primary" @click="saveItem">
          保存
        </a-button>
      </template>
    </a-dialog>
  </section>
</template>

<style scoped lang="scss">
.page-toolbar,.drawer-toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.drawer-toolbar { margin-bottom:16px; color:#68736e; font-size:13px; }
.arco-select { width:100%; }
.switches :deep(.arco-form-item__content) { gap:20px; }
:deep(.arco-tag + .arco-tag) { margin-left:4px; }
@media (max-width:900px) {
  .page-toolbar,.drawer-toolbar { align-items:flex-start; flex-direction:column; }
}
</style>
