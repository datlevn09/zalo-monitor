/**
 * Zalo deep link helpers.
 *
 * Lưu ý: Zalo web KHÔNG support link tới message cụ thể.
 * Chỉ support mở chat/group.
 */

export function zaloChatUserLink(opts: {
  phone?: string | null
  zaloId?: string | null
}): string | null {
  // Mở Zalo native app — tránh chat.zalo.me (Zalo Web)
  if (opts.zaloId) return `zalo://conversation?id=${opts.zaloId}`
  if (opts.phone) {
    const clean = opts.phone.replace(/[^\d+]/g, '')
    return `zalo://chat?phone=${clean}`
  }
  return null
}

export function zaloGroupLink(externalId: string): string {
  // Mở Zalo native app (KHÔNG dùng chat.zalo.me — risk user scan QR đăng nhập nhầm)
  return `zalo://conversation?groupid=${externalId}`
}

export function telegramChatLink(chatId: string): string | null {
  // Telegram supergroup: -100... → https://t.me/c/...
  const n = chatId.replace(/^-100/, '').replace(/^-/, '')
  if (/^\d+$/.test(n)) return `https://t.me/c/${n}`
  return null
}

export function channelDeepLink(channelType: string, externalId: string): string | null {
  switch (channelType) {
    case 'ZALO':     return zaloGroupLink(externalId)
    case 'TELEGRAM': return telegramChatLink(externalId)
    default: return null
  }
}
