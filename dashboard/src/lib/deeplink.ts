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
  // Prefer phone (web-friendly)
  if (opts.phone) {
    const clean = opts.phone.replace(/[^\d+]/g, '')
    return `https://zalo.me/${clean}`
  }
  // Zalo ID fallback (opens in mobile app via deep link, web may show profile)
  if (opts.zaloId) return `https://zalo.me/${opts.zaloId}`
  return null
}

export function zaloGroupLink(externalId: string): string {
  // Mở group trong Zalo Web (nếu đã login)
  return `https://chat.zalo.me/?id=g${externalId}`
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
