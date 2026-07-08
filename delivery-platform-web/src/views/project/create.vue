<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { countryApi } from '@/api/country'
import { currencyApi } from '@/api/currency'
import { dictionaryApi } from '@/api/platform'
import { languageApi } from '@/api/language'
import { projectApi } from '@/api/project'
import { userApi } from '@/api/user'
import type { Country } from '@/types/country'
import type { Currency } from '@/types/currency'
import type { Language } from '@/types/language'
import type { CreateProjectDto, UpdateProjectDto } from '@/types/project'
import type { UserListItem } from '@/types/user'
import { useLocaleStore } from '@/store/locale'
import {
  localizeProjectRisk,
  localizeProjectStage,
  localizeProjectStatus,
} from '@/utils/project-localization'

const route = useRoute()
const router = useRouter()
const localeStore = useLocaleStore()

const projectId = computed(() => String(route.params.id || ''))
const isEdit = computed(() => Boolean(projectId.value))
const loading = ref(false)
const optionLoading = ref(false)
const formRef = ref()

const countryOptions = ref<{ value: string; label: string }[]>([])
const currencyOptions = ref<{ value: string; label: string }[]>([])
const languageOptions = ref<{ value: string; label: string }[]>([])
const userOptions = ref<{ value: string; label: string }[]>([])
const projectTypeOptions = ref<{ value: string; label: string }[]>([])
const stageOptions = ref<{ value: string; label: string }[]>([])

const localizedStageOptions = computed(() =>
  stageOptions.value.map((item) => ({
    value: item.value,
    label: localizeProjectStage(item.value, localeStore.currentLocale),
  })),
)
const localizedStatusOptions = computed(() =>
  ['Draft', 'Active', 'Suspended', 'Delayed', 'Accepted', 'Archived'].map((value) => ({
    value,
    label: localizeProjectStatus(value, localeStore.currentLocale),
  })),
)
const localizedRiskOptions = computed(() =>
  ['Low', 'Medium', 'High', 'Critical'].map((value) => ({
    value,
    label: localizeProjectRisk(value, localeStore.currentLocale),
  })),
)
const selectedCountryName = computed(() => {
  const country = countryOptions.value.find((item) => item.value === formData.countryCode)?.label
  return country?.replace(/\s*\(.+\)$/, '') || '中国'
})
const selectedProjectTypeName = computed(() =>
  projectTypeOptions.value.find((item) => item.value === formData.projectType)?.label || '项目类型',
)
const projectNameSuggestion = computed(() => {
  const city = formData.city.trim() || '城市'
  const customer = formData.customerName.trim() || '客户简称'
  const projectType = selectedProjectTypeName.value
  return `${selectedCountryName.value}-${city}-${customer}-${formData.projectName.trim() || '项目简称'}-${projectType}`
})

const formData = reactive({
  projectName: '',
  countryCode: 'CN',
  city: '',
  customerName: '',
  projectType: '',
  contractCurrency: 'CNY',
  baseCurrency: 'CNY',
  contractAmount: undefined as number | undefined,
  projectLanguage: 'zh-CN',
  salesOwnerId: '',
  projectManagerId: '',
  electricLeaderId: '',
  softwareLeaderId: '',
  currentStage: '01_sale',
  riskLevel: 'Low',
  projectStatus: 'Draft',
  startDate: '',
  plannedEndDate: '',
  actualEndDate: '',
})

const rules = {
  projectName: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  countryCode: [{ required: true, message: '请选择国家', trigger: 'change' }],
}

const suggestedCode = ref('')

function generateProjectCode(countryCode: string) {
  if (!countryCode) {
    suggestedCode.value = ''
    return
  }
  const now = new Date()
  const year = now.getFullYear()
  const seq = String(Math.floor(Math.random() * 900) + 100)
  const customer = formData.customerName.trim() || '客户简称'
  const city = formData.city.trim() || '城市'
  suggestedCode.value = `${countryCode}-${city}-${customer}-${year}-${seq}`
}

watch(() => formData.countryCode, generateProjectCode, { immediate: true })
watch([() => formData.city, () => formData.customerName], () => generateProjectCode(formData.countryCode))

