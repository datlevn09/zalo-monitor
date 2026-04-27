import type { FastifyPluginAsync } from 'fastify'
import fs from 'fs'
import path from 'path'

export const installRoutes: FastifyPluginAsync = async (app) => {
  // Serve docker-compose.yml for customers
  app.get('/docker-compose.yml', async (req, reply) => {
    const candidates = [
      path.resolve(process.cwd(), '..', 'docker-compose.customer.yml'),
      path.resolve('/app', '..', 'docker-compose.customer.yml'),
      path.resolve('/app/docker-compose.customer.yml'),
    ]
    const file = candidates.find((f) => fs.existsSync(f))
    if (!file) return reply.status(404).send('Not found')
    reply.header('Content-Type', 'text/plain; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="docker-compose.yml"')
    return fs.readFileSync(file, 'utf-8')
  })

  // Serve .env example
  app.get('/.env.example', async (req, reply) => {
    const candidates = [
      path.resolve(process.cwd(), '..', '.env.customer.example'),
      path.resolve('/app', '..', '.env.customer.example'),
      path.resolve('/app/.env.customer.example'),
    ]
    const file = candidates.find((f) => fs.existsSync(f))
    if (!file) return reply.status(404).send('Not found')
    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return fs.readFileSync(file, 'utf-8')
  })

  // Serve install.sh
  app.get('/install.sh', async (req, reply) => {
    const candidates = [
      path.resolve(process.cwd(), '..', 'install', 'install.sh'),
      path.resolve('/app', '..', 'install', 'install.sh'),
      path.resolve('/app/install/install.sh'),
    ]
    const file = candidates.find((f) => fs.existsSync(f))
    if (!file) return reply.status(404).send('Not found')
    reply.header('Content-Type', 'text/plain; charset=utf-8')
    return fs.readFileSync(file, 'utf-8')
  })
}
