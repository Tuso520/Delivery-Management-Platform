export const FEISHU_AUTO_LOGIN_SESSION_KEY = 'delivery-platform:feishu-auto-login-attempted'

export function isFeishuClient(userAgent = window.navigator.userAgent): boolean {
  return /(?:Lark|Feishu)/i.test(userAgent)
}

export function suppressFeishuAutoLogin(
  storage: Pick<Storage, 'setItem'> = window.sessionStorage,
): boolean {
  try {
    storage.setItem(FEISHU_AUTO_LOGIN_SESSION_KEY, '1')
    return true
  } catch {
    // 主动退出不依赖浏览器存储成功；失败时仍继续清理系统会话。
    return false
  }
}

export function claimFeishuAutoLogin(
  storage: Pick<Storage, 'getItem' | 'setItem'> = window.sessionStorage,
  userAgent?: string,
): boolean {
  if (!isFeishuClient(userAgent)) return false

  try {
    if (storage.getItem(FEISHU_AUTO_LOGIN_SESSION_KEY) === '1') return false
    return suppressFeishuAutoLogin(storage)
  } catch {
    // 无法持久化单次尝试标记时不自动跳转，避免异常回调循环；用户仍可手动登录。
    return false
  }
}
