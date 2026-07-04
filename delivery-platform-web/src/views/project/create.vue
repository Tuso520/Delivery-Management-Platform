<script setup lang="ts">
import { computed, ref, reactive, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { projectApi } from '@/api/project'
import { countryApi } from '@/api/country'
import { currencyApi } from '@/api/currency'
import { languageApi } from '@/api/language'
import { userApi } from '@/api/user'
import { dictionaryApi } from '@/api/platform'
import type { Country } from '@/types/country'
import type { Currency } from '@/types/currency'
import type { Language } from '@/types/language'
import type { UserListItem } from '@/types/user'
import type { CreateProjectDto, UpdateProjectDto } from '@/types/project'
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
const formData = reactive({
  projectName: '',
  countryCode: '',
  city: '',
  customerName: '',
  projectType: '',
  contractCurrency: '',
  baseCurrency: '',
  contractAmount: undefined as number | undefined,
  projectLanguage: '',
  projectManagerId: '' as string,
  electricLeaderId: '' as string,
  softwareLeaderId: '' as string,
  purchaseOwnerId: '' as string,
  financeOwnerId: '' as string,
  currentStage: 'Initiation',
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
const generateProjectCode = (countryCode: string) => {
  if (!countryCode) {
    suggestedCode.value = ''
    return
  }
  const now = new Date()
  const year = now.getFullYear()
  const seq = String(Math.floor(Math.random() * 900) + 100)
  suggestedCode.value = `${countryCode}-XXX-${year}-${seq}`
}
watch(() => formData.countryCode, (val) => {
  generateProjectCode(val)
})
const loadOptions = async () => {
  try {
    const [countriesRes, currenciesRes, languagesRes, usersRes, projectTypes, stages] = await Promise.all([
      countryApi.getList({ pageSize: 100, status: 'Active' }),
      currencyApi.getList(),
      languageApi.getList(),
      userApi.getList({ pageSize: 1000 }),
      dictionaryApi.getByCode('project_type'),
      dictionaryApi.getByCode('project_stage'),
    ])
    const countries = countriesRes as unknown as { list: Country[] }
    countryOptions.value = countries.list.map(c => ({
      value: c.countryCode,
      label: `${c.nameZh} (${c.countryCode})`,
    }))
    const currencies = currenciesRes as Currency[]
    currencyOptions.value = currencies.map(c => ({
      value: c.currencyCode,
      label: `${c.currencyName} (${c.currencySymbol || c.currencyCode})`,
    }))
    const languages = languagesRes as Language[]
    languageOptions.value = languages.filter(l => l.status === 'Active').map(l => ({
      value: l.languageCode,
      label: l.languageName,
    }))
    const usersData = usersRes as unknown as { list: UserListItem[] }
    userOptions.value = usersData.list.map(u => ({
      value: u.id,
      label: `${u.realName} (${u.username})`,
    }))
    projectTypeOptions.value = projectTypes.items.map(item => ({
      value: item.itemValue,
      label: item.itemLabel,
    }))
    stageOptions.value = stages.items.map(item => ({
      value: item.itemValue,
      label: item.itemLabel,
    }))
  } catch { return }
}
const loadProject = async () => {
  if (!projectId.value) return
  const project = await projectApi.getById(projectId.value)
  Object.assign(formData, {
    projectName: project.projectName,
    countryCode: project.countryCode,
    city: project.city || '',
    customerName: project.customerName || '',
    projectType: project.projectType || '',
    contractCurrency: project.contractCurrency || '',
    baseCurrency: project.baseCurrency || '',
    contractAmount: project.contractAmount,
    projectLanguage: project.projectLanguage || '',
    projectManagerId: project.projectManagerId || '',
    electricLeaderId: project.electricLeaderId || '',
    softwareLeaderId: project.softwareLeaderId || '',
    purchaseOwnerId: project.purchaseOwnerId || '',
    financeOwnerId: project.financeOwnerId || '',
    currentStage: project.currentStage || 'Initiation',
    riskLevel: project.riskLevel,
    projectStatus: project.projectStatus,
    startDate: project.startDate?.slice(0, 10) || '',
    plannedEndDate: project.plannedEndDate?.slice(0, 10) || '',
    actualEndDate: project.actualEndDate?.slice(0, 10) || '',
  })
  suggestedCode.value = project.projectCode
}
const handleSubmit = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
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
      projectManagerId: formData.projectManagerId || undefined,
      electricLeaderId: formData.electricLeaderId || undefined,
      softwareLeaderId: formData.softwareLeaderId || undefined,
      purchaseOwnerId: formData.purchaseOwnerId || undefined,
      financeOwnerId: formData.financeOwnerId || undefined,
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
      const createPayload = {
        ...payload,
      } as CreateProjectDto & {
        projectStatus?: string
        actualEndDate?: string
      }
      delete createPayload.projectStatus
      delete createPayload.actualEndDate
      await projectApi.create(createPayload)
    }
    Message.success(isEdit.value ? '项目更新成功' : '项目创建成功')
    router.push('/project')
  } catch { return } finally {
    loading.value = false
  }
}
const handleCancel = () => {
  router.push('/project')
}
onMounted(async () => {
  await loadOptions()
  await loadProject()
})
</script>
<template>
  <div class="create-project-page">
    <a-card>
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ isEdit ? '编辑项目' : '创建项目' }}</span>
        </div>
      </template>
      <a-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-width="130px"
        style="max-width: 800px"
      >
        <a-divider content-position="left">
          基本信息
        </a-divider>
        <a-form-item label="项目名称" prop="projectName">
          <a-input
            v-model="formData.projectName"
            :maxlength="200"
            show-word-limit
            placeholder="请输入项目名称"
          />
        </a-form-item>
        <a-row :gutter="20">
          <a-col :span="12">
            <a-form-item label="国家" prop="countryCode">
              <a-select
                v-model="formData.countryCode"
                filterable
                placeholder="请选择国家"
                style="width: 100%"
              >
                <a-option
                  v-for="item in countryOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="城市">
              <a-input v-model="formData.city" :maxlength="100" placeholder="可选" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row v-if="isEdit" :gutter="20">
          <a-col :span="12">
            <a-form-item label="项目状态">
              <a-select v-model="formData.projectStatus" style="width: 100%">
                <a-option
                  v-for="item in localizedStatusOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="实际结束日期">
              <a-date-picker
                v-model="formData.actualEndDate"
                type="date"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="20">
          <a-col :span="12">
            <a-form-item label="客户名称">
              <a-input v-model="formData.customerName" :maxlength="200" placeholder="可选" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="项目类型">
              <a-select
                v-model="formData.projectType"
                filterable
                placeholder="请选择"
                clearable
                style="width: 100%"
              >
                <a-option
                  v-for="item in projectTypeOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-divider content-position="left">
          财务信息
        </a-divider>
        <a-row :gutter="20">
          <a-col :span="12">
            <a-form-item label="合同币种">
              <a-select
                v-model="formData.contractCurrency"
                filterable
                placeholder="请选择"
                clearable
                style="width: 100%"
              >
                <a-option
                  v-for="item in currencyOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="基准币种">
              <a-select
                v-model="formData.baseCurrency"
                filterable
                placeholder="请选择"
                clearable
                style="width: 100%"
              >
                <a-option
                  v-for="item in currencyOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="合同金额">
          <a-input-number
            v-model="formData.contractAmount"
            :min="0"
            :precision="2"
            style="width: 240px"
            placeholder="可选"
          />
        </a-form-item>
        <a-divider content-position="left">
          项目阶段与风险        </a-divider>
        <a-row :gutter="20">
          <a-col :span="12">
            <a-form-item label="当前阶段">
              <a-select v-model="formData.currentStage" placeholder="请选择" style="width: 100%">
                <a-option
                  v-for="item in localizedStageOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="风险等级">
              <a-select v-model="formData.riskLevel" placeholder="请选择" style="width: 100%">
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
        <a-row :gutter="20">
          <a-col :span="12">
            <a-form-item label="项目语言">
              <a-select
                v-model="formData.projectLanguage"
                filterable
                placeholder="请选择"
                clearable
                style="width: 100%"
              >
                <a-option
                  v-for="item in languageOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="项目编号（参考）">
              <a-input v-model="suggestedCode" disabled placeholder="选择国家后自动生成" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="20">
          <a-col :span="12">
            <a-form-item label="开始日期">
              <a-date-picker
                v-model="formData.startDate"
                type="date"
                placeholder="选择日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="计划结束日期">
              <a-date-picker
                v-model="formData.plannedEndDate"
                type="date"
                placeholder="选择日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-divider content-position="left">
          项目负责人        </a-divider>
        <a-row :gutter="20">
          <a-col :span="12">
            <a-form-item label="项目经理">
              <a-select
                v-model="formData.projectManagerId"
                filterable
                placeholder="请选择"
                clearable
                style="width: 100%"
              >
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
            <a-form-item label="电气负责人">
              <a-select
                v-model="formData.electricLeaderId"
                filterable
                placeholder="请选择"
                clearable
                style="width: 100%"
              >
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
        <a-row :gutter="20">
          <a-col :span="12">
            <a-form-item label="软件负责人">
              <a-select
                v-model="formData.softwareLeaderId"
                filterable
                placeholder="请选择"
                clearable
                style="width: 100%"
              >
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
            <a-form-item label="采购负责人">
              <a-select
                v-model="formData.purchaseOwnerId"
                filterable
                placeholder="请选择"
                clearable
                style="width: 100%"
              >
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
        <a-form-item label="财务负责人">
          <a-select
            v-model="formData.financeOwnerId"
            filterable
            placeholder="请选择"
            clearable
            style="width: 100%"
          >
            <a-option
              v-for="item in userOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-button type="primary" :loading="loading" @click="handleSubmit">
            {{ isEdit ? '保存' : '创建' }}
          </a-button>
          <a-button @click="handleCancel">
            取消
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>
  </div>
</template>
<style scoped lang="scss">
.create-project-page {
  min-width: 0;
  .card-header {
    display: flex;
    align-items: center;
  }
  .card-title {
    font-size: 16px;
    font-weight: 600;
  }
}
</style>
