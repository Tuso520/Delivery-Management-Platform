<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { reportApi } from '@/api/report'
import { projectApi } from '@/api/project'
import { REPORT_TYPE_OPTIONS } from '@/types/report'
import type { Project } from '@/types/project'
import dayjs from 'dayjs'

const router = useRouter()

const loading = ref(false)
const projectList = ref<Project[]>([])
const formRef = ref()

const formData = reactive({
  projectId: '',
  reportType: 'weekly',
  reportDate: dayjs().format('YYYY-MM-DD'),
  content: '',
  workHours: undefined as number | undefined,
  projectProgress: '',
  paymentProgress: '',
  riskNotes: '',
  nextPlan: '',
})

const formRules = {
  projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
  reportType: [{ required: true, message: '请选择报告类型', trigger: 'change' }],
  reportDate: [{ required: true, message: '请选择报告日期', trigger: 'change' }],
  content: [{ required: true, message: '请输入报告内容', trigger: 'blur' }],
}

const fetchProjects = async () => {
  try {
    const res = await projectApi.getList({ page: 1, pageSize: 200, keyword: '' })
    projectList.value = res.list
  } catch {
    projectList.value = []
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await reportApi.create({ ...formData, workHours: formData.workHours ?? undefined })
    Message.success('报告创建成功')
    router.push('/report')
  } catch {
    // error handled by interceptor
  } finally {
    loading.value = false
  }
}

const handleCancel = () => {
  router.push('/report')
}

onMounted(() => {
  fetchProjects()
})
</script>

<template>
  <div class="report-create-page">
    <div class="page-header">
      <h2>撰写报告</h2>
    </div>

    <a-card>
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
        class="report-form"
      >
        <a-row :gutter="24">
          <a-col :span="12">
            <a-form-item label="报告类型" prop="reportType">
              <a-select v-model="formData.reportType" style="width: 100%">
                <a-option
                  v-for="opt in REPORT_TYPE_OPTIONS"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="报告日期" prop="reportDate">
              <a-date-picker
                v-model="formData.reportDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="关联项目" prop="projectId">
          <a-select
            v-model="formData.projectId"
            filterable
            placeholder="请选择项目"
            style="width: 100%"
          >
            <a-option
              v-for="proj in projectList"
              :key="proj.id"
              :label="proj.projectName"
              :value="proj.id"
            />
          </a-select>
        </a-form-item>

        <a-form-item label="工作内容" prop="content">
          <a-textarea
            v-model="formData.content"

            :rows="6"
            placeholder="请详细描述本周期完成的工作内容.."
            :maxlength="5000"
            show-word-limit
          />
        </a-form-item>

        <a-row :gutter="24">
          <a-col :span="8">
            <a-form-item label="工时(h)">
              <a-input-number
                v-model="formData.workHours"
                :min="0"
                :max="24"
                :precision="1"
                :step="0.5"
                style="width: 100%"
                placeholder="工作小时数"
              />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="项目进度">
              <a-input v-model="formData.projectProgress" :maxlength="500" placeholder="当前项目进度概述" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="回款进度">
              <a-input v-model="formData.paymentProgress" :maxlength="500" placeholder="回款情况" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="风险备注">
          <a-textarea
            v-model="formData.riskNotes"

            :rows="3"
            placeholder="当前存在的风险或问题..."
            :maxlength="2000"
            show-word-limit
          />
        </a-form-item>

        <a-form-item label="下一步计划">
          <a-textarea
            v-model="formData.nextPlan"

            :rows="3"
            placeholder="下一周期的工作计划..."
            :maxlength="2000"
            show-word-limit
          />
        </a-form-item>

        <a-form-item>
          <a-button type="primary" :loading="loading" @click="handleSubmit">
            提交
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
.report-create-page {
  min-width: 0;

  .page-header {
    margin-bottom: 16px;

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
  }

  .report-form {
    max-width: 900px;
  }
}
</style>
