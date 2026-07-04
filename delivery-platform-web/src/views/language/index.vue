<script setup lang="ts">
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { languageApi } from '@/api/language'
import { countryApi } from '@/api/country'
import { currencyApi } from '@/api/currency'
import type { Language, Translation, CreateTranslationDto } from '@/types/language'
import type { Country } from '@/types/country'
import type { Currency } from '@/types/currency'
import { getTranslationFieldOptions } from '@/utils/translation'

// ====== Language tab ======
const loading = ref(false)
const languageList = ref<Language[]>([])
const countryList = ref<Country[]>([])
const currencyList = ref<Currency[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentId = ref('')
const languageForm = reactive({
  languageCode: '',
  languageName: '',
})
const languageFormRules = {
  languageCode: [{ required: true, message: '请输入语言代码', trigger: 'blur' }],
  languageName: [{ required: true, message: '请输入语言名称', trigger: 'blur' }],
}

const fetchLanguages = async () => {
  loading.value = true
  try {
    const res = await languageApi.getList()
    languageList.value = res
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

const openCreateLanguage = () => {
  isEdit.value = false
  currentId.value = ''
  languageForm.languageCode = ''
  languageForm.languageName = ''
  dialogVisible.value = true
}

const openEditLanguage = (row: Language) => {
  isEdit.value = true
  currentId.value = row.id
  languageForm.languageCode = row.languageCode
  languageForm.languageName = row.languageName
  dialogVisible.value = true
}

const handleLanguageSubmit = async () => {
  try {
    if (isEdit.value) {
      await languageApi.update(currentId.value, { languageName: languageForm.languageName })
      Message.success('更新成功')
    } else {
      await languageApi.create({
        languageCode: languageForm.languageCode,
        languageName: languageForm.languageName,
      })
      Message.success('创建成功')
    }
    dialogVisible.value = false
    fetchLanguages()
  } catch {
    // handled by interceptor
  }
}

const handleDeleteLanguage = (row: Language) => {
  arcoConfirm(`确定禁用语言 "${row.languageName}" 吗？`, '确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await languageApi.delete(row.id)
      Message.success('禁用成功')
      fetchLanguages()
    } catch {
      // handled by interceptor
    }
  }).catch(() => {
    // cancelled
  })
}

const statusTagType = (status: string) => {
  return status === 'Active' ? 'success' : 'info'
}

// ====== Translation tab ======
const activeTab = ref('language')
const translationLoading = ref(false)
const translationList = ref<Translation[]>([])
const translationQuery = reactive({
  contentType: 'ui',
  contentId: '',
})
const translationDialogVisible = ref(false)
const translationForm = reactive<CreateTranslationDto>({
  contentType: '',
  contentId: '',
  fieldName: '',
  languageCode: '',
  fieldValue: '',
})
const translationFormRules = {
  contentType: [{ required: true, message: '请输入内容类型', trigger: 'blur' }],
  contentId: [{ required: true, message: '请选择内容', trigger: 'change' }],
  fieldName: [{ required: true, message: '请输入字段名', trigger: 'blur' }],
  languageCode: [{ required: true, message: '请输入语言代码', trigger: 'blur' }],
  fieldValue: [{ required: true, message: '请输入翻译内容', trigger: 'blur' }],
}

const fetchTranslations = async () => {
  if (translationQuery.contentType !== 'ui' && !translationQuery.contentId) return
  translationLoading.value = true
  try {
    const res = await languageApi.getTranslations({
      contentType: translationQuery.contentType,
      contentId: translationQuery.contentId || undefined,
    })
    translationList.value = res
  } catch {
    // handled by interceptor
  } finally {
    translationLoading.value = false
  }
}

const openEditTranslation = (row: Translation) => {
  translationForm.contentType = row.contentType
  translationForm.contentId = row.contentId
  translationForm.fieldName = row.fieldName
  translationForm.languageCode = row.languageCode
  translationForm.fieldValue = row.fieldValue
  translationDialogVisible.value = true
}

const openAddTranslation = () => {
  if (!translationQuery.contentId) {
    Message.warning('请先选择翻译对象')
    return
  }
  translationForm.contentType = translationQuery.contentType
  translationForm.contentId = translationQuery.contentId
  translationForm.fieldName = ''
  translationForm.languageCode = ''
  translationForm.fieldValue = ''
  translationDialogVisible.value = true
}

const handleTranslationSubmit = async () => {
  try {
    await languageApi.upsertTranslation(translationForm)
    Message.success('翻译保存成功')
    translationDialogVisible.value = false
    fetchTranslations()
  } catch {
    // handled by interceptor
  }
}

const handleDeleteTranslation = (row: Translation) => {
  arcoConfirm('确定删除此翻译记录吗？', '确认', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await languageApi.deleteTranslation(row.id)
      Message.success('删除成功')
      fetchTranslations()
    } catch {
      // handled by interceptor
    }
  }).catch(() => {
    // cancelled
  })
}

