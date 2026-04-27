import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { setupRoutes } from './routes/setup.js'
import { webhookRoutes } from './routes/webhook.js'
import { zaloWebhookRoutes } from './routes/webhook-zalo.js'
import { groupRoutes } from './routes/groups.js'
import { alertRoutes } from './routes/alerts.js'
import { authRoutes } from './routes/auth.js'
import { statsRoutes } from './routes/stats.js'
import { messageRoutes } from './routes/messages.js'
import { tenantRoutes } from './routes/tenants.js'
import { zaloAdminRoutes } from './routes/zalo-admin.js'
import { analyticsRoutes } from './routes/analytics.js'
import { searchRoutes } from './routes/search.js'
import { customerRoutes } from './routes/customers.js'
import { aiChatRoutes } from './routes/ai-chat.js'
import { alertRuleRoutes } from './routes/alert-rules.js'
import { dealRoutes } from './routes/deals.js'
import { teamRoutes } from './routes/team.js'
import { exportRoutes } from './routes/export.js'
import { configRoutes } from './routes/config.js'
import { conversationAiRoutes } from './routes/conversation-ai.js'
import { appointmentRoutes } from './routes/appointments.js'
import { superAdminRoutes } from './routes/super-admin.js'
import { registerTenantGuard } from './services/tenant-guard.js'
import { registerAuthGuard } from './services/auth-guard.js'
import { wsManager } from './services/websocket.js'
import { registerScheduledJobs } from './services/scheduler.js'
import { generateDigestForTenant } from './services/digest.js'
import { startTelegramPoller } from './services/telegram-poller.js'
import { validateLicense, getLicenseMode } from './services/license.js'
import { installRoutes } from './routes/install.js'

const app = Fastify({ logger: true })

await app.register(cors, { origin: true })
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'dev-secret' })
await app.register(websocket)

// Bắt buộc JWT cho mọi route /api/* (trừ /api/auth, /api/setup, /api/super-admin, /webhook)
registerAuthGuard(app)

// Block suspended / expired tenants trước khi vào bất kỳ route nào
registerTenantGuard(app)

// WebSocket endpoint for dashboard real-time
app.get('/ws', { websocket: true }, (socket) => {
  wsManager.add(socket)
  socket.on('close', () => wsManager.remove(socket))
})

// Routes
await app.register(installRoutes, { prefix: '/install' })
await app.register(authRoutes,    { prefix: '/api/auth' })
await app.register(setupRoutes,   { prefix: '/api/setup' })
await app.register(webhookRoutes,     { prefix: '/webhook' })
await app.register(zaloWebhookRoutes, { prefix: '/webhook/zalo' })
await app.register(groupRoutes,   { prefix: '/api/groups' })
await app.register(alertRoutes,   { prefix: '/api/alerts' })
await app.register(statsRoutes,   { prefix: '/api/stats' })
await app.register(messageRoutes, { prefix: '/api/messages' })
await app.register(tenantRoutes,  { prefix: '/api/tenants' })
await app.register(zaloAdminRoutes, { prefix: '/api/zalo' })
await app.register(analyticsRoutes, { prefix: '/api/analytics' })
await app.register(searchRoutes,    { prefix: '/api/search' })
await app.register(customerRoutes,  { prefix: '/api/customers' })
await app.register(aiChatRoutes,    { prefix: '/api/ai-chat' })
await app.register(alertRuleRoutes, { prefix: '/api/alert-rules' })
await app.register(dealRoutes,      { prefix: '/api/deals' })
await app.register(teamRoutes,      { prefix: '/api/team' })
await app.register(exportRoutes,    { prefix: '/api/export' })
await app.register(configRoutes,    { prefix: '/api/config' })
await app.register(superAdminRoutes, { prefix: '/api/super-admin' })
await app.register(conversationAiRoutes, { prefix: '/api/groups' })
await app.register(appointmentRoutes,    { prefix: '/api/appointments' })

app.get('/health', async () => ({ status: 'ok', ts: Date.now() }))

// Manual trigger digest with range (day/week/month)
app.post('/api/digest/trigger', async (req, reply) => {
  const tenantId = (req.headers['x-tenant-id'] as string) ?? (req.body as any)?.tenantId
  if (!tenantId) return reply.status(400).send({ error: 'Missing tenant id' })
  const range = ((req.body as any)?.range ?? 'day') as 'day' | 'week' | 'month'
  const result = await generateDigestForTenant(tenantId, range)
  return result ?? { ok: false, error: 'Tenant not found' }
})

const port = Number(process.env.PORT ?? 3001)

// License check (self-hosted mode only)
const licMode = getLicenseMode()
if (licMode === 'self-hosted') {
  const lic = await validateLicense()
  if (!lic.valid) {
    console.error(`❌ License không hợp lệ: ${lic.message}`)
    console.error('   Kiểm tra LICENSE_KEY trong .env')
    process.exit(1)
  }
  console.log(`✅ License OK (${lic.plan}) — self-hosted mode`)
  // Re-validate every 24h
  setInterval(async () => {
    const r = await validateLicense()
    if (!r.valid) console.warn(`⚠️  License validation failed: ${r.message}`)
  }, 24 * 60 * 60 * 1000)
} else {
  console.log('ℹ️  Running in SaaS mode (no LICENSE_KEY)')
}

await app.listen({ port, host: '0.0.0.0' })
console.log(`Backend running on port ${port}`)

// Schedule daily digest after server up
await registerScheduledJobs()

// Start Telegram polling (backend là listener duy nhất, không qua OpenClaw)
startTelegramPoller()
