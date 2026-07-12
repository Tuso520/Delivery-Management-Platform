<script setup lang="ts">
import { ref } from 'vue'
import type { FormInstance } from '@arco-design/web-vue'
import { BusinessDrawer } from '@/components/business'
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
  <BusinessDrawer
    v-model:visible="visible"
    :title="isEdit ? '编辑用户' : '创建用户'"
    size="sm"
    :mask-closable="false"
  >
    <a-form
      ref="formRef"
      :model="formData"
      :rules="userFormRules"
      auto-label-width
    >
      <a-form-item label="用户名" field="username">
        <a-input v-model="formData.username" :disabled="isEdit" :max-length="50" />
      </a-form-item>
      <a-form-item v-if="!isEdit" label="密码" field="password">
        <a-input v-model="formData.password" type="password" :max-length="100" />
      </a-form-item>
      <a-form-item label="真实姓名" field="realName">
        <a-input v-model="formData.realName" :max-length="50" />
      </a-form-item>
      <a-form-item label="所属部门">
        <a-tree-select
          v-model="formData.departmentId"
          :data="departments"
          :field-names="{ key: 'id', title: 'departmentName', children: 'children' }"
          allow-clear
          tree-check-strictly
          allow-search
          placeholder="请选择部门"
        />
      </a-form-item>
      <a-form-item label="邮箱" field="email">
        <a-input v-model="formData.email" :max-length="100" />
      </a-form-item>
      <a-form-item label="手机号" field="phone">
        <a-input v-model="formData.phone" :max-length="30" />
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
  </BusinessDrawer>
</template>

<style scoped>
.arco-tree-select {
  width: 100%;
}
</style>
