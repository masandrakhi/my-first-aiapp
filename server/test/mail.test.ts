// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../logger.js'
import { ResendMailer, SmtpMailer, type SmtpSettings, type SmtpTransport } from '../mail/mailer.js'
import { selectMailer } from '../mail/select.js'

const RESEND_FROM = 'Habits <onboarding@resend.dev>'

function setup() {
  const lines: string[] = []
  const logger = createLogger((l) => lines.push(l))
  const sent: Parameters<SmtpTransport['sendMail']>[0][] = []
  const settings: { value?: SmtpSettings; from?: string } = {}
  const connect = (s: SmtpSettings, from: string) => {
    settings.value = s
    settings.from = from
    return new SmtpMailer({ sendMail: async (mail) => void sent.push(mail) }, from)
  }
  return { lines, logger, sent, settings, connect }
}

describe('choosing the email provider', () => {
  it('uses Gmail SMTP when SMTP_USER and SMTP_PASS are set, sending as that account', async () => {
    const { logger, sent, settings, connect } = setup()
    const { mailer, provider } = selectMailer({ SMTP_USER: 'me@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop', RESEND_API_KEY: 're_x' }, RESEND_FROM, logger, connect)
    expect(provider).toBe('smtp')
    expect(settings.value).toEqual({ host: 'smtp.gmail.com', port: 465, user: 'me@gmail.com', pass: 'abcdefghijklmnop' })
    await mailer.send({ to: 'user@example.com', subject: 'Reset', text: 'link' })
    expect(sent).toEqual([{ from: 'Habits <me@gmail.com>', to: 'user@example.com', subject: 'Reset', text: 'link', textEncoding: 'base64' }])
  })

  it('honours SMTP_HOST, SMTP_PORT and MAIL_FROM overrides', () => {
    const { logger, settings, connect } = setup()
    selectMailer({ SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', MAIL_FROM: 'App <a@example.test>' }, RESEND_FROM, logger, connect)
    expect(settings.value).toMatchObject({ host: 'smtp.example.test', port: 587 })
    expect(settings.from).toBe('App <a@example.test>')
  })

  it('rejects a nonsense SMTP_PORT at startup', () => {
    const { logger, connect } = setup()
    expect(() => selectMailer({ SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_PORT: 'abc' }, RESEND_FROM, logger, connect)).toThrow(/SMTP_PORT/)
  })

  it('falls back to Resend, then to logging a warning when nothing is configured', async () => {
    const { lines, logger, connect } = setup()
    expect(selectMailer({ RESEND_API_KEY: 're_x' }, RESEND_FROM, logger, connect).mailer).toBeInstanceOf(ResendMailer)
    const none = selectMailer({ SMTP_USER: 'only-user@gmail.com' }, RESEND_FROM, logger, connect)
    expect(none.provider).toBe('none')
    await none.mailer.send({ to: 'x@example.com', subject: 's', text: 't' })
    expect(lines.join('\n')).toContain('no email provider configured')
  })

  it('reports sending failures to the caller (which logs them without the message body)', async () => {
    const mailer = new SmtpMailer({ sendMail: vi.fn().mockRejectedValue(new Error('Invalid login')) }, 'Habits <me@gmail.com>')
    await expect(mailer.send({ to: 'x@example.com', subject: 's', text: 't' })).rejects.toThrow('Invalid login')
  })
})
