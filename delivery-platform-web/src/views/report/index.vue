<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { arcoConfirm, arcoPrompt } from '@/utils/arco-dialog'
import { reportApi } from '@/api/report'
import type { DailyReport, QueryReportDto } from '@/types/report'
import { REPORT_TYPE_OPTIONS, REPORT_STATUS_OPTIONS } from '@/types/report'
import dayjs from 'dayjs'
import type { TagType } from '@/types/ui'

const router = useRouter()

const loading = ref(false)
const reportList = ref<DailyReport[]>([])
const pagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 0 })

const activeTab = ref('weekly')
const activeView = ref<'reports' | 'hours'>('reports')
const searchForm = ref<QueryReportDto>({
  page: 1,
  pageSize: 20,
  reportType: 'weekly',
  dateFrom: '',
  dateTo: '',
  status: '',
})

const tabOptions = REPORT_TYPE_OPTIONS

const handleTabChange = (tab: string | number) => {
  const tabName = String(tab)
  searchForm.value.reportType = tabName
  searchForm.value.page = 1
  fetchList()
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await reportApi.getList(searchForm.value)
    reportList.value = res.list
    pagination.value = res.pagination
  } catch {
    reportList.value = []
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  searchForm.value.page = 1
  fetchList()
}

const handleReset = () => {
  searchForm.value.reportType = activeTab.value
  searchForm.value.dateFrom = ''
  searchForm.value.dateTo = ''
  searchForm.value.status = ''
  searchForm.value.page = 1
  fetchList()
}

const handlePageChange = (page: number) => {
  searchForm.value.page = page
  fetchList()
}

const handleSizeChange = (pageSize: number) => {
  searchForm.value.pageSize = pageSize
  searchForm.value.page = 1
  fetchList()
}

const handleCreate = () => {
  router.push('/report/create')
}

const handleView = (row: DailyReport) => {
  router.push(`/report/detail/${row.id}`)
}

