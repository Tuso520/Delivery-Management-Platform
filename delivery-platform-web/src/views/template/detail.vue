<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { attachmentApi } from '@/api/attachment'
import type { Attachment } from '@/api/attachment'
import { useFilePreview } from '@/composables/useFilePreview'
import { downloadBlob } from '@/utils/blob'
import { countryApi } from '@/api/country'
import { dictionaryApi } from '@/api/platform'
import { languageApi } from '@/api/language'
import { roleApi } from '@/api/role'
import { templateApi } from '@/api/template'
import type { Country } from '@/types/country'
import type { Language } from '@/types/language'
import type { DictionaryItem } from '@/types/platform'
import type { Role } from '@/types/role'
import type { DocumentTemplate, DocumentTemplateVersion } from '@/types/template'

const route = useRoute()
const router = useRouter()
const filePreview = useFilePreview()
const templateId = computed(() => String(route.params.id ?? ''))
const isEdit = computed(() => Boolean(templateId.value && templateId.value !== 'create'))

const loading = ref(false)
const templateDetail = ref<DocumentTemplate | null>(null)
const versions = ref<DocumentTemplateVersion[]>([])
const attachments = ref<Attachment[]>([])
const countries = ref<Country[]>([])
const languages = ref<Language[]>([])
const roles = ref<Role[]>([])
const categories = ref<DictionaryItem[]>([])
const projectTypes = ref<DictionaryItem[]>([])
const stages = ref<DictionaryItem[]>([])
const fileFormats = ref<DictionaryItem[]>([])

const formData = ref({
  name: '',
  category: '',
  countryCode: '',
  projectType: '',
  stageCode: '',
  applicableRole: '',
  language: 'zh-CN',
  fileFormat: '',
})

const versionDialogVisible = ref(false)
const versionForm = ref({
  versionNo: '',
  changeNotes: '',
})
const versionFile = ref<File | null>(null)

const fetchOptions = async () => {
  const [
    countryPage,
    languageList,
    roleList,
    categoryDictionary,
    projectTypeDictionary,
    stageDictionary,
    formatDictionary,
  ] = await Promise.all([
    countryApi.getList({ page: 1, pageSize: 100 }),
    languageApi.getList(),
    roleApi.getList(),
    dictionaryApi.getByCode('template_category'),
    dictionaryApi.getByCode('project_type'),
    dictionaryApi.getByCode('project_stage'),
    dictionaryApi.getByCode('file_format'),
  ])
  countries.value = countryPage.list
  languages.value = languageList
  roles.value = roleList
  categories.value = categoryDictionary.items
  projectTypes.value = projectTypeDictionary.items
  stages.value = stageDictionary.items
  fileFormats.value = formatDictionary.items
}

const fetchAttachments = async () => {
  if (!isEdit.value) return
  const result = await attachmentApi.getList({
    ownerType: 'DocumentTemplate',
    ownerId: templateId.value,
    page: 1,
    pageSize: 100,
  })
  attachments.value = result.list
}

const fetchDetail = async () => {
  if (!templateId.value || templateId.value === 'create') return
  loading.value = true
  try {
    const res = await templateApi.getById(templateId.value)
    templateDetail.value = res
    const tpl = res
    formData.value = {
      name: tpl.name,
      category: tpl.category,
      countryCode: tpl.countryCode || '',
      projectType: tpl.projectType || '',
      stageCode: tpl.stageCode || '',
      applicableRole: tpl.applicableRole || '',
      language: tpl.language || 'zh-CN',
      fileFormat: tpl.fileFormat || '',
    }
    versions.value = tpl.versions || []
    await fetchAttachments()
  } catch {
    Message.error('加载模板详情失败')
  } finally {
    loading.value = false
  }
}

const handleSubmit = async () => {
  loading.value = true
  try {
    if (isEdit.value) {
      await templateApi.update(templateId.value, formData.value)
      Message.success('更新成功')
      await fetchDetail()
    } else {
      const created = await templateApi.create(formData.value)
      Message.success('模板已创建，请上传初始版本文件')
      await router.replace(`/template/${created.id}`)
      await fetchDetail()
    }
  } catch {
    Message.error(isEdit.value ? '更新失败' : '创建失败')
  } finally {
    loading.value = false
  }
}

const handleAddVersion = async () => {
  if (!versionFile.value) {
    Message.warning('请选择模板文件')
    return
  }
  try {
    const data = new FormData()
    data.append('files', versionFile.value)
    data.append('ownerType', 'DocumentTemplate')
    data.append('ownerId', templateId.value)
    data.append('category', 'template-version')
    data.append('remark', versionForm.value.changeNotes)
    const [attachment] = await attachmentApi.upload(data)
    if (!attachment) throw new Error('模板文件上传失败')
    await templateApi.addVersion(templateId.value, {
      versionNo: versionForm.value.versionNo,
      attachmentId: attachment.id,
      changeNotes: versionForm.value.changeNotes,
    })
    Message.success('版本添加成功')
    versionDialogVisible.value = false
    versionForm.value = { versionNo: '', changeNotes: '' }
    versionFile.value = null
    fetchDetail()
  } catch {
    Message.error('添加版本失败')
  }
}

