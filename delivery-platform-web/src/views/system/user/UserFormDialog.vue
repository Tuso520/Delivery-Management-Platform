<script setup lang="ts">
import { ref } from 'vue'
import type { FormInstance } from '@arco-design/web-vue'
import type { DepartmentNode } from '@/types/platform'
import { userFormRules, validateArcoForm, type UserFormModel } from './form-config'

defineProps<{
  isEdit: boolean
  loading: boolean
  departments: DepartmentNode[]
}>()

const emit = defineEmits<{
  submit: []
}>()
const visible = defineModel<boolean>('visible', { required: true })
const formData = defineModel<UserFormModel>('formData', { required: true })
const formRef = ref<FormInstance>()

async function handleSubmit(): Promise<void> {
  if (await validateArcoForm(formRef.value)) emit('submit')
}
</script>

<template>
  <a-dialog
    v-model="visible"
    :title="isEdit ? '编辑用户' : '创建用户'"
    width="540px"
    :close-on-click-modal="false"
  >
    <a-form
      ref="formRef"
      :model="formData"
      :rules="userFormRules"
      label-width="100px"
    >
      <a-form-item label="用户名" prop="username">
        <a-input v-model="formData.username" :disabled="isEdit" :maxlength="50" />
      </a-form-item>
      <a-form-item v-if="!isEdit" label="密码" prop="password">
        <a-input
          v-model="formData.password"
          type="password"
          show-password
          :maxlength="100"
        />
      </a-form-item>
      <a-form-item label="真实姓名" prop="realName">
        <a-input v-model="formData.realName" :maxlength="50" />
      </a-form-item>
      <a-form-item label="所属部门">
        <a-tree-select
          v-model="formData.departmentId"
          :data="departments"
          node-key="id"
          :props="{ label: 'departmentName', children: 'children' }"
          clearable
          check-strictly
          filterable
          placeholder="请选择部门"
        />
      </a-form-item>
      <a-form-item label="邮箱" prop="email">
        <a-input v-model="formData.email" :maxlength="100" />
      </a-form-item>
      <a-form-item label="手机号" prop="phone">
        <a-input v-model="formData.phone" :maxlength="30" />
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="visible = false">
        取消
      </a-button>
      <a-button type="primary" :loading="loading" @click="handleSubmit">
        保存
      </a-button>
    </template>
  </a-dialog>
</template>

<style scoped>
.arco-tree-select {
  width: 100%;
}
</style>
