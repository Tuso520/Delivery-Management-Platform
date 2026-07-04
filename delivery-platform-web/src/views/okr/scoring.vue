<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { okrApi } from '@/api/okr'
import { projectApi } from '@/api/project'
import { usePermission } from '@/composables/usePermission'
import { useUserStore } from '@/store/user'
import type { OkrObjective, PerformanceScore } from '@/types/okr'
import type { Project } from '@/types/project'
import dayjs from 'dayjs'

const route = useRoute()
const userStore = useUserStore()
const { hasRole } = usePermission()

const loading = ref(false)
const saving = ref(false)
const objective = ref<OkrObjective | null>(null)
const objectives = ref<OkrObjective[]>([])
const projects = ref<Project[]>([])
const selectedObjectiveId = ref(String(route.query.id ?? ''))
const currentMonth = dayjs().format('YYYY-MM')
const existingScore = ref<PerformanceScore | null>(null)

const formData = reactive({
  month: currentMonth,
  selfScore: 85,
  managerScore: undefined as number | undefined,
  projectRatio: '{}',
  comment: '',
  nextGoal: '',
})

const projectRatioItems = reactive<Array<{
  projectId: string
  projectName: string
  ratio: number
}>>([])

const addRatioItem = () => {
  projectRatioItems.push({ projectId: '', projectName: '', ratio: 0 })
}

const removeRatioItem = (index: number) => {
  projectRatioItems.splice(index, 1)
}

const updateProjectRatio = () => {
  const obj: Record<string, { projectName: string; ratio: number }> = {}
  for (const item of projectRatioItems) {
    if (item.projectId) {
      const project = projects.value.find(candidate => candidate.id === item.projectId)
      obj[item.projectId] = {
        projectName: project?.projectName ?? item.projectName,
        ratio: item.ratio,
      }
    }
  }
  formData.projectRatio = JSON.stringify(obj)
}

const isManager = computed(() => {
  return ['DELIVERY_MANAGER', 'PROJECT_MANAGER', 'SYSTEM_ADMIN', 'SUPER_ADMIN']
    .some(role => hasRole(role))
})

const canEditSelf = computed(() =>
  objective.value?.ownerId === userStore.userInfo?.id &&
  !['Reviewing', 'Completed'].includes(existingScore.value?.status ?? ''),
)
const canSubmitManager = computed(() =>
  isManager.value &&
  Boolean(existingScore.value) &&
  !['Reviewing', 'Completed'].includes(existingScore.value?.status ?? ''),
)
const ratioTotal = computed(() =>
  projectRatioItems.reduce((total, item) => total + item.ratio, 0),
)

const loadObjective = async () => {
  if (!selectedObjectiveId.value) {
    objective.value = null
    existingScore.value = null
    projectRatioItems.length = 0
    return
  }
  loading.value = true
  try {
    objective.value = await okrApi.getObjectiveById(selectedObjectiveId.value)
    existingScore.value = null
    projectRatioItems.length = 0
    formData.selfScore = 85
    formData.managerScore = undefined
    formData.comment = ''
    formData.nextGoal = ''

    if (objective.value.scores) {
      const score = objective.value.scores.find(s => s.month === currentMonth)
      if (score) {
        existingScore.value = score
        formData.selfScore = score.selfScore ?? 85
        formData.managerScore = score.managerScore ?? undefined
        formData.comment = score.comment || ''
        formData.nextGoal = score.nextGoal || ''

        // Parse project ratio
        if (score.projectRatio) {
          try {
            const parsed = JSON.parse(score.projectRatio) as Record<
              string,
              number | { projectName: string; ratio: number }
            >
            for (const [key, value] of Object.entries(parsed)) {
              if (typeof value === 'number') {
                const project = projects.value.find(item => item.projectName === key)
                projectRatioItems.push({
                  projectId: project?.id ?? '',
                  projectName: key,
                  ratio: value,
                })
              } else {
                projectRatioItems.push({
                  projectId: key,
                  projectName: value.projectName,
                  ratio: value.ratio,
                })
              }
            }
          } catch {
            projectRatioItems.length = 0
          }
        }
      }
    }
  } catch {
    Message.error('加载目标失败')
  } finally {
    loading.value = false
  }
}

const handleSubmitSelfScore = async () => {
  if (!objective.value) return

  updateProjectRatio()
  if (ratioTotal.value !== 100) {
    Message.warning('项目占比合计必须为 100%')
    return
  }
  saving.value = true

  try {
    if (existingScore.value) {
      // Update existing score's self-assessment fields
      await okrApi.updateScore(existingScore.value.id, {
        selfScore: formData.selfScore,
        projectRatio: formData.projectRatio,
        comment: formData.comment,
        status: 'Submitted',
      })
    } else {
      await okrApi.createScore(objective.value.id, {
        month: formData.month,
        selfScore: formData.selfScore,
        projectRatio: formData.projectRatio,
        comment: formData.comment,
      })
    }

    Message.success('自评提交成功')
    await loadObjective()
  } catch {
    // handled by interceptor
  } finally {
    saving.value = false
  }
}