const contentOptions = computed(() => {
  if (translationQuery.contentType === 'country') {
    return countryList.value.map((item) => ({ value: item.id, label: item.nameZh }))
  }
  if (translationQuery.contentType === 'currency') {
    return currencyList.value.map((item) => ({ value: item.id, label: item.currencyName }))
  }
  if (translationQuery.contentType === 'ui') {
    return []
  }
  return languageList.value.map((item) => ({ value: item.id, label: item.languageName }))
})
const translationFieldOptions = computed(() =>
  getTranslationFieldOptions(translationForm.contentType),
)
const translationFieldLabels = computed(() =>
  new Map(
    getTranslationFieldOptions(translationQuery.contentType).map((item) => [
      item.value,
      item.label,
    ]),
  ),
)
const contentLabels = computed(() =>
  new Map(contentOptions.value.map((item) => [item.value, item.label])),
)

watch(() => translationQuery.contentType, () => {
  translationQuery.contentId = ''
  translationList.value = []
  if (translationQuery.contentType === 'ui') {
    fetchTranslations()
  }
})

onMounted(async () => {
  const [countries, currencies] = await Promise.all([
    countryApi.getList({ page: 1, pageSize: 100 }),
    currencyApi.getList(),
  ])
  countryList.value = countries.list
  currencyList.value = currencies
  await fetchLanguages()
})
</script>

