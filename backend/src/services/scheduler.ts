/**
 * BullMQ-based scheduler cho digest + các jobs định kỳ
 *
 * Dùng repeatable jobs: BullMQ tự schedule theo cron expression
 * Khi process restart → job không bị duplicate vì repeat key dựa trên cron
 */

import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { generateDigestForAllTenants } from './digest.js'
import { rerankTopGroups, syncZaloGroupHistory } from './zalo-sync.js'
import { db } from './db.js'
import { detectAnomaliesAllTenants } from './anomaly.js'

const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const schedulerQueue = new Queue('scheduler', { connection })

// Worker xử lý các job định kỳ
new Worker('scheduler', async (job) => {
  console.log(`[scheduler] Running job: ${job.name}`)
  switch (job.name) {
    case 'daily-digest':
      await generateDigestForAllTenants()
      break
    case 'rerank-groups': {
      const tenants = await db.tenant.findMany({ select: { id: true } })
      for (const t of tenants) {
        try {
          const r = await rerankTopGroups(t.id)
          if (r.enabled || r.disabled) {
            console.log(`[scheduler] rerank ${t.id}: +${r.enabled} / -${r.disabled}`)
          }
        } catch (err) {
          console.error(`[scheduler] rerank error for ${t.id}:`, err)
        }
      }
      break
    }
    case 'detect-anomalies':
      await detectAnomaliesAllTenants()
      break
    case 'zalo-incremental-sync': {
      // Mỗi 30 phút: lấy 20 tin gần nhất của TOP 20 nhóm active
      // Do dedupe theo externalId, tin mới tự vào DB, tin cũ được skip
      const tenants = await db.tenant.findMany({ select: { id: true } })
      for (const t of tenants) {
        const groups = await db.group.findMany({
          where: { tenantId: t.id, channelType: 'ZALO', monitorEnabled: true },
          orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          take: 20,
          select: { id: true, name: true },
        })
        let total = 0
        for (const g of groups) {
          try {
            const r = await syncZaloGroupHistory(t.id, g.id, 20)
            total += r.imported
          } catch {
            // skip if openzca fails
          }
          await new Promise(r => setTimeout(r, 500))
        }
        if (total > 0) console.log(`[scheduler] zalo-sync ${t.id}: +${total} tin mới`)
      }
      break
    }
    case 'remind-appointments': {
      const now = new Date()
      const appts = await db.appointment.findMany({
        where: {
          status: 'UPCOMING',
          reminderSent: false,
          scheduledAt: { gt: now },
        },
      })
      for (const appt of appts) {
        const remindAt = new Date(appt.scheduledAt.getTime() - appt.remindBefore * 60_000)
        if (remindAt <= now) {
          const channels = await db.notificationChannel.findMany({
            where: { tenantId: appt.tenantId, enabled: true, purpose: { in: ['ALERT', 'BOTH'] } },
          })
          const msg = `⏰ Nhắc lịch hẹn: *${appt.title}*\n📅 ${appt.scheduledAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}${appt.description ? `\n📝 ${appt.description}` : ''}`
          for (const ch of channels) {
            try {
              if (ch.channelType === 'TELEGRAM') {
                await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: ch.target, text: msg, parse_mode: 'Markdown' }),
                })
              }
            } catch {}
          }
          await db.appointment.update({ where: { id: appt.id }, data: { reminderSent: true } })
          console.log(`[scheduler] reminder sent: ${appt.title}`)
        }
      }
      break
    }
    case 'reset-monthly-counter': {
      // Reset 0 cho tất cả tenant — chạy 00:05 ngày 1 đầu tháng
      const r = await db.tenant.updateMany({
        data: { messagesThisMonth: 0, usageResetAt: new Date() },
      })
      console.log(`[scheduler] reset-monthly-counter: reset ${r.count} tenants`)
      break
    }
    case 'onboard-reminder': {
      // Nhắc khách chưa kết nối Zalo — gửi email cho OWNER tenant nào chưa có
      // listener ping HOẶC chưa có group nào (= chưa sync history thành công).
      const { sendMail } = await import('./mailer.js')
      const reminderRound = job.data?.round ?? 1  // 1 = lần đầu, 2 = nhắc lại
      const tenants = await db.tenant.findMany({
        where: { active: true },
        include: {
          users: { where: { role: 'OWNER' }, take: 1, select: { email: true, name: true } },
          _count: { select: { groups: true } },
        },
      })
      let sent = 0
      for (const t of tenants) {
        // Skip nếu đã ping VÀ có >=1 group (đã sync OK)
        if (t.lastHookPingAt && t._count.groups > 0) continue
        const owner = t.users[0]
        if (!owner?.email) continue
        const installUrl = `https://zalo.datthongdong.com/dashboard`
        const docsUrl = `https://zalo.datthongdong.com/dashboard/docs/install`
        const greeting = reminderRound === 1
          ? `Chào ${owner.name},\n\nDoanh nghiệp "${t.name}" của bạn đã đăng ký Zalo Monitor nhưng chưa kết nối Zalo cá nhân — nên dashboard chưa có dữ liệu.`
          : `Chào ${owner.name},\n\nĐây là email nhắc lại — doanh nghiệp "${t.name}" của bạn vẫn chưa kết nối Zalo. Có thể bạn đang gặp khó khăn?`
        const text = `${greeting}

CÁCH KẾT NỐI (chỉ 2 click, không cần biết Terminal):
1. Mở dashboard: ${installUrl}
2. Bấm nút "Cài đặt cho Mac" hoặc "Cài đặt cho Windows" (auto-detect máy)
3. Tải file về → double-click → cửa sổ đen tự cài + bật QR
4. Mở Zalo trên điện thoại → quét QR

Tin nhắn từ Zalo sẽ tự về dashboard sau khi quét xong.

Hướng dẫn chi tiết: ${docsUrl}

Cần hỗ trợ trực tiếp? Reply email này hoặc Telegram @datlevn.

— Lê Đạt (dat.thong.dong)
`
        try {
          await sendMail({
            to: owner.email,
            subject: reminderRound === 1
              ? `[Zalo Monitor] Hoàn tất cài đặt cho "${t.name}" — chỉ 2 click`
              : `[Zalo Monitor] Nhắc lại — "${t.name}" vẫn chưa kết nối Zalo`,
            text,
          })
          sent++
        } catch (e: any) {
          console.error(`[onboard-reminder] sendMail failed for ${owner.email}:`, e?.message)
        }
      }
      console.log(`[scheduler] onboard-reminder round=${reminderRound}: sent ${sent} emails`)
      break
    }
    default:
      console.warn(`[scheduler] Unknown job: ${job.name}`)
  }
}, { connection })

