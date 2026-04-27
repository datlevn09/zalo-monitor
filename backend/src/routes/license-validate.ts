import type { FastifyPluginAsync } from 'fastify'
import { db } from '../services/db.js'

export const licenseValidateRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/license/validate?key=LICENSE_KEY
  // Public endpoint — NO auth required
  // Used by self-hosted instances to validate their license against the main server
  app.get('/validate', async (req, reply) => {
    const { key } = req.query as { key?: string }

    if (!key) {
      return reply.status(400).send({ error: 'Missing license key' })
    }

    const tenant = await db.tenant.findFirst({
      where: { licenseKey: key },
      select: {
        id: true,
        name: true,
        active: true,
        licenseExpiresAt: true,
        plan: true,
        suspendedReason: true,
      },
    })

    if (!tenant) {
      return { valid: false, reason: 'invalid_key' }
    }

    if (!tenant.active) {
      return { valid: false, reason: 'suspended', suspendedReason: tenant.suspendedReason }
    }

    if (tenant.licenseExpiresAt && tenant.licenseExpiresAt < new Date()) {
      return { valid: false, reason: 'expired', expiredAt: tenant.licenseExpiresAt }
    }

    return {
      valid: true,
      plan: tenant.plan,
      expiresAt: tenant.licenseExpiresAt,
      tenantName: tenant.name,
    }
  })
}
