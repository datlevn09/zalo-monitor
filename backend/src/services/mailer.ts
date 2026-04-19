import nodemailer from 'nodemailer'

type MailInput = {
  to: string
  subject: string
  text: string
  html?: string
}

let transporterCache: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (transporterCache) return transporterCache

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) return null

  transporterCache = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return transporterCache
}

export async function sendMail(input: MailInput): Promise<void> {
  const t = getTransporter()
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER

  if (!t) {
    // SMTP chưa config — log ra console để dev xem, không throw
    console.warn('[mailer] SMTP_HOST/USER/PASS chưa cấu hình. Email không được gửi:')
    console.warn(`  → To: ${input.to}`)
    console.warn(`  → Subject: ${input.subject}`)
    console.warn(`  → Text: ${input.text.slice(0, 200)}...`)
    return
  }

  await t.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
}