async function loadOptions() {
  optionLoading.value = true
  try {
    const [countriesRes, currenciesRes, languagesRes, usersRes, projectTypes, stages] =
      await Promise.all([
        countryApi.getList({ pageSize: 100, status: 'Active' }),
        currencyApi.getList(),
        languageApi.getList(),
        userApi.getList({ pageSize: 1000 }),
        dictionaryApi.getByCode('project_type'),
        dictionaryApi.getByCode('project_stage'),
      ])

    const countries = countriesRes as unknown as { list: Country[] }
    countryOptions.value = countries.list.map((country) => ({
      value: country.countryCode,
      label: `${country.nameZh} (${country.countryCode})`,
    }))

    const currencies = currenciesRes as Currency[]
    currencyOptions.value = currencies.map((currency) => ({
      value: currency.currencyCode,
      label: `${currency.currencyName} (${currency.currencySymbol || currency.currencyCode})`,
    }))

    const languages = languagesRes as Language[]
    languageOptions.value = languages
      .filter((language) => language.status === 'Active')
      .map((language) => ({
        value: language.languageCode,
        label: language.languageName,
      }))

    const usersData = usersRes as unknown as { list: UserListItem[] }
    userOptions.value = usersData.list.map((user) => ({
      value: user.id,
      label: `${user.realName} (${user.username})`,
    }))

    projectTypeOptions.value = projectTypes.items.map((item) => ({
      value: item.itemValue,
      label: item.itemLabel,
    }))
    stageOptions.value = stages.items.map((item) => ({
      value: item.itemValue,
      label: item.itemLabel,
    }))
  } finally {
    optionLoading.value = false
  }
}

async function loadProject() {
  if (!projectId.value) return
  const project = await projectApi.getById(projectId.value)
  Object.assign(formData, {
    projectName: project.projectName,
    countryCode: project.countryCode,
    city: project.city || '',
    customerName: project.customerName || '',
    projectType: project.projectType || '',
    contractCurrency: project.contractCurrency || 'CNY',
    baseCurrency: project.baseCurrency || 'CNY',
    contractAmount: project.contractAmount,
    projectLanguage: project.projectLanguage || 'zh-CN',
    salesOwnerId: project.salesOwnerId || '',
    projectManagerId: project.projectManagerId || '',
    electricLeaderId: project.electricLeaderId || '',
    softwareLeaderId: project.softwareLeaderId || '',
    currentStage: project.currentStage || '01_sale',
    riskLevel: project.riskLevel,
    projectStatus: project.projectStatus,
    startDate: project.startDate?.slice(0, 10) || '',
    plannedEndDate: project.plannedEndDate?.slice(0, 10) || '',
    actualEndDate: project.actualEndDate?.slice(0, 10) || '',
  })
  suggestedCode.value = project.projectCode
}

