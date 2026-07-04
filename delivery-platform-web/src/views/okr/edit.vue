<script setup lang="ts">
import { computed, onMounted, reactive, ref, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import type { FormRules } from '@/types/arco'
import { IconDelete as Delete, IconPlus as Plus } from '@arco-design/web-vue/es/icon'
import { okrApi } from '@/api/okr'
import { userApi } from '@/api/user'
import {
  GOAL_CATEGORY_OPTIONS,
  PERIOD_OPTIONS,
  type OkrObjective,
  type ScoringCriterion,
} from '@/types/okr'
import type { UserListItem } from '@/types/user'

interface EditableKeyResult {
  id?: string
  title: string
  targetValue: string
  currentValue: string
  weight: number
  progress: number
  isNew: boolean
}

const route = useRoute()
const router = useRouter()
const isEdit = route.query.id != null
const readonly = route.query.readonly === 'true'
const loading = ref(false)
const saving = ref(false)
const formRef = useTemplateRef<FormInstance>('objectiveFormRef')
const users = ref<UserListItem[]>([])
const removedKeyResultIds = ref<string[]>([])

const formData = reactive({
  title: '',
  description: '',
  period: '2026-Q2',
  periodType: 'quarterly',
  weight: 100,
  goalType: 'OKR' as 'OKR' | 'KPI',
  scoringFlow: 'Approval',
  scoringMethod: 'Weighted',
  scorerIds: [] as string[],
  calculationRule: '各评分项得分 × 对应权重后求和',
})

const scoringCriteria = reactive<ScoringCriterion[]>([
  {
    name: '指标完成度',
    weight: 70,
    standard: '按照目标值和实际值计算完成比例。',
    requirements: '提供系统数据、项目记录或业务凭证。',
    sourceField: 'keyResultProgress',
    operator: 'weighted_average',
    threshold: '100',
  },
  {
    name: '质量与协同',
    weight: 30,
    standard: '结合质量、风险闭环和团队协同评分。',
    requirements: '说明关键贡献、问题和改进结果。',
    sourceField: 'managerScore',
    operator: 'manual',
    threshold: '90',
  },
])

const keyResults = reactive<EditableKeyResult[]>([])

const categoryValue = computed(
  () => `${formData.goalType}:${formData.periodType}`,
)

const formRules: FormRules = {
  title: [{ required: true, message: '请输入目标标题', trigger: 'blur' }],
  period: [{ required: true, message: '请选择或输入周期', trigger: 'change' }],
}

const selectedScorers = computed(() =>
  formData.scorerIds
    .map((id) => users.value.find((user) => user.id === id))
    .filter((user): user is UserListItem => Boolean(user)),
)

function setCategory(value: string | number | boolean): void {
  const [goalType, periodType] = String(value).split(':')
  formData.goalType = goalType === 'KPI' ? 'KPI' : 'OKR'
  formData.periodType = periodType || 'quarterly'
  if (periodType === 'yearly') formData.period = '2026'
  if (periodType === 'quarterly') formData.period = '2026-Q2'
  if (periodType === 'monthly') formData.period = '2026-06'
}

function addKeyResult(): void {
  keyResults.push({
    title: '',
    targetValue: '',
    currentValue: '',
    weight: 0,
    progress: 0,
    isNew: true,
  })
}

function removeKeyResult(index: number): void {
  const item = keyResults[index]
  if (item?.id) removedKeyResultIds.value.push(item.id)
  keyResults.splice(index, 1)
}

function addScoringCriterion(): void {
  scoringCriteria.push({
    name: '',
    weight: 0,
    standard: '',
    requirements: '',
    sourceField: 'keyResultProgress',
    operator: 'weighted_average',
    threshold: '',
  })
}

async function fetchDetail(): Promise<void> {
  if (!route.query.id) return
  loading.value = true
  try {
    const objective: OkrObjective = await okrApi.getObjectiveById(
      route.query.id as string,
    )
    Object.assign(formData, {
      title: objective.title,
      description: objective.description || '',
      period: objective.period,
      periodType: objective.periodType,
      weight: objective.weight,
      goalType: objective.goalType || 'OKR',
      scoringFlow: objective.scoringFlow || 'Approval',
      scoringMethod: objective.scoringMethod || 'Weighted',
      scorerIds: Array.isArray(objective.scorerIds) ? objective.scorerIds : [],
      calculationRule: objective.calculationRule || '',
    })
    scoringCriteria.splice(
      0,
      scoringCriteria.length,
      ...(objective.scoringContent?.map((item) => ({ ...item })) || []),
    )
    keyResults.splice(
      0,
      keyResults.length,
      ...(objective.keyResults || []).map((item) => ({
        id: item.id,
        title: item.title,
        targetValue: item.targetValue || '',
        currentValue: item.currentValue || '',
        weight: item.weight,
        progress: item.progress,
        isNew: false,
      })),
    )
  } catch {
    Message.error('加载目标失败')
    await router.push('/okr')
  } finally {
    loading.value = false
  }
}

function validateWeights(): boolean {
  const indicatorWeight = keyResults.reduce((sum, item) => sum + item.weight, 0)
  if (keyResults.length > 0 && indicatorWeight !== 100) {
    Message.warning(`指标权重合计应为 100%，当前为 ${indicatorWeight}%`)
    return false
  }
  const scoringWeight = scoringCriteria.reduce((sum, item) => sum + item.weight, 0)
  if (scoringCriteria.length > 0 && scoringWeight !== 100) {
    Message.warning(`评分项权重合计应为 100%，当前为 ${scoringWeight}%`)
    return false
  }
  if (formData.scoringFlow === 'Approval' && formData.scorerIds.length === 0) {
    Message.warning('顺序评分流程至少需要一名评分人')
    return false
  }
  return true
}

async function handleSave(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !validateWeights()) return
  saving.value = true
  try {
    const payload = { ...formData, scoringContent: scoringCriteria }
    const objective = isEdit && route.query.id
      ? await okrApi.updateObjective(route.query.id as string, payload)
      : await okrApi.createObjective(payload)

    await Promise.all(
      removedKeyResultIds.value.map((id) => okrApi.deleteKeyResult(id)),
    )
    for (const keyResult of keyResults) {
      if (!keyResult.title.trim()) continue
      const data = {
        title: keyResult.title,
        targetValue: keyResult.targetValue || undefined,
        currentValue: keyResult.currentValue || undefined,
        weight: keyResult.weight,
        progress: keyResult.progress,
      }
      if (keyResult.isNew) {
        await okrApi.createKeyResult(objective.id, data)
      } else if (keyResult.id) {
        await okrApi.updateKeyResult(keyResult.id, data)
      }
    }
    Message.success(isEdit ? '目标已更新' : '目标已创建')
    await router.push('/okr')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const page = await userApi.getList({ page: 1, pageSize: 200, status: 'Active' })
  users.value = page.list
  if (isEdit) await fetchDetail()
  if (!isEdit && keyResults.length === 0) addKeyResult()
})
</script>

