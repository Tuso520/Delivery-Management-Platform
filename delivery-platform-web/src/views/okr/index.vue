<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { okrApi } from '@/api/okr'
import type { OkrObjective } from '@/types/okr'
import { GOAL_CATEGORY_OPTIONS, OBJECTIVE_STATUS_OPTIONS } from '@/types/okr'

const router = useRouter()
const loading = ref(false)
const objectives = ref<OkrObjective[]>([])
const activeCategory = ref('all')

const categoryKey = (objective: OkrObjective) =>
  `${objective.goalType}:${objective.periodType}`

const filteredObjectives = computed(() =>
  activeCategory.value === 'all'
    ? objectives.value
    : objectives.value.filter((objective) => categoryKey(objective) === activeCategory.value),
)

const categoryLabel = (objective: OkrObjective) =>
  GOAL_CATEGORY_OPTIONS.find(
    (item) =>
      item.goalType === objective.goalType &&
      item.periodType === objective.periodType,
  )?.label || `${objective.period} ${objective.goalType}`

const getProgressColor = (progress: number) => {
  if (progress >= 80) return '#67c23a'
  if (progress >= 40) return '#e6a23c'
  return '#f56c6c'
}

const getStatusTagType = (status: string) => {
  switch (status) {
    case 'Active': return 'warning'
    case 'Completed': return 'success'
    case 'Cancelled': return 'info'
    default: return 'info'
  }
}

const getStatusLabel = (status: string) => {
  return OBJECTIVE_STATUS_OPTIONS.find(s => s.value === status)?.label || status
}

const fetchList = async () => {
  loading.value = true
  try {
    objectives.value = await okrApi.getMyObjectives()
  } catch {
    objectives.value = []
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  router.push('/okr/edit')
}

const handleEdit = (obj: OkrObjective) => {
  router.push(`/okr/edit?id=${obj.id}`)
}

const handleScoring = (obj: OkrObjective) => {
  router.push(`/performance/monthly?id=${obj.id}`)
}

const handleView = (obj: OkrObjective) => {
  router.push(`/okr/edit?id=${obj.id}&readonly=true`)
}

const handleDelete = async (obj: OkrObjective) => {
  try {
    await arcoConfirm(`确定删除目标"${obj.title}"吗？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    await okrApi.deleteObjective(obj.id)
    Message.success('删除成功')
    fetchList()
  } catch {
    // cancelled
  }
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="okr-page">
    <div class="okr-toolbar">
      <a-segmented
        v-model="activeCategory"
        :options="[
          { label: '全部目标', value: 'all' },
          ...GOAL_CATEGORY_OPTIONS.map((item) => ({
            label: item.label,
            value: `${item.goalType}:${item.periodType}`,
          })),
        ]"
      />
      <a-button type="primary" @click="handleCreate">
        <a-icon><Plus /></a-icon> 新建目标
      </a-button>
    </div>

    <div v-loading="loading">
      <div v-if="filteredObjectives.length === 0 && !loading" class="empty-state">
        <a-empty description="暂无 OKR 目标，点击上方按钮创建" />
      </div>

      <div v-for="obj in filteredObjectives" :key="obj.id" class="objective-card">
        <a-card shadow="hover" class="obj-card">
          <div class="obj-header">
            <div class="obj-info">
              <span class="obj-period">
                <a-tag size="small">{{ obj.period }}</a-tag>
              </span>
              <a-tag size="small" :type="obj.goalType === 'KPI' ? 'success' : 'primary'">
                {{ categoryLabel(obj) }}
              </a-tag>
              <span class="obj-title">{{ obj.title }}</span>
              <a-tag
                :type="getStatusTagType(obj.status)"
                size="small"
              >
                {{ getStatusLabel(obj.status) }}
              </a-tag>
            </div>
            <div class="obj-actions">
              <a-button
                type="primary"
                text
                size="small"
                @click="handleView(obj)"
              >
                查看
              </a-button>
              <a-button
                type="primary"
                text
                size="small"
                @click="handleEdit(obj)"
              >
                编辑
              </a-button>
              <a-button
                status="success" type="secondary"
                text
                size="small"
                @click="handleScoring(obj)"
              >
                绩效
              </a-button>
              <a-button
                status="danger" type="secondary"
                text
                size="small"
                @click="handleDelete(obj)"
              >
                删除
              </a-button>
            </div>
          </div>

          <div class="obj-progress">
            <div class="progress-label">
              <span>总体进度</span>
              <span>{{ obj.progress }}%</span>
            </div>
            <a-progress
              :percentage="obj.progress"
              :color="getProgressColor(obj.progress)"
              :stroke-width="10"
            />
          </div>

          <!-- Key Results -->
          <div v-if="obj.keyResults && obj.keyResults.length > 0" class="key-results">
            <div class="kr-title">
              关键结果
            </div>
            <div v-for="kr in obj.keyResults" :key="kr.id" class="kr-item">
              <div class="kr-info">
                <span>{{ kr.title }}</span>
                <span v-if="kr.targetValue" class="kr-target">目标: {{ kr.targetValue }}</span>
              </div>
              <div class="kr-progress">
                <a-progress
                  :percentage="kr.progress"
                  :color="getProgressColor(kr.progress)"
                  :width="60"
                  type="circle"
                  :stroke-width="6"
                />
              </div>
            </div>
          </div>

          <!-- Scores summary -->
          <div v-if="obj.scores && obj.scores.length > 0" class="scores-summary">
            <a-tag size="small" color="green">
              最新自评: {{ obj.scores[0].selfScore ?? '-' }}
            </a-tag>
            <a-tag
              v-if="obj.scores[0].managerScore != null"
              size="small"
              color="orange"
              style="margin-left: 8px"
            >
              主管评分: {{ obj.scores[0].managerScore }}
            </a-tag>
          </div>
        </a-card>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.okr-page {
  min-width: 0;

  .okr-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

  }

  .empty-state {
    padding: 60px 0;
  }

  .objective-card {
    margin-bottom: 16px;

    .obj-card {
      .obj-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 16px;

        .obj-info {
          display: flex;
          align-items: center;
          gap: 12px;

          .obj-title {
            font-size: 16px;
            font-weight: 600;
          }
        }

        .obj-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
      }

      .obj-progress {
        margin-bottom: 16px;

        .progress-label {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          font-size: 13px;
          color: #86909c;
        }
      }

      .key-results {
        .kr-title {
          font-size: 13px;
          color: #86909c;
          margin-bottom: 8px;
        }

        .kr-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: var(--app-surface-subtle);
          border-radius: 4px;
          margin-bottom: 6px;

          .kr-info {
            display: flex;
            flex-direction: column;
            gap: 2px;

            .kr-target {
              font-size: 12px;
              color: #86909c;
            }
          }
        }
      }

      .scores-summary {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #e5e6eb;
      }
    }
  }
}
</style>
