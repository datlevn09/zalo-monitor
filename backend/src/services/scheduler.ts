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
}