const handleSubmitManagerScore = async () => {
  if (!existingScore.value) {
    Message.warning('请先让工程师完成自评')
    return
  }
  if (formData.managerScore === undefined) {
    Message.warning('请填写主管评分')
    return
  }

  saving.value = true
  try {
    await okrApi.submitScore(existingScore.value.id, {
      managerScore: formData.managerScore,
      nextGoal: formData.nextGoal,
      comment: formData.comment,
    })
    Message.success('主管评分已提交审核')
    await loadObjective()
  } catch {
    // handled by interceptor
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const [objectiveList, projectPage] = await Promise.all([
      okrApi.getObjectives(),
      projectApi.getList({ page: 1, pageSize: 200 }),
    ])
    objectives.value = objectiveList
    projects.value = projectPage.list
    if (selectedObjectiveId.value) await loadObjective()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="scoring-page">
    <div class="page-header">
      <div>
        <h2>月度绩效评分</h2>
        <p>完成员工自评、主管评分和审批确认</p>
      </div>
      <a-select
        v-model="selectedObjectiveId"
        filterable
        placeholder="选择 OKR 目标"
        class="objective-select"
        @change="loadObjective"
      >
        <a-option
          v-for="item in objectives"
          :key="item.id"
          :label="`${item.owner?.realName || '-'} / ${item.title}`"
          :value="item.id"
        />
      </a-select>
    </div>

    <a-empty v-if="!objective && !loading" description="请选择一个 OKR 目标开始月度绩效评分" />
    <a-card v-if="objective" v-loading="loading">
      <div class="obj-brief">
        <a-tag>{{ objective.period }}</a-tag>
        <span class="obj-name">{{ objective.title }}</span>
        <span class="obj-owner">{{ objective.owner?.realName }}</span>
        <a-tag v-if="existingScore" :type="existingScore.status === 'Completed' ? 'success' : 'warning'">
          {{ existingScore.status }}
        </a-tag>
      </div>

      <a-divider content-position="left">
        一、项目占比（工程师填写）
      </a-divider>
      <div class="ratio-section">
        <div class="ratio-intro">
          请填写当前月度在各项目上的工时占比（总和应为100%）        </div>
        <div v-for="(item, index) in projectRatioItems" :key="index" class="ratio-item">
          <a-select
            v-model="item.projectId"
            filterable
            placeholder="选择项目"
            style="width: 360px; margin-right: 12px"
          >
            <a-option
              v-for="project in projects"
              :key="project.id"
              :label="project.projectName"
              :value="project.id"
            />
          </a-select>
          <a-input-number
            v-model="item.ratio"
            :min="0"
            :max="100"
            :precision="0"
            style="width: 160px"
          >
            <template #suffix>
              %
            </template>
          </a-input-number>
          <a-button status="danger" type="secondary" text @click="removeRatioItem(index)">
            移除
          </a-button>
        </div>
        <a-button
          type="primary"
          plain
          size="small"
          @click="addRatioItem"
        >
          + 添加项目
        </a-button>
        <a-tag :type="ratioTotal === 100 ? 'success' : 'warning'">
          合计 {{ ratioTotal }}%
        </a-tag>
      </div>

      <a-divider content-position="left">
        二、自评（工程师填写）
      </a-divider>
      <a-form :model="{}" label-width="120px" class="score-form">
        <a-form-item label="自评分数">
          <a-slider
            v-model="formData.selfScore"
            :min="0"
            :max="100"
            :step="1"
            style="width: 400px"
            show-input
          />
        </a-form-item>

        <a-form-item label="自评备注">
          <a-textarea
            v-model="formData.comment"

            :rows="3"
            placeholder="本周期的工作总结、成果和不足..."
            :maxlength="2000"
            show-word-limit
          />
        </a-form-item>
      </a-form>

      <a-divider content-position="left">
        三、主管评分      </a-divider>
      <a-form :model="{}" label-width="120px" class="score-form">
        <a-form-item label="主管评分">
          <a-slider
            v-model="formData.managerScore"
            :min="0"
            :max="100"
            :step="1"
            style="width: 400px"
            show-input
          />
        </a-form-item>

        <a-form-item label="下月目标">
          <a-textarea
            v-model="formData.nextGoal"

            :rows="3"
            placeholder="为下月设定的工作目标和期望..."
            :maxlength="2000"
            show-word-limit
          />
        </a-form-item>
      </a-form>

      <a-divider />
      <div class="form-actions">
        <a-button
          v-if="canEditSelf"
          type="primary"
          :loading="saving"
          @click="handleSubmitSelfScore"
        >
          提交自评
        </a-button>
        <a-button
          v-if="canSubmitManager"
          status="success" type="secondary"
          :loading="saving"
          @click="handleSubmitManagerScore"
        >
          提交主管评分审核
        </a-button>
      </div>
    </a-card>
  </div>
</template>

<style scoped lang="scss">
.scoring-page {
  min-width: 0;

  .page-header {
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
    p { margin: 6px 0 0; color: var(--app-text-muted); font-size: 13px; }
  }
  .objective-select { width: min(420px, 48vw); }

  .obj-brief {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;

    .obj-name {
      font-size: 16px;
      font-weight: 600;
    }

    .obj-owner {
      color: #86909c;
    }
  }

  .ratio-section {
    .ratio-intro {
      color: #86909c;
      font-size: 13px;
      margin-bottom: 12px;
    }

    .ratio-item {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
  }

  .score-form {
    max-width: 700px;
  }

  .form-actions {
    display: flex;
    gap: 12px;
  }
}
</style>
