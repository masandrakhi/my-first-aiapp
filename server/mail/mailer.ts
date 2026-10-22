import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

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
