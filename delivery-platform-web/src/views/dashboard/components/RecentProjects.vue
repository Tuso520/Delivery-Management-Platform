<script setup lang="ts">
import type { DashboardOverview } from '@/types/dashboard'

type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

defineProps<{
  projects: DashboardOverview['recentProjects']
  loading: boolean
  statusTagType: (status: string) => TagType
  riskTagType: (risk: string) => TagType
  statusLabel: (status: string) => string
  riskLabel: (risk: string) => string
}>()

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <section class="data-panel recent-projects">
    <header class="panel-header">
      <div>
        <h3 class="panel-title">
          最近创建的项目
        </h3>
        <p class="panel-description">
          按创建时间展示最新交付项目
        </p>
      </div>
      <span class="panel-meta">{{ projects.length }} 条记录</span>
    </header>
    <div class="table-wrap">
      <a-table
        v-loading="loading"
        :data="projects"
        size="small"
        style="width: 100%"
      >
        <a-table-column
          prop="projectName"
          label="项目名称"
          :min-width="260"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span class="project-name">{{ row.projectName }}</span>
          </template>
        </a-table-column>
        <a-table-column prop="countryCode" label="国家" :width="80">
          <template #default="{ row }">
            <span class="country-code">{{ row.countryCode }}</span>
          </template>
        </a-table-column>
        <a-table-column prop="status" label="状态" :width="100">
          <template #default="{ row }">
            <a-tag :type="statusTagType(row.status)" effect="light" size="small">
              {{ statusLabel(row.status) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="riskLevel" label="风险等级" :width="100">
          <template #default="{ row }">
            <a-tag :type="riskTagType(row.riskLevel)" effect="plain" size="small">
              {{ riskLabel(row.riskLevel) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column prop="createdAt" label="创建时间" :width="130">
          <template #default="{ row }">
            <span class="date-text">{{ formatDate(row.createdAt) }}</span>
          </template>
        </a-table-column>
      </a-table>
      <a-empty v-if="projects.length === 0 && !loading" description="暂无项目数据" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.data-panel {
  min-width: 0;
  margin-bottom: 18px;
  border: 1px solid #e5e6eb;
  border-radius: 0;
  background: #fff;
  overflow: hidden;
}

.panel-header {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 20px;
  border-bottom: 1px solid #f2f3f5;
}

.panel-title {
  margin: 0;
  color: #1d2129;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
}

.panel-description {
  margin: 4px 0 0;
  color: #86909c;
  font-size: 12px;
}

.panel-meta {
  color: #65716b;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.table-wrap {
  padding: 4px 14px 14px;
  overflow-x: auto;

  :deep(.arco-table) {
    --arco-table-border-color: #f2f3f5;
    --arco-table-header-bg-color: #f7f8fa;
    --arco-table-row-hover-bg-color: #f2f7f4;
    color: #4e5969;
  }

  :deep(.arco-table th.arco-table__cell) {
    color: #727e78;
    font-size: 12px;
    font-weight: 600;
  }

  :deep(.arco-table td.arco-table__cell) {
    padding-top: 11px;
    padding-bottom: 11px;
  }
}

.project-name {
  color: #303c35;
  font-weight: 560;
}

.country-code {
  color: #53615a;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.date-text {
  color: #78837d;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
