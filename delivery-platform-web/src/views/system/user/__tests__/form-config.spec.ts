import { describe, expect, it, vi } from 'vitest'

import { passwordFormRules, userFormRules, validateArcoForm } from '../form-config'

describe('user form configuration', () => {
  it('treats Arco undefined validation result as success', async () => {
    const validate = vi.fn().mockResolvedValue(undefined)
    await expect(validateArcoForm({ validate })).resolves.toBe(true)
    expect(validate).toHaveBeenCalledOnce()
  })

  it('rejects returned validation errors and thrown validation failures', async () => {
    await expect(validateArcoForm({
      validate: vi.fn().mockResolvedValue({ password: { message: 'invalid' } }),
    })).resolves.toBe(false)
    await expect(validateArcoForm({
      validate: vi.fn().mockRejectedValue(new Error('invalid')),
    })).resolves.toBe(false)
  })

  it('keeps create and reset password limits aligned with the API', () => {
    expect(userFormRules.password).toEqual(expect.arrayContaining([
      expect.objectContaining({ minLength: 6, maxLength: 100 }),
    ]))
    expect(passwordFormRules.newPassword).toEqual(expect.arrayContaining([
      expect.objectContaining({ minLength: 6, maxLength: 100 }),
    ]))
  })
})
