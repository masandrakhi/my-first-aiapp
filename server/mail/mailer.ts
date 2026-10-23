import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createTransport } from 'nodemailer'

export interface MailMessage {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  send(message: MailMessage): Promise<void>
}

/** Tests: keeps messages in memory for assertions. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = []
  async send(message: MailMessage) {
    this.sent.push(message)
  }
}

/** Local development: writes each email to a file in `.data/outbox` (never to the logs). */
export class DevOutboxMailer implements Mailer {
  private readonly dir: string
  constructor(dir: string) {
    this.dir = dir
  }
  async send(message: MailMessage) {
    await mkdir(this.dir, { recursive: true })
    await writeFile(join(this.dir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(message, null, 2))
  }
}

/** Production: sends through Resend's HTTP API. */
export class ResendMailer implements Mailer {
  private readonly apiKey: string
  private readonly from: string
  constructor(apiKey: string, from: string) {
    this.apiKey = apiKey
    this.from = from
  }
  async send(message: MailMessage) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
    })
    if (!res.ok) throw new Error(`Email provider responded ${res.status}`)
  }
}

export interface SmtpSettings {
  host: string
  port: number
  user: string
  pass: string
}

/** The one call SmtpMailer needs from a nodemailer transport (a fake in tests). */
export interface SmtpTransport {
  sendMail(mail: { from: string; to: string; subject: string; text: string; textEncoding: 'base64' }): Promise<unknown>
}

/** Production alternative to Resend: sends through an SMTP server such as Gmail (with an App Password). */
export class SmtpMailer implements Mailer {
  private readonly transport: SmtpTransport
  private readonly from: string
  constructor(transport: SmtpTransport, from: string) {
    this.transport = transport
    this.from = from
  }

  /** Port 465 uses TLS from the start; anything else upgrades with STARTTLS (never plain text). */
  static connect({ host, port, user, pass }: SmtpSettings, from: string) {
    const transport = createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, auth: { user, pass } })
    return new SmtpMailer(transport, from)
  }

  async send(message: MailMessage) {
    // base64 rather than quoted-printable, so long links are never split by soft line breaks.
    await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text, textEncoding: 'base64' })
  }
}
