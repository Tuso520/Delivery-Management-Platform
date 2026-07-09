import type { FormRules } from '@/types/arco'
import type { TagType } from '@/types/ui'
import type { FormInstance } from '@arco-design/web-vue'

export interface UserFormModel {
  username: string
  password: string
  realName: string
  email: string
  phone: string
  departmentId: string
}

export const userFormRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { minLength: 2, maxLength: 50, message: '用户名长度 2-50 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { minLength: 6, maxLength: 100, message: '密码长度为 6-100 个字符', trigger: 'blur' },
  ],
  realName: [
    { required: true, message: '请输入真实姓名', trigger: 'blur' },
    { maxLength: 50, message: '真实姓名最多 50 个字符', trigger: 'blur' },
  ],
  email: [
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
}

export const passwordFormRules: FormRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { minLength: 6, maxLength: 100, message: '密码长度为 6-100 个字符', trigger: 'blur' },
  ],
}

export async function validateArcoForm(
  form: Pick<FormInstance, 'validate'> | undefined,
): Promise<boolean> {
  if (!form) return false
  try {
    const errors = await form.validate()
    return !errors
  } catch {
    return false
  }
}

export function getUserStatusTagType(status: string): TagType {
  const statusTypes: Record<string, TagType> = {
    Active: 'success',
    Inactive: 'info',
    Locked: 'danger',
  }
  return statusTypes[status] ?? 'info'
}

export function getUserStatusLabel(status: string): string {
  return { Active: '活跃', Inactive: '禁用', Locked: '锁定' }[status] ?? status
}
