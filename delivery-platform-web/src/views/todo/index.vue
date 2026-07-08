<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { arcoPrompt } from '@/utils/arco-dialog'
import { approvalApi } from '@/api/platform'
import { notificationApi } from '@/api/notification'
import type { ApprovalTask } from '@/types/platform'
import type { NotificationItem } from '@/types/system'
import { getApprovalBusinessLabel } from '@/utils/approval'

const loading = ref(false)
const tasks = ref<ApprovalTask[]>([])
const notifications = ref<NotificationItem[]>([])
const businessVisible = ref(false)
const selectedTask = ref<ApprovalTask | null>(null)

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [taskPage, notificationPage] = await Promise.all([
      approvalApi.getTasks({ page: 1, pageSize: 20, status: 'Pending' }),
      notificationApi.getList({ page: 1, pageSize: 10, isRead: 'false' }),
    ])
    tasks.value = taskPage.list
    notifications.value = notificationPage.list
  } finally {
    loading.value = false
  }
}

async function decide(task: ApprovalTask, decision: 'Approved' | 'Rejected'): Promise<void> {
  try {
    const result = await arcoPrompt(
      decision === 'Approved' ? '可填写审批意见' : '请填写驳回原因',
      decision === 'Approved' ? '审批通过' : '驳回审批',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputValidator: (value) =>
          decision === 'Rejected' && !value.trim() ? '驳回时必须填写原因' : true,
      },
    )
    await approvalApi.decide(task.id, {
      decision,
      comment: result.value.trim() || undefined,
    })
    Message.success(decision === 'Approved' ? '审批已通过' : '审批已驳回')
    await fetchData()
  } catch {
    // User cancelled the decision dialog.
  }
}

function openBusiness(task: ApprovalTask): void {
  selectedTask.value = task
  businessVisible.value = true
}

async function readNotification(item: NotificationItem): Promise<void> {
  await notificationApi.markAsRead(item.id)
  await fetchData()
}

onMounted(fetchData)
</script>

<template>
  <div v-loading="loading" class="todo-page">
    <section class="page-section">
      <div class="section-heading">
        <div>
          <h2>待审批</h2>
          <p>当前账号需要处理的审批任务</p>
        </div>
        <a-tag color="orange">
          {{ tasks.length }}
        </a-tag>
      </div>
      <a-table :data="tasks" border>
        <a-table-column type="expand">
          <template #default="{ row }">
            <a-timeline class="approval-history">
              <a-timeline-item
                v-for="action in row.actions"
                :key="action.id"
                :timestamp="action.createdAt"
              >
                第 {{ action.stepOrder }} 步 · {{ action.actor.realName }} · {{ action.action }}
                <span v-if="action.comment">：{{ action.comment }}</span>
              </a-timeline-item>
            </a-timeline>
          </template>
        </a-table-column>
        <a-table-column label="审批事项" :min-width="220">
          <template #default="{ row }">
            <a-button text type="primary" @click="openBusiness(row)">
              {{ row.businessTitle || row.template.templateName }}
            </a-button>
          </template>
        </a-table-column>
        <a-table-column label="业务" :width="130">
          <template #default="{ row }">
            {{ getApprovalBusinessLabel(row.businessType) }}
          </template>
        </a-table-column>
        <a-table-column prop="applicant.realName" label="申请人" :width="120" />
        <a-table-column prop="currentStep" label="步骤" :width="80" />
        <a-table-column prop="createdAt" label="发起时间" :width="180" />
        <a-table-column label="操作" :width="150" fixed="right">
          <template #default="{ row }">
            <a-button status="success" type="secondary" text @click="decide(row, 'Approved')">
              通过
            </a-button>
            <a-button status="danger" type="secondary" text @click="decide(row, 'Rejected')">
              驳回
            </a-button>
          </template>
        </a-table-column>
      </a-table>
      <a-empty v-if="!tasks.length" description="暂无待审批事项" />
    </section>

    <section class="page-section">
      <div class="section-heading">
        <div>
          <h2>未读通知</h2>
          <p>项目、资料和系统事件提醒</p>
        </div>
        <a-tag>{{ notifications.length }}</a-tag>
      </div>
      <a-table :data="notifications" border>
        <a-table-column prop="title" label="标题" :min-width="180" />
        <a-table-column
          prop="content"
          label="内容"
          :min-width="280"
          show-overflow-tooltip
        />
        <a-table-column prop="createdAt" label="时间" :width="180" />
        <a-table-column label="操作" :width="100">
          <template #default="{ row }">
            <a-button text type="primary" @click="readNotification(row)">
              标为已读
            </a-button>
          </template>
        </a-table-column>
      </a-table>
      <a-empty v-if="!notifications.length" description="暂无未读通知" />
    </section>

    <a-modal
      v-model:visible="businessVisible"
      title="审批事项详情"
      :width="720"
      :footer="false"
    >
      <a-descriptions
        v-if="selectedTask"
        :column="2"
        bordered
        size="small"
        class="approval-business-detail"
      >
        <a-descriptions-item label="审批事项" :span="2">
          {{ selectedTask.businessTitle || selectedTask.template.templateName }}
        </a-descriptions-item>
        <a-descriptions-item label="业务类型">
          {{ getApprovalBusinessLabel(selectedTask.businessType) }}
        </a-descriptions-item>
        <a-descriptions-item label="业务编号">
          {{ selectedTask.businessId }}
        </a-descriptions-item>
        <a-descriptions-item label="申请人">
          {{ selectedTask.applicant.realName }}
        </a-descriptions-item>
        <a-descriptions-item label="当前步骤">
          第 {{ selectedTask.currentStep }} 步
        </a-descriptions-item>
        <a-descriptions-item label="审批模板" :span="2">
          {{ selectedTask.template.templateName }}
        </a-descriptions-item>
      </a-descriptions>
      <a-timeline v-if="selectedTask" class="approval-history modal-history">
        <a-timeline-item
          v-for="action in selectedTask.actions"
          :key="action.id"
          :timestamp="action.createdAt"
        >
          第 {{ action.stepOrder }} 步 · {{ action.actor.realName }} · {{ action.action }}
          <span v-if="action.comment">：{{ action.comment }}</span>
        </a-timeline-item>
      </a-timeline>
    </a-modal>
  </div>
</template>

<style scoped lang="scss">
.todo-page {
  display: grid;
  gap: 20px;
}
.page-section {
  padding: 20px;
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 8px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  h2 { margin: 0; font-size: 18px; }
  p { margin: 5px 0 0; color: var(--app-text-muted); font-size: 13px; }
}
.approval-history { padding: 8px 24px 0; }
.modal-history { padding: 16px 8px 0; }
.approval-business-detail { border-radius: 0; }
</style>