<template>
  <div class="okr-edit-page">
    <a-card v-loading="loading">
      <a-form
        ref="objectiveFormRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
        :disabled="readonly"
        class="edit-form"
      >
        <section class="form-section">
          <h3>目标基础</h3>
          <a-form-item label="目标分类">
            <a-segmented
              :model-value="categoryValue"
              :options="GOAL_CATEGORY_OPTIONS.map((item) => ({
                label: item.label,
                value: `${item.goalType}:${item.periodType}`,
              }))"
              @update:model-value="setCategory"
            />
          </a-form-item>
          <a-row :gutter="20">
            <a-col :span="16">
              <a-form-item label="目标标题" prop="title">
                <a-input v-model="formData.title" :maxlength="200" show-word-limit />
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="鍛ㄦ湡" prop="period">
                <a-select
                  v-model="formData.period"
                  filterable
                  allow-create
                  default-first-option
                >
                  <a-option
                    v-for="option in PERIOD_OPTIONS"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="目标描述">
            <a-textarea
              v-model="formData.description"

              :rows="3"
              :maxlength="2000"
              show-word-limit
            />
          </a-form-item>
        </section>

        <section class="form-section">
          <div class="section-heading">
            <div>
              <h3>{{ formData.goalType === 'KPI' ? 'KPI 指标项' : 'OKR 关键结果' }}</h3>
              <p>先定义指标、目标值和权重，再配置评分规则。</p>
            </div>
            <a-button v-if="!readonly" :icon="Plus" @click="addKeyResult">
              添加指标
            </a-button>
          </div>
          <div v-for="(item, index) in keyResults" :key="item.id || index" class="indicator-row">
            <span class="indicator-index">{{ index + 1 }}</span>
            <a-input v-model="item.title" placeholder="指标或关键结果" />
            <a-input v-model="item.targetValue" placeholder="目标值" />
            <a-input v-model="item.currentValue" placeholder="当前值" />
            <a-input-number v-model="item.weight" :min="0" :max="100" />
            <span class="weight-unit">%</span>
            <a-button
              v-if="!readonly"
              circle
              :icon="Delete"
              @click="removeKeyResult(index)"
            />
          </div>
        </section>

        <section class="form-section">
          <div class="section-heading">
            <div>
              <h3>评分标准与要求</h3>
              <p>评分字段可以引用上方指标完成度、自评或上级评分。</p>
            </div>
            <a-button v-if="!readonly" :icon="Plus" @click="addScoringCriterion">
              添加评分项            </a-button>
          </div>
          <div
            v-for="(criterion, index) in scoringCriteria"
            :key="index"
            class="criterion-card"
          >
            <div class="criterion-grid">
              <a-input v-model="criterion.name" placeholder="评分项名称" />
              <a-select v-model="criterion.sourceField" placeholder="计算字段">
                <a-option label="指标完成度" value="keyResultProgress" />
                <a-option label="人员自评" value="selfScore" />
                <a-option label="上级评分" value="managerScore" />
                <a-option label="项目回款完成率" value="paymentCompletionRate" />
                <a-option label="项目按期完成率" value="scheduleCompletionRate" />
              </a-select>
              <a-select v-model="criterion.operator" placeholder="计算方式">
                <a-option label="加权平均" value="weighted_average" />
                <a-option label="平均值" value="average" />
                <a-option label="求和" value="sum" />
                <a-option label="人工评分" value="manual" />
              </a-select>
              <a-input-number v-model="criterion.weight" :min="0" :max="100" />
              <a-input v-model="criterion.threshold" placeholder="达标阈值" />
              <a-button
                v-if="!readonly"
                circle
                :icon="Delete"
                @click="scoringCriteria.splice(index, 1)"
              />
            </div>
            <a-textarea
              v-model="criterion.standard"

              :rows="2"
              placeholder="评分标准，例如：100% 完成得满分，低于 80% 按比例扣分"
            />
            <a-textarea
              v-model="criterion.requirements"

              :rows="2"
              placeholder="评分要求和必须提交的材料"
            />
          </div>
        </section>

        <section class="form-section">
          <h3>评分流程与计算</h3>
          <a-row :gutter="20">
            <a-col :span="8">
              <a-form-item label="评分流程">
                <a-select v-model="formData.scoringFlow">
                  <a-option label="自评" value="Self" />
                  <a-option label="主管评分" value="Manager" />
                  <a-option label="多人评分" value="MultiScorer" />
                  <a-option label="顺序审批评分" value="Approval" />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="计算方式">
                <a-select v-model="formData.scoringMethod">
                  <a-option label="按权重计算" value="Weighted" />
                  <a-option label="平均值" value="Average" />
                  <a-option label="累计值" value="Sum" />
                  <a-option label="人工确认" value="Manual" />
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="8">
              <a-form-item label="目标权重">
                <a-input-number v-model="formData.weight" :min="0" :max="100" />
              </a-form-item>
            </a-col>
          </a-row>
          <a-form-item label="评分人顺序">
            <div class="scorer-control">
              <a-select v-model="formData.scorerIds" multiple filterable>
                <a-option
                  v-for="user in users"
                  :key="user.id"
                  :label="user.realName"
                  :value="user.id"
                />
              </a-select>
              <div class="scorer-flow">
                <span
                  v-for="(user, index) in selectedScorers"
                  :key="user.id"
                  class="scorer-step"
                >
                  {{ index + 1 }}. {{ user.realName }}
                </span>
              </div>
            </div>
          </a-form-item>
          <a-form-item label="计算公式">
            <a-textarea
              v-model="formData.calculationRule"

              :rows="2"
              placeholder="例如：指标完成度 × 70% + 质量与协同 × 30%"
            />
          </a-form-item>
        </section>

        <div class="form-actions">
          <a-button @click="router.push('/okr')">
            {{ readonly ? '返回' : '取消' }}
          </a-button>
          <a-button
            v-if="!readonly"
            type="primary"
            :loading="saving"
            @click="handleSave"
          >
            保存目标
          </a-button>
        </div>
      </a-form>
    </a-card>
  </div>