const selectVersionFile = (event: Event) => {
  versionFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

const openAttachment = (item: Attachment) => {
  filePreview.openPreview({ source: 'attachment', id: item.id, title: item.originalName })
}

const downloadAttachment = async (item: Attachment) => {
  downloadBlob(await attachmentApi.getContent(item.id), item.originalName)
}

const deleteAttachment = async (item: Attachment) => {
  await arcoConfirm(`确认删除文件“${item.originalName}”？`, '删除模板附件', {
    type: 'warning',
  })
  await attachmentApi.delete(item.id)
  await fetchAttachments()
}

const handlePublish = async () => {
  try {
    await templateApi.publish(templateId.value)
    Message.success('发布成功')
    fetchDetail()
  } catch {
    Message.error('发布失败')
  }
}

onMounted(async () => {
  await fetchOptions()
  if (isEdit.value) {
    await fetchDetail()
  }
})
</script>

<template>
  <div class="template-detail-page">
    <a-card class="detail-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ isEdit ? '编辑模板' : '创建模板' }}</span>
          <div>
            <a-button @click="router.push('/template')">
              返回
            </a-button>
            <a-button v-if="isEdit && templateDetail?.status === 'Draft'" status="success" type="secondary" @click="handlePublish">
              发布
            </a-button>
          </div>
        </div>
      </template>

      <a-form v-loading="loading" :model="formData" label-width="120px">
        <a-row :gutter="24">
          <a-col :span="12">
            <a-form-item label="模板名称" required>
              <a-input v-model="formData.name" :maxlength="200" show-word-limit />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="模板分类" required>
              <a-select v-model="formData.category" style="width:100%">
                <a-option
                  v-for="opt in categories"
                  :key="opt.id"
                  :label="opt.itemLabel"
                  :value="opt.itemValue"
                />
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="24">
          <a-col :span="12">
            <a-form-item label="适用国家">
              <a-select
                v-model="formData.countryCode"
                clearable
                filterable
                style="width:100%"
              >
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
            <a-form-item label="项目类型">
              <a-select v-model="formData.projectType" clearable style="width:100%">
                <a-option
                  v-for="item in projectTypes"
                  :key="item.id"
                  :label="item.itemLabel"
                  :value="item.itemValue"
                />
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="24">
          <a-col :span="12">
            <a-form-item label="适用阶段">
              <a-select v-model="formData.stageCode" clearable style="width:100%">
                <a-option
                  v-for="item in stages"
                  :key="item.id"
                  :label="item.itemLabel"
                  :value="item.itemValue"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="适用角色">
              <a-select
                v-model="formData.applicableRole"
                clearable
                filterable
                style="width:100%"
              >
                <a-option
                  v-for="item in roles"
                  :key="item.id"
                  :label="item.roleName"
                  :value="item.roleCode"
                />
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row :gutter="24">
          <a-col :span="12">
            <a-form-item label="语言">
              <a-select v-model="formData.language" style="width:100%">
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
            <a-form-item label="文件格式">
              <a-select v-model="formData.fileFormat" clearable style="width:100%">
                <a-option
                  v-for="item in fileFormats"
                  :key="item.id"
                  :label="item.itemLabel"
                  :value="item.itemValue"
                />
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item>
          <a-button type="primary" :loading="loading" @click="handleSubmit">
            {{ isEdit ? '保存' : '创建' }}
          </a-button>
          <a-button @click="router.push('/template')">
            取消
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>

    <a-card v-if="isEdit" class="detail-card">
      <template #header>
        <span class="card-title">模板文件</span>
      </template>
      <a-table
        :data="attachments"
        border
        stripe
        size="small"
      >
        <a-table-column prop="originalName" label="文件名" :min-width="220" />
        <a-table-column prop="fileExt" label="格式" :width="80" />
        <a-table-column prop="uploader.realName" label="上传人" :width="110" />
        <a-table-column prop="createdAt" label="上传时间" :width="180" />
        <a-table-column label="操作" :width="170">
          <template #default="{ row }">
            <a-button text type="primary" @click="openAttachment(row)">
              预览
            </a-button>
            <a-button text @click="downloadAttachment(row)">
              下载
            </a-button>
            <a-button text status="danger" type="secondary" @click="deleteAttachment(row)">
              删除
            </a-button>
          </template>
        </a-table-column>
      </a-table>
      <a-empty v-if="!attachments.length" description="暂无模板文件，请新增版本上传" />
    </a-card>

    <!-- Version History -->
    <a-card v-if="isEdit" class="detail-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">版本历史</span>
          <a-button type="primary" size="small" @click="versionDialogVisible = true">
            新增版本
          </a-button>
        </div>
      </template>

      <a-table
        :data="versions"
        border
        stripe
        size="small"
      >
        <a-table-column prop="versionNo" label="版本号" :width="100" />
        <a-table-column
          prop="changeNotes"
          label="变更说明"
          :min-width="200"
          show-overflow-tooltip
        />
        <a-table-column prop="publishedAt" label="发布时间" :width="170" />
      </a-table>
    </a-card>

    <!-- Version Dialog -->
    <a-dialog
      v-model="versionDialogVisible"
      title="新增版本"
      width="500px"
      :close-on-click-modal="false"
    >
      <a-form :model="versionForm" label-width="100px">
        <a-form-item label="版本号" required>
          <a-input v-model="versionForm.versionNo" :maxlength="10" placeholder="如 V2.0" />
        </a-form-item>
        <a-form-item label="模板文件" required>
          <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md" @change="selectVersionFile" />
          <span v-if="versionFile" class="file-note">{{ versionFile.name }}</span>
        </a-form-item>
        <a-form-item label="变更说明">
          <a-textarea v-model="versionForm.changeNotes" :rows="3" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="versionDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleAddVersion">
          确定
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>

<style scoped lang="scss">
.template-detail-page { min-width: 0; }

.detail-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}
.file-note { margin-left:10px; color:var(--app-text-muted); }
</style>
