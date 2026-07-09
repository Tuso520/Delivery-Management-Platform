<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { attachmentApi } from '@/api/attachment'
import type { Attachment } from '@/api/attachment'
import { useFilePreview } from '@/composables/useFilePreview'
import { dictionaryApi, workforceApi } from '@/api/platform'
import { userApi } from '@/api/user'
import type { DictionaryItem, TrainingPlan } from '@/types/platform'
import type { UserListItem } from '@/types/user'

const filePreview = useFilePreview()

const loading = ref(false)
const records = ref<TrainingPlan[]>([])
const users = ref<UserListItem[]>([])
const categories = ref<DictionaryItem[]>([])
const statuses = ref<DictionaryItem[]>([])
const dialogVisible = ref(false)
const editingId = ref('')
const participantVisible = ref(false)
const materialsVisible = ref(false)
const selectedTraining = ref<TrainingPlan>()
const materials = ref<Attachment[]>([])
const materialFiles = ref<File[]>([])
const uploadCategory = ref<'material' | 'recording'>('material')
const form = ref({
  title: '',
  category: '',
  trainerName: '',
  trainerId: '',
  startAt: '',
  endAt: '',
  location: '',
  status: 'Planned',
  description: '',
})
const participant = ref({ userId: '', attendance: 'Invited', score: undefined as number | undefined })

async function fetchData(): Promise<void> {
  loading.value = true
  try {
    const [trainingPage, userPage, categoryDictionary, statusDictionary] = await Promise.all([
      workforceApi.getTraining({ page: 1, pageSize: 100 }),
      userApi.getList({ page: 1, pageSize: 100, status: 'Active' }),
      dictionaryApi.getByCode('training_category'),
      dictionaryApi.getByCode('training_status'),
    ])
    records.value = trainingPage.list
    users.value = userPage.list
    categories.value = categoryDictionary.items
    statuses.value = statusDictionary.items
  } finally {
    loading.value = false
  }
}

async function saveTraining(): Promise<void> {
  if (editingId.value) {
    await workforceApi.updateTraining(editingId.value, form.value)
  } else {
    await workforceApi.createTraining(form.value)
  }
  Message.success(editingId.value ? '培训计划已更新' : '培训计划已创建')
  dialogVisible.value = false
  await fetchData()
}

function openTraining(row?: TrainingPlan): void {
  editingId.value = row?.id ?? ''
  form.value = row
    ? {
        title: row.title,
        category: row.category,
        trainerName: row.trainerName ?? '',
        trainerId: row.trainerId ?? '',
        startAt: row.startAt,
        endAt: row.endAt ?? '',
        location: row.location ?? '',
        status: row.status,
        description: row.description ?? '',
      }
    : {
        title: '',
        category: categories.value[0]?.itemValue ?? '',
        trainerName: '',
        trainerId: '',
        startAt: '',
        endAt: '',
        location: '',
        status: 'Planned',
        description: '',
      }
  dialogVisible.value = true
}

async function completeTraining(row: TrainingPlan): Promise<void> {
  await workforceApi.completeTraining(row.id)
  Message.success('培训已完成，参加人员完成时间已记录')
  await fetchData()
}

function openParticipant(row: TrainingPlan): void {
  selectedTraining.value = row
  participant.value = { userId: '', attendance: 'Invited', score: undefined }
  participantVisible.value = true
}

async function addParticipant(): Promise<void> {
  if (!selectedTraining.value) return
  await workforceApi.addParticipant(selectedTraining.value.id, participant.value)
  Message.success('参与人员已保存')
  participantVisible.value = false
  await fetchData()
}

async function sign(row: TrainingPlan): Promise<void> {
  await workforceApi.signTraining(row.id)
  Message.success('签到成功')
  await fetchData()
}

async function openMaterials(row: TrainingPlan): Promise<void> {
  selectedTraining.value = row
  materialsVisible.value = true
  materialFiles.value = []
  const page = await attachmentApi.getList({
    ownerType: 'TrainingPlan',
    ownerId: row.id,
    page: 1,
    pageSize: 100,
  })
  materials.value = page.list
}

function selectMaterials(event: Event): void {
  materialFiles.value = Array.from((event.target as HTMLInputElement).files ?? [])
}

async function uploadMaterials(): Promise<void> {
  if (!selectedTraining.value || !materialFiles.value.length) return
  const data = new FormData()
  materialFiles.value.forEach((file) => data.append('files', file))
  data.append('ownerType', 'TrainingPlan')
  data.append('ownerId', selectedTraining.value.id)
  data.append('category', uploadCategory.value)
  await attachmentApi.upload(data)
  Message.success('培训资料已上传')
  await openMaterials(selectedTraining.value)
}

function openMaterial(item: Attachment): void {
  filePreview.openPreview({ source: 'attachment', id: item.id, title: item.originalName })
}

async function deleteMaterial(item: Attachment): Promise<void> {
  await attachmentApi.delete(item.id)
  if (selectedTraining.value) await openMaterials(selectedTraining.value)
}

onMounted(fetchData)
</script>