</template>

<style scoped lang="scss">
.edit-form {
  max-width: 1180px;
}

.form-section {
  padding: 8px 0 24px;
  border-bottom: 1px solid var(--app-border);

  & + & {
    padding-top: 24px;
  }

  h3 {
    margin: 0 0 18px;
    color: var(--app-text);
    font-size: 16px;
  }
}

.section-heading {
  margin-bottom: 16px;

  h3 {
    margin-bottom: 4px;
  }

  p {
    color: var(--app-text-muted);
    font-size: 12px;
  }
}

.indicator-row {
  display: grid;
  grid-template-columns: 32px minmax(220px, 1fr) 140px 140px 120px 20px 36px;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.indicator-index {
  color: var(--app-primary);
  font-weight: 700;
  text-align: center;
}

.weight-unit {
  color: var(--app-text-muted);
}

.criterion-card {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-surface-subtle);
}

.criterion-grid {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 170px 150px 120px 120px 36px;
  gap: 10px;
}

.scorer-control {
  width: 100%;
}

.scorer-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.scorer-step {
  padding: 5px 9px;
  border-radius: 4px;
  background: var(--app-primary-soft);
  color: var(--app-primary-dark);
  font-size: 12px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 24px;
}

@media (max-width: 980px) {
  .indicator-row,
  .criterion-grid {
    grid-template-columns: 1fr;
  }
}
</style>
