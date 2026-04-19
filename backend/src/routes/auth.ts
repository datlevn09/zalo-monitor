import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { db } from '../services/db.js'
import { createHash } from 'crypto'

const loginSchema = z.object({
  tenantSlug: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
})

function hashPassword(password: string) {
  return createHash('sha256').update(password).digest('hex')
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body)
    if (!body.success) return reply.status(400).send({ error: 'Invalid input' })

    const { tenantSlug, email, password } = body.data
    const user = await db.user.findFirst({
      where: {
        email,
        passwordHash: hashPassword(password),
        tenant: { slug: tenantSlug },
      },
      include: { tenant: true },
    })

    if (!user) return reply.status(401).send({ error: 'Invalid credentials' })

    const token = app.jwt.sign({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
    })

    return { token, user: { id: user.id, name: user.name, role: user.role, tenant: user.tenant } }
  })
}
