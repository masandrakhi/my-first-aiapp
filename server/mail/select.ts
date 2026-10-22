/**
 * Picks how production sends email, from environment variables:
 * 1. SMTP (e.g. Gmail) when SMTP_USER and SMTP_PASS are set;
 * 2. otherwise Resend when RESEND_API_KEY is set;
 * 3. otherwise nothing is sent, and a warning is logged for each email.
 * Secrets are never logged; only the provider's name is.
 */
import type { Logger } from '../logger.js'
import { ResendMailer, SmtpMailer, type Mailer } from './mailer.js'

export type MailProvider = 'smtp' | 'resend' | 'none'

export interface MailEnv {
  SMTP_USER?: string
  SMTP_PASS?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  RESEND_API_KEY?: string
  MAIL_FROM?: string
}

const GMAIL = { host: 'smtp.gmail.com', port: 465 }

/** `resendFrom` is the configured MAIL_FROM (or its Resend default, see config.ts). */
export function selectMailer(env: MailEnv, resendFrom: string, logger: Logger, connect = SmtpMailer.connect): { mailer: Mailer; provider: MailProvider } {
  const user = env.SMTP_USER?.trim()
  // Google shows App Passwords in groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it.
  const pass = env.SMTP_PASS?.replace(/\s+/g, '')
  if (user && pass) {
    const port = Number(env.SMTP_PORT || GMAIL.port)
    if (!Number.isInteger(port) || port <= 0) throw new Error('SMTP_PORT must be a port number')
    // Gmail only sends as the signed-in account, so the sender defaults to it.
    const from = env.MAIL_FROM?.trim() || `Habits <${user}>`
    return { mailer: connect({ host: env.SMTP_HOST?.trim() || GMAIL.host, port, user, pass }, from), provider: 'smtp' }
  }
  if (env.RESEND_API_KEY) {
    return { mailer: new ResendMailer(env.RESEND_API_KEY, resendFrom), provider: 'resend' }
  }
  return { mailer: { send: async () => logger.warn('email not sent: no email provider configured') }, provider: 'none' }
}