<template>
  <div class="language-page">
    <a-tabs v-model="activeTab">
      <!-- Language Management Tab -->
      <a-tab-pane label="语言管理" name="language">
        <a-card class="table-card">
          <div class="table-header">
            <span class="table-title">语言列表</span>
            <a-button type="primary" @click="openCreateLanguage">
              <a-icon><Plus /></a-icon> 新增语言
            </a-button>
          </div>

          <a-table
            v-loading="loading"
            :data="languageList"
            border
            stripe
          >
            <a-table-column prop="languageCode" label="语言代码" :width="120" />
            <a-table-column prop="languageName" label="语言名称" :min-width="200" />
            <a-table-column prop="status" label="状态" :width="90">
              <template #default="{ row }">
                <a-tag :type="statusTagType(row.status)" size="small">
                  {{ row.status === 'Active' ? '活跃' : '禁用' }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column label="操作" :width="160" fixed="right">
              <template #default="{ row }">
                <a-button
                  type="primary"
                  text
                  size="small"
                  @click="openEditLanguage(row)"
                >
                  编辑
                </a-button>
                <a-button
                  status="danger" type="secondary"
                  text
                  size="small"
                  @click="handleDeleteLanguage(row)"
                >
                  禁用
                </a-button>
              </template>
            </a-table-column>
          </a-table>
        </a-card>
      </a-tab-pane>

      <!-- Translation Tab -->
      <a-tab-pane label="翻译管理" name="translation">
        <a-card class="search-card">
          <a-form :model="translationQuery" inline>
            <a-form-item label="内容类型">
              <a-select v-model="translationQuery.contentType" placeholder="选择类型">
                <a-option label="国家" value="country" />
                <a-option label="币种" value="currency" />
                <a-option label="语言" value="language" />
                <a-option label="平台中文基准字库" value="ui" />
              </a-select>
            </a-form-item>
            <a-form-item v-if="translationQuery.contentType !== 'ui'" label="翻译对象">
              <a-select
                v-model="translationQuery.contentId"
                filterable
                placeholder="选择需要翻译的内容"
                style="width:220px"
              >
                <a-option
                  v-for="item in contentOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
            <a-form-item>
              <a-button type="primary" @click="fetchTranslations">
                查询
              </a-button>
            </a-form-item>
          </a-form>
          <a-alert
            v-if="translationQuery.contentType === 'ui'"
            title="平台字段以简体中文为基准，当前维护简体中文与 English 两套字库。"
            type="info"
            :closable="false"
          />
        </a-card>

        <a-card class="table-card">
          <div class="table-header">
            <span class="table-title">翻译列表</span>
            <a-button
              type="primary"
              :disabled="translationQuery.contentType === 'ui' || !translationQuery.contentId"
              @click="openAddTranslation"
            >
              <a-icon><Plus /></a-icon> 添加翻译
            </a-button>
          </div>

          <a-table
            v-loading="translationLoading"
            :data="translationList"
            border
            stripe
          >
            <a-table-column prop="contentType" label="内容类型" :width="100" />
            <a-table-column label="翻译对象" :min-width="160">
              <template #default="{ row }">
                {{ contentLabels.get(row.contentId) || row.contentId }}
              </template>
            </a-table-column>
            <a-table-column label="字段" :width="140">
              <template #default="{ row }">
                {{ translationFieldLabels.get(row.fieldName) || row.fieldName }}
              </template>
            </a-table-column>
            <a-table-column prop="languageCode" label="鐩爣语言" :width="110" />
            <a-table-column
              prop="fieldValue"
              label="翻译内容"
              :min-width="200"
              show-overflow-tooltip
            >
              <template #default="{ row }">
                <span class="translation-text">{{ row.fieldValue }}</span>
              </template>
            </a-table-column>
            <a-table-column prop="reviewStatus" label="审核状态" :width="100">
              <template #default="{ row }">
                <a-tag :type="row.reviewStatus === 'Approved' ? 'success' : 'warning'" size="small">
                  {{ row.reviewStatus === 'Approved' ? '已审核' : '草稿' }}
                </a-tag>
              </template>
            </a-table-column>
            <a-table-column label="操作" :width="150" fixed="right">
              <template #default="{ row }">
                <a-button
                  type="primary"
                  text
                  size="small"
                  @click="openEditTranslation(row)"
                >
                  编辑
                </a-button>
                <a-button
                  status="danger" type="secondary"
                  text
                  size="small"
                  @click="handleDeleteTranslation(row)"
                >
                  删除
                </a-button>
              </template>
            </a-table-column>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <!-- Language Create/Edit Dialog -->
    <a-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑语言' : '新增语言'"
      width="420px"
      :close-on-click-modal="false"
    >
      <a-form :model="languageForm" :rules="languageFormRules" label-width="100px">
        <a-form-item label="语言代码" prop="languageCode">
          <a-input v-model="languageForm.languageCode" :disabled="isEdit" :maxlength="10" />
        </a-form-item>
        <a-form-item label="语言名称" prop="languageName">
          <a-input v-model="languageForm.languageName" :maxlength="50" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="dialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleLanguageSubmit">
          保存
        </a-button>
      </template>
    </a-dialog>

    <!-- Translation Dialog -->
    <a-dialog
      v-model="translationDialogVisible"
      title="添加翻译"
      width="520px"
      :close-on-click-modal="false"
    >
      <a-form :model="translationForm" :rules="translationFormRules" label-width="100px">
        <a-form-item label="内容类型" prop="contentType">
          <a-input v-model="translationForm.contentType" :disabled="true" />
        </a-form-item>
        <a-form-item label="翻译对象" prop="contentId">
          <a-input :model-value="contentLabels.get(translationForm.contentId) || translationForm.contentId" disabled />
        </a-form-item>
        <a-form-item label="翻译字段" prop="fieldName">
          <a-select v-model="translationForm.fieldName" placeholder="请选择字段">
            <a-option
              v-for="item in translationFieldOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="鐩爣语言" prop="languageCode">
          <a-select v-model="translationForm.languageCode" filterable placeholder="请选择语言">
            <a-option
              v-for="item in languageList.filter(language => language.status === 'Active')"
              :key="item.id"
              :label="item.languageName"
              :value="item.languageCode"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="翻译内容" prop="fieldValue">
          <a-textarea v-model="translationForm.fieldValue" :rows="3" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="translationDialogVisible = false">
          取消
        </a-button>
        <a-button type="primary" @click="handleTranslationSubmit">
          保存
        </a-button>
      </template>
    </a-dialog>
  </div>
</template>

<style scoped lang="scss">
.translation-text {
  max-width: 300px;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