const handleDelete = async (row: DailyReport) => {
  try {
    await arcoConfirm(`确定删除这条${REPORT_TYPE_OPTIONS.find(t => t.value === row.reportType)?.label || ''}吗？`, '确认删除', {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    await reportApi.delete(row.id)
    Message.success('删除成功')
    fetchList()
  } catch {
    // cancelled
  }
}

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

const totalHours = computed(() =>
  reportList.value.reduce((sum, report) => sum + Number(report.workHours || 0), 0),
)

const hoursByProject = computed(() => {
  const grouped = new Map<string, {
    projectName: string
    reportCount: number
    workHours: number
    contributors: Set<string>
  }>()
  for (const report of reportList.value) {
    const key = report.projectId
    const row = grouped.get(key) ?? {
      projectName: report.project?.projectName || '未命名项目',
      reportCount: 0,
      workHours: 0,
      contributors: new Set<string>(),
    }
    row.reportCount += 1
    row.workHours += Number(report.workHours || 0)
    if (report.author?.realName) row.contributors.add(report.author.realName)
    grouped.set(key, row)
  }
  return Array.from(grouped.values()).map((row) => ({
    ...row,
    contributors: Array.from(row.contributors).join('、'),
  }))
})
const contributorCount = computed(() =>
  new Set(reportList.value.map((report) => report.authorId)).size,
)
const reviewedCount = computed(() =>
  reportList.value.filter((report) => report.status === 'Reviewed').length,
)
const pendingCount = computed(() =>
  reportList.value.filter((report) => report.status !== 'Reviewed').length,
)
const averageProjectHours = computed(() =>
  hoursByProject.value.length ? totalHours.value / hoursByProject.value.length : 0,
)

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="report-page">
    <div class="report-toolbar">
      <a-segmented
        v-model="activeView"
        :options="[
          { label: '报告列表', value: 'reports' },
          { label: '工时统计', value: 'hours' },
        ]"
      />
      <a-button type="primary" @click="handleCreate">
        <a-icon><Plus /></a-icon> 撰写报告
      </a-button>
    </div>

    <!-- Tabs -->
    <a-tabs v-model="activeTab" class="report-tabs" @tab-change="handleTabChange">
      <a-tab-pane
        v-for="tab in tabOptions"
        :key="tab.value"
        :label="tab.label"
        :name="tab.value"
      />
    </a-tabs>

    <!-- Filters -->
    <a-card class="filter-card">
      <a-form :model="searchForm" inline>
        <a-form-item label="开始日期">
          <a-date-picker
            v-model="searchForm.dateFrom"
            type="date"
            placeholder="开始日期"
            value-format="YYYY-MM-DD"
            style="width: 150px"
          />
        </a-form-item>
        <a-form-item label="结束日期">
          <a-date-picker
            v-model="searchForm.dateTo"
            type="date"
            placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width: 150px"
          />
        </a-form-item>
        <a-form-item label="状态">
          <a-select
            v-model="searchForm.status"
            placeholder="全部状态"
            clearable
            style="width: 140px"
          >
            <a-option
              v-for="st in REPORT_STATUS_OPTIONS"
              :key="st.value"
              :label="st.label"
              :value="st.value"
            />
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-button type="primary" @click="handleSearch">
            搜索
          </a-button>
          <a-button @click="handleReset">
            重置
          </a-button>
        </a-form-item>
      </a-form>
    </a-card>

    <a-card v-if="activeView === 'hours'" class="hours-panel">
      <div class="hours-summary">
        <div><span>当前筛选报告</span><strong>{{ reportList.length }}</strong></div>
        <div><span>累计工时</span><strong>{{ totalHours.toFixed(1) }} h</strong></div>
        <div><span>涉及项目</span><strong>{{ hoursByProject.length }}</strong></div>
        <div><span>参与人员</span><strong>{{ contributorCount }}</strong></div>
        <div><span>单份平均工时</span><strong>{{ reportList.length ? (totalHours / reportList.length).toFixed(1) : '0.0' }} h</strong></div>
        <div><span>项目平均工时</span><strong>{{ averageProjectHours.toFixed(1) }} h</strong></div>
        <div><span>已审核</span><strong>{{ reviewedCount }}</strong></div>
        <div><span>待处理</span><strong>{{ pendingCount }}</strong></div>
      </div>
      <a-table :data="hoursByProject" border stripe>
        <a-table-column prop="projectName" label="项目" :min-width="220" />
        <a-table-column prop="contributors" label="填报人员" :min-width="180" />
        <a-table-column
          prop="reportCount"
          label="报告数"
          :width="100"
          align="right"
        />
        <a-table-column
          prop="workHours"
          label="累计工时(h)"
          :width="130"
          align="right"
        />
      </a-table>
    </a-card>

    <!-- Table -->
    <a-card v-else>
      <a-table
        v-loading="loading"
        :data="reportList"
        border
        stripe
      >
        <a-table-column label="报告类型" :width="100">
          <template #default="{ row }">
            <a-tag :type="row.reportType === 'daily' ? 'info' : row.reportType === 'weekly' ? 'warning' : 'success'" size="small">
              {{ getReportTypeLabel(row.reportType) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column
          prop="project?.projectName"
          label="项目"
          :min-width="180"
          show-overflow-tooltip
        />
        <a-table-column prop="author?.realName" label="作者" :width="100" />
        <a-table-column prop="reportDate" label="报告日期" :width="120">
          <template #default="{ row }">
            {{ dayjs(row.reportDate).format('YYYY-MM-DD') }}
          </template>
        </a-table-column>
        <a-table-column
          prop="content"
          label="内容摘要"
          :min-width="200"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ row.content?.substring(0, 80) }}{{ row.content?.length > 80 ? '...' : '' }}
          </template>
        </a-table-column>
        <a-table-column
          prop="workHours"
          label="工时"
          :width="70"
          align="right"
        />
        <a-table-column label="状态" :width="90">
          <template #default="{ row }">
            <a-tag :type="getStatusTagType(row.status)" size="small">
              {{ getStatusLabel(row.status) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column label="操作" :width="160" fixed="right">
          <template #default="{ row }">
            <a-button
              type="primary"
              text
              size="small"
              @click="handleView(row)"
            >
              查看
            </a-button>
            <a-button
              status="danger" type="secondary"
              text
              size="small"
              @click="handleDelete(row)"
            >
              删除
            </a-button>
          </template>
        </a-table-column>
      </a-table>

      <div class="pagination-wrapper">
        <a-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </div>
    </a-card>
  </div>
</template>

<style scoped lang="scss">
.report-page {
  min-width: 0;

  .report-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .report-tabs {
    margin-bottom: 16px;
  }

  .filter-card {
    margin-bottom: 16px;
  }

  .pagination-wrapper {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .hours-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin-bottom: 18px;
    border: 1px solid #e5e6eb;

    div {
      padding: 18px;
      border-right: 1px solid #e5e6eb;
    }

    div:last-child {
      border-right: 0;
    }

    span {
      display: block;
      margin-bottom: 8px;
      color: #86909c;
      font-size: 12px;
    }

    strong {
      color: #1d2129;
      font-size: 22px;
    }
  }
}

@media (max-width: 900px) {
  .report-page .hours-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