async function handleSubmit() {
  if (!formRef.value) return
  const errors = await formRef.value.validate().catch((error: unknown) => error)
  if (errors) return

  loading.value = true
  try {
    const payload: UpdateProjectDto = {
      projectName: formData.projectName,
      countryCode: formData.countryCode,
      city: formData.city || undefined,
      customerName: formData.customerName || undefined,
      projectType: formData.projectType || undefined,
      contractCurrency: formData.contractCurrency || undefined,
      baseCurrency: formData.baseCurrency || undefined,
      contractAmount: formData.contractAmount,
      projectLanguage: formData.projectLanguage || undefined,
      salesOwnerId: formData.salesOwnerId || undefined,
      projectManagerId: formData.projectManagerId || undefined,
      electricLeaderId: formData.electricLeaderId || undefined,
      softwareLeaderId: formData.softwareLeaderId || undefined,
      currentStage: formData.currentStage,
      riskLevel: formData.riskLevel,
      projectStatus: formData.projectStatus,
      startDate: formData.startDate || undefined,
      plannedEndDate: formData.plannedEndDate || undefined,
      actualEndDate: formData.actualEndDate || undefined,
    }

    if (isEdit.value) {
      await projectApi.update(projectId.value, payload)
    } else {
      const createPayload = { ...payload } as CreateProjectDto
      delete (createPayload as Partial<UpdateProjectDto>).projectStatus
      delete (createPayload as Partial<UpdateProjectDto>).actualEndDate
      await projectApi.create(createPayload)
    }

    Message.success(isEdit.value ? '项目更新成功' : '项目创建成功')
    router.push('/project')
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  router.push('/project')
}

onMounted(async () => {
  await loadOptions()
  await loadProject()
})
</script>

<template>
  <div class="create-project-page">
    <a-card :bordered="false" class="project-form-card">
      <template #title>
        {{ isEdit ? '编辑项目' : '创建项目' }}
      </template>

      <a-spin :loading="optionLoading">
        <a-form
          ref="formRef"
          :model="formData"
          :rules="rules"
          label-width="128px"
          class="project-form"
        >
          <a-divider orientation="left">基础信息</a-divider>
          <a-form-item label="项目名称" prop="projectName">
            <a-input
              v-model="formData.projectName"
              :max-length="200"
              show-word-limit
              placeholder="建议：国家-城市-客户简称-项目简称-项目类型，例如：中国-上海-某客户-冷站节能"
            />
            <p class="field-hint">命名建议：{{ projectNameSuggestion }}</p>
          </a-form-item>
          <a-row :gutter="14">
            <a-col :span="8">
              <a-form-item label="国家" prop="countryCode">
                <a-select v-model="formData.countryCode" filterable placeholder="请选择国家">
                  <a-option
                    v-for="item in countryOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="城市">
                <a-input v-model="formData.city" :max-length="100" placeholder="例如：上海" />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="客户名称">
                <a-input
                  v-model="formData.customerName"
                  :max-length="200"
                  placeholder="用于生成项目编号和简称"
                />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="14">
            <a-col :span="7">
              <a-form-item label="项目类型">
                <a-select v-model="formData.projectType" filterable allow-clear placeholder="请选择">
                  <a-option
                    v-for="item in projectTypeOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="7">
              <a-form-item label="项目语言">
                <a-select v-model="formData.projectLanguage" filterable allow-clear placeholder="请选择">
                  <a-option
                    v-for="item in languageOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="10">
              <a-form-item label="项目编号参考">
                <a-input v-model="suggestedCode" disabled />
              </a-form-item>
            </a-col>
          </a-row>

          <a-row v-if="isEdit" :gutter="14">
            <a-col :span="8">
              <a-form-item label="项目状态">
                <a-select v-model="formData.projectStatus">
                  <a-option
                    v-for="item in localizedStatusOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="实际结束日期">
                <a-date-picker
                  v-model="formData.actualEndDate"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>

          <a-divider orientation="left">金额与计划</a-divider>
          <a-row :gutter="14">
            <a-col :span="8">
              <a-form-item label="合同币种">
                <a-select v-model="formData.contractCurrency" filterable allow-clear>
                  <a-option
                    v-for="item in currencyOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="基准币种">
                <a-select v-model="formData.baseCurrency" filterable allow-clear>
                  <a-option
                    v-for="item in currencyOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="合同金额">
                <a-input-number
                  v-model="formData.contractAmount"
                  :min="0"
                  :precision="2"
                  placeholder="请输入金额"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="14">
            <a-col :span="12">
              <a-form-item label="开始日期">
                <a-date-picker
                  v-model="formData.startDate"
                  placeholder="选择日期"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="计划结束日期">
                <a-date-picker
                  v-model="formData.plannedEndDate"
                  placeholder="选择日期"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </a-form-item>
            </a-col>
          </a-row>

          <a-divider orientation="left">阶段与风险</a-divider>
          <a-row :gutter="14">
            <a-col :span="8">
              <a-form-item label="当前阶段">
                <a-select v-model="formData.currentStage" placeholder="请选择">
                  <a-option
                    v-for="item in localizedStageOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="风险等级">
                <a-select v-model="formData.riskLevel" placeholder="请选择">
                  <a-option
                    v-for="item in localizedRiskOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <a-divider orientation="left">项目负责人</a-divider>
          <a-row :gutter="14">
            <a-col :span="12">
              <a-form-item label="销售负责人">
                <a-select v-model="formData.salesOwnerId" filterable allow-clear placeholder="请选择">
                  <a-option
                    v-for="item in userOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="项目经理">
                <a-select v-model="formData.projectManagerId" filterable allow-clear placeholder="请选择">
                  <a-option
                    v-for="item in userOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-row :gutter="14">
            <a-col :span="12">
              <a-form-item label="电气负责人">
                <a-select v-model="formData.electricLeaderId" filterable allow-clear placeholder="请选择">
                  <a-option
                    v-for="item in userOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="软件负责人">
                <a-select v-model="formData.softwareLeaderId" filterable allow-clear placeholder="请选择">
                  <a-option
                    v-for="item in userOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <div class="form-actions">
            <a-button @click="handleCancel">取消</a-button>
            <a-button type="primary" :loading="loading" @click="handleSubmit">
              {{ isEdit ? '保存' : '创建' }}
            </a-button>
          </div>
        </a-form>
      </a-spin>
    </a-card>
  </div>
</template>

<style scoped lang="scss">
.create-project-page {
  min-width: 0;
  height: 100%;
  overflow: auto;
}

.project-form-card {
  border-radius: 0;
}

.project-form-card :deep(.arco-card-body) {
  padding: 12px 16px 18px;
}

.project-form {
  max-width: none;
}

.project-form :deep(.arco-form-item) {
  margin-bottom: 14px;
}

.project-form :deep(.arco-input),
.project-form :deep(.arco-input-number-input),
.project-form :deep(.arco-select-view-value),
.project-form :deep(.arco-picker input) {
  text-align: left;
}

.project-form :deep(.arco-select),
.project-form :deep(.arco-input-wrapper),
.project-form :deep(.arco-picker) {
  border-radius: 0;
}

.project-form :deep(.arco-divider-text) {
  color: var(--color-text-1);
  font-size: 13px;
  font-weight: 650;
}

.field-hint {
  margin: 5px 0 0;
  color: var(--color-text-3);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 8px;
}

@media (max-width: 900px) {
  .project-form :deep(.arco-col) {
    flex: 0 0 100%;
    max-width: 100%;
  }
}
</style>
