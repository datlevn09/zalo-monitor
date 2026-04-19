import { db } from '../src/services/db.js'
async function main() {
  const users = await db.user.findMany({ select: { email: true, name: true, tenant: { select: { name: true } } } })
  console.log('Users:')
  users.forEach(u => console.log(`  ${u.email ?? '(no email)'} — ${u.name} @ ${u.tenant.name}`))
}
main().then(() => process.exit(0))
