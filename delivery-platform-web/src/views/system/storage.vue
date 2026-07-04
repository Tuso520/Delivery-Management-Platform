<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { systemOperationsApi } from '@/api/platform'
import type { BackupRecord, StorageStatus } from '@/types/platform'
import { downloadBlob } from '@/utils/blob'

const loading = ref(false)
const creating = ref(false)
const status = ref<StorageStatus>()
const backups = ref<BackupRecord[]>([])
const totalSize = computed(() => {
  const bytes = Number(status.value?.attachmentBytes ?? 0)
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`
})

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [storage, page] = await Promise.all([
      systemOperationsApi.getStorage(),
      systemOperationsApi.getBackups({ page: 1, pageSize: 100 }),
    ])
    status.value = storage
    backups.value = page.list
  } finally {
    loading.value = false
  }
}

async function createBackup(): Promise<void> {
  creating.value = true
  try {
    await systemOperationsApi.createBackup()
    Message.success('数据库备份已写入 MinIO')
    await fetchData()
  } finally {
    creating.value = false
  }
}

async function downloadBackup(item: BackupRecord): Promise<void> {
  const blob = await systemOperationsApi.downloadBackup(item.id)
  downloadBlob(blob, `delivery-backup-${item.id}.sql`)
}

onMounted(fetchData)
</script>

<template>
  <div v-loading="loading" class="storage-page">
    <section class="status-band">
      <div><span>存储服务</span><strong>{{ status?.provider || '-' }}</strong></div>
      <div><span>服务状态</span><strong :class="{ healthy: status?.available }">{{ status?.available ? '正常' : '异常' }}</strong></div>
      <div><span>私有桶</span><strong>{{ status?.bucket || '-' }}</strong></div>
      <div><span>附件数量</span><strong>{{ status?.attachmentCount || 0 }}</strong></div>
      <div><span>附件容量</span><strong>{{ totalSize }}</strong></div>
    </section>
    <section class="backup-section">
      <div class="page-toolbar">
        <div><h2>存储备份</h2><p>执行 MySQL 一致性逻辑备份，文件存入私有 MinIO</p></div>
        <a-button type="primary" :loading="creating" @click="createBackup">
          立即备份
        </a-button>
      </div>
      <a-table :data="backups" border stripe>
        <a-table-column prop="backupType" label="类型" :width="110" />
        <a-table-column prop="requester.realName" label="发起人" :width="110" />
        <a-table-column prop="createdAt" label="发起时间" :width="185" />
        <a-table-column prop="fileSize" label="文件大小" :width="120" />
        <a-table-column prop="status" label="状态" :width="110">
          <template #default="{ row }">
            <a-tag :type="row.status === 'Completed' ? 'success' : row.status === 'Failed' ? 'danger' : 'warning'">
              {{ row.status }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column
          prop="errorMessage"
          label="错误信息"
          :min-width="200"
          show-overflow-tooltip
        />
        <a-table-column label="操作" :width="100">
          <template #default="{ row }">
            <a-button
              v-if="row.status === 'Completed'"
              text
              type="primary"
              @click="downloadBackup(row)"
            >
              下载
            </a-button>
          </template>
        </a-table-column>
      </a-table>
    </section>
  </div>
</template>

<style scoped lang="scss">
.storage-page { display:grid; gap:20px; }
.status-band { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); background:#fff; border:1px solid #e5e6eb; border-radius:8px;
  div { padding:18px 20px; border-right:1px solid #f2f3f5; }
  div:last-child { border-right:0; }
  span { display:block; color:#86909c; font-size:12px; }
  strong { display:block; margin-top:7px; color:#1d2129; font-size:18px; overflow:hidden; text-overflow:ellipsis; }
  .healthy { color:#00b42a; }
}
.backup-section { padding:18px; background:#fff; border:1px solid #e5e6eb; border-radius:8px; }
@media (max-width:900px) { .status-band { grid-template-columns:repeat(2,1fr); } }
</style>