<template>
  <section class="resource-page">
    <div class="page-toolbar">
      <div><h2>培训记录</h2><p>维护培训计划、参加人员、签到和完成情况</p></div>
      <a-button type="primary" @click="openTraining()">
        新建培训
      </a-button>
    </div>
    <a-table
      v-loading="loading"
      :data="records"
      border
      stripe
    >
      <a-table-column prop="title" label="培训主题" :min-width="220" />
      <a-table-column prop="category" label="分类" :width="120" />
      <a-table-column label="培训人" :width="120">
        <template #default="{ row }">
          {{ row.trainer?.realName || row.trainerName || '-' }}
        </template>
      </a-table-column>
      <a-table-column prop="startAt" label="开始时间" :width="180" />
      <a-table-column prop="location" label="地点" :width="140" />
      <a-table-column label="参加人员" :min-width="220">
        <template #default="{ row }">
          <a-tag v-for="item in row.participants" :key="item.id" class="participant-tag">
            {{ item.user.realName }} / {{ item.attendance }}
          </a-tag>
        </template>
      </a-table-column>
      <a-table-column prop="status" label="状态" :width="100" />
      <a-table-column label="操作" :width="270">
        <template #default="{ row }">
          <a-button text @click="openTraining(row)">
            编辑
          </a-button>
          <a-button text type="primary" @click="openParticipant(row)">
            人员
          </a-button>
          <a-button text status="success" type="secondary" @click="sign(row)">
            签到
          </a-button>
          <a-button text @click="openMaterials(row)">
            资料
          </a-button>
          <a-button
            v-if="row.status !== 'Completed'"
            text
            status="success" type="secondary"
            @click="completeTraining(row)"
          >
            完成
          </a-button>
        </template>
      </a-table-column>
    </a-table>

    <a-dialog v-model="dialogVisible" :title="editingId ? '编辑培训计划' : '新建培训计划'" width="620px">
      <a-form :model="form" label-width="90px">
        <a-form-item label="培训主题">
          <a-input v-model="form.title" />
        </a-form-item>
        <a-form-item label="分类">
          <a-select v-model="form.category">
            <a-option
              v-for="item in categories"
              :key="item.id"
              :label="item.itemLabel"
              :value="item.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="培训人">
          <a-select
            v-model="form.trainerId"
            filterable
            clearable
            style="width:100%"
          >
            <a-option
              v-for="user in users"
              :key="user.id"
              :label="`${user.realName} (${user.username})`"
              :value="user.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="开始时间">
          <a-date-picker v-model="form.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss[Z]" />
        </a-form-item>
        <a-form-item label="结束时间">
          <a-date-picker v-model="form.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss[Z]" />
        </a-form-item>
        <a-form-item label="地点">
          <a-input v-model="form.location" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model="form.status">
            <a-option
              v-for="item in statuses"
              :key="item.id"
              :label="item.itemLabel"
              :value="item.itemValue"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="说明">
          <a-textarea v-model="form.description" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="saveTraining">
          保存
        </a-button>
      </template>
    </a-dialog>

    <a-dialog v-model="materialsVisible" title="培训文件与录屏" width="680px">
      <div class="material-upload">
        <a-segmented
          v-model="uploadCategory"
          :options="[
            { label: '培训文件', value: 'material' },
            { label: '培训录屏', value: 'recording' },
          ]"
        />
        <input
          type="file"
          multiple
          :accept="uploadCategory === 'recording'
            ? '.mp4,.mov,.webm'
            : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.png,.md'"
          @change="selectMaterials"
        />
        <a-button type="primary" :disabled="!materialFiles.length" @click="uploadMaterials">
          上传
        </a-button>
      </div>
      <a-table :data="materials" border>
        <a-table-column label="类型" :width="100">
          <template #default="{ row }">
            {{ row.category === 'recording' ? '培训录屏' : '培训文件' }}
          </template>
        </a-table-column>
        <a-table-column prop="originalName" label="文件" :min-width="240" />
        <a-table-column prop="uploader.realName" label="上传人" :width="110" />
        <a-table-column prop="createdAt" label="上传时间" :width="180" />
        <a-table-column label="操作" :width="130">
          <template #default="{ row }">
            <a-button text type="primary" @click="openMaterial(row)">
              查看
            </a-button>
            <a-button text status="danger" type="secondary" @click="deleteMaterial(row)">
              删除
            </a-button>
          </template>
        </a-table-column>
      </a-table>
    </a-dialog>

    <a-dialog v-model="participantVisible" title="添加参加人员" width="520px">
      <a-form :model="participant" label-width="90px">
        <a-form-item label="人员">
          <a-select v-model="participant.userId" filterable style="width:100%">
            <a-option
              v-for="user in users"
              :key="user.id"
              :label="user.realName"
              :value="user.id"
            />
          </a-select>
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model="participant.attendance">
            <a-option label="已邀请" value="Invited" />
            <a-option label="已参加" value="Attended" />
            <a-option label="缺席" value="Absent" />
          </a-select>
        </a-form-item>
        <a-form-item label="成绩">
          <a-input-number v-model="participant.score" :min="0" :max="100" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button type="primary" @click="addParticipant">
          保存
        </a-button>
      </template>
    </a-dialog>
  </section>
</template>

<style scoped lang="scss">
.participant-tag { margin:2px 4px 2px 0; }
.material-upload { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
@media (max-width: 640px) {
  .material-upload { align-items:flex-start; flex-direction:column; }
}
</style>
