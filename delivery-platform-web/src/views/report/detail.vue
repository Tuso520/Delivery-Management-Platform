<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { reportApi } from '@/api/report'
import type { DailyReport } from '@/types/report'
import { REPORT_TYPE_OPTIONS, REPORT_STATUS_OPTIONS } from '@/types/report'
import dayjs from 'dayjs'
import type { TagType } from '@/types/ui'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const report = ref<DailyReport | null>(null)
const currentUserId = ref('')

const getStatusTagType = (status: string): TagType => {
  switch (status) {
    case 'Draft': return 'info'
    case 'Submitted': return 'warning'
    case 'Reviewed': return 'success'
    default: return 'info'
  }
}

const getStatusLabel = (status: string) => {
  return REPORT_STATUS_OPTIONS.find(s => s.value === status)?.label || status
}

const getReportTypeLabel = (type: string) => {
  return REPORT_TYPE_OPTIONS.find(t => t.value === type)?.label || type
}

const canSubmit = computed(() => {
  return report.value?.status === 'Draft'
})

const isOwn = computed(() => {
  return report.value?.authorId === currentUserId.value
})



const fetchDetail = async () => {
  const id = route.params.id as string
  if (!id) return

  loading.value = true
  try {
    report.value = await reportApi.getById(id)
  } catch {
    Message.error('报告不存在')
    router.push('/report')
  } finally {
    loading.value = false
  }
}

const handleSubmit = async () => {
  if (!report.value) return

  try {
    await arcoConfirm('确定提交此报告吗？提交后将进入审核流程。', '确认提交', {
      type: 'info',
      confirmButtonText: '提交',
      cancelButtonText: '取消',
    })
    await reportApi.submit(report.value.id)
    Message.success('提交成功')
    fetchDetail()
  } catch {
    // cancelled
  }
}

const handleBack = () => {
  router.push('/report')
}

onMounted(() => {
  fetchDetail()
})
</script>

<template>
  <div class="report-detail-page">
    <div class="page-header">
      <a-button @click="handleBack">
        <a-icon><ArrowLeft /></a-icon> 返回列表
      </a-button>
      <div class="header-actions">
        <a-button v-if="canSubmit && isOwn" type="primary" @click="handleSubmit">
          提交审核
        </a-button>
        <a-tag v-if="report?.status === 'Submitted'" color="orange">
          请在“我的待办”中处理审核
        </a-tag>
      </div>
    </div>

    <a-card v-if="report" v-loading="loading">
      <div class="report-header">
        <div class="report-title-row">
          <a-tag :type="report.reportType === 'daily' ? 'info' : report.reportType === 'weekly' ? 'warning' : 'success'" size="large">
            {{ getReportTypeLabel(report.reportType) }}
          </a-tag>
          <a-tag :type="getStatusTagType(report.status)" size="large">
            {{ getStatusLabel(report.status) }}
          </a-tag>
        </div>
        <h2 class="report-date">
          {{ dayjs(report.reportDate).format('YYYY 年 MM 月 DD 日') }}
        </h2>
      </div>

      <a-descriptions :column="2" border class="report-meta">
        <a-descriptions-item label="关联项目" :span="2">
          {{ report.project?.projectCode }} - {{ report.project?.projectName }}
        </a-descriptions-item>
        <a-descriptions-item label="作者">
          {{ report.author?.realName }}
        </a-descriptions-item>
        <a-descriptions-item label="工时(h)">
          {{ report.workHours ?? '-' }}
        </a-descriptions-item>
      </a-descriptions>

      <div class="section">
        <h3>工作内容</h3>
        <div class="content-text">
          {{ report.content }}
        </div>
      </div>

      <div v-if="report.projectProgress" class="section">
        <h3>项目进度</h3>
        <div class="content-text">
          {{ report.projectProgress }}
        </div>
      </div>

      <div v-if="report.paymentProgress" class="section">
        <h3>回款进度</h3>
        <div class="content-text">
          {{ report.paymentProgress }}
        </div>
      </div>

      <div v-if="report.riskNotes" class="section">
        <h3>风险备注</h3>
        <div class="content-text risk-notes">
          {{ report.riskNotes }}
        </div>
      </div>

      <div v-if="report.nextPlan" class="section">
        <h3>下一步计划</h3>
        <div class="content-text">
          {{ report.nextPlan }}
        </div>
      </div>

      <div v-if="report.reviewer" class="section review-info">
        <h3>审核信息</h3>
        <p>审核人：{{ report.reviewer.realName }}</p>
        <p>审核时间：{{ dayjs(report.reviewedAt).format('YYYY-MM-DD HH:mm') }}</p>
      </div>
    </a-card>
  </div>
</template>

<style scoped lang="scss">
.report-detail-page {
  min-width: 0;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .header-actions {
      display: flex;
      gap: 8px;
    }
  }

  .report-header {
    margin-bottom: 24px;

    .report-title-row {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }

    .report-date {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
    }
  }

  .report-meta {
    margin-bottom: 24px;
  }

  .section {
    margin-bottom: 24px;

    h3 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 600;
      color: #1d2129;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e6eb;
    }

    .content-text {
      line-height: 1.8;
      color: #4e5969;
      white-space: pre-wrap;
    }

    .risk-notes {
      color: #ff7d00;
    }
  }

  .review-info {
    p {
      margin: 4px 0;
    }
  }
}
</style>