// Đăng ký job daily digest — chạy 8:00 mỗi sáng (giờ server)
export async function registerScheduledJobs() {
  // Xóa job cũ trước (nếu cron thay đổi)
  const repeatable = await schedulerQueue.getRepeatableJobs()
  for (const r of repeatable) {
    if (r.name === 'daily-digest') await schedulerQueue.removeRepeatableByKey(r.key)
  }

  const cron = process.env.DIGEST_CRON ?? '0 8 * * *'  // default 08:00 hàng ngày
  await schedulerQueue.add(
    'daily-digest',
    {},
    { repeat: { pattern: cron, tz: 'Asia/Ho_Chi_Minh' } },
  )
  console.log(`[scheduler] daily-digest registered (cron: ${cron} Asia/Ho_Chi_Minh)`)

  // Rerank groups mỗi giờ
  await schedulerQueue.add(
    'rerank-groups',
    {},
    { repeat: { pattern: '0 * * * *', tz: 'Asia/Ho_Chi_Minh' } },
  )
  console.log(`[scheduler] rerank-groups registered (hourly)`)

  // Zalo incremental sync mỗi 30 phút
  await schedulerQueue.add(
    'zalo-incremental-sync',
    {},
    { repeat: { pattern: '*/30 * * * *', tz: 'Asia/Ho_Chi_Minh' } },
  )
  console.log(`[scheduler] zalo-incremental-sync registered (every 30 minutes)`)

  // Anomaly detection mỗi 6 giờ
  await schedulerQueue.add(
    'detect-anomalies',
    {},
    { repeat: { pattern: '0 */6 * * *', tz: 'Asia/Ho_Chi_Minh' } },
  )
  console.log(`[scheduler] detect-anomalies registered (every 6 hours)`)

  // Appointment reminders: check every 5 minutes
  await schedulerQueue.add(
    'remind-appointments',
    {},
    { repeat: { pattern: '*/5 * * * *', tz: 'Asia/Ho_Chi_Minh' } },
  )
  console.log(`[scheduler] remind-appointments registered (every 5 minutes)`)

  // Reset counter messagesThisMonth — 00:05 ngày 1 đầu tháng (Asia/Ho_Chi_Minh)
  await schedulerQueue.add(
    'reset-monthly-counter',
    {},
    { repeat: { pattern: '5 0 1 * *', tz: 'Asia/Ho_Chi_Minh' } },
  )
  console.log(`[scheduler] reset-monthly-counter registered (00:05 day-1 monthly)`)

  // Onboard reminder — 1 lần 8h sáng 2026-05-01 (mai), nhắc lại 8h sáng 2026-05-04
  // Asia/Ho_Chi_Minh = UTC+7 → 8h VN = 1h UTC
  const remind1 = new Date('2026-05-01T01:00:00.000Z') // 8h VN
  const remind2 = new Date('2026-05-04T01:00:00.000Z') // 8h VN
  const now = Date.now()
  if (remind1.getTime() > now) {
    await schedulerQueue.add(
      'onboard-reminder',
      { round: 1 },
      { delay: remind1.getTime() - now, jobId: 'onboard-reminder-r1' },
    )
    console.log(`[scheduler] onboard-reminder R1 scheduled at ${remind1.toISOString()}`)
  }
  if (remind2.getTime() > now) {
    await schedulerQueue.add(
      'onboard-reminder',
      { round: 2 },
      { delay: remind2.getTime() - now, jobId: 'onboard-reminder-r2' },
    )
    console.log(`[scheduler] onboard-reminder R2 scheduled at ${remind2.toISOString()}`)
  }
}
