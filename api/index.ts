/**
 * Vercel Function entry (Node.js runtime). vercel.json rewrites every /api/* request here.
 * Configuration comes from Vercel project environment variables; missing secrets fail fast.
 */
import { createApp } from '../server/app.js'
import { loadConfig } from '../server/config.js'
import { createNeonDb } from '../server/db/client.js'
import { createLogger } from '../server/logger.js'
import { ResendMailer, type Mailer } from '../server/mail/mailer.js'

const env = process.env
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
const config = loadConfig(env)
const logger = createLogger()

const mailer: Mailer = env.RESEND_API_KEY
  ? new ResendMailer(env.RESEND_API_KEY, config.mailFrom)
  : { send: async () => logger.warn('email not sent: no email provider configured') }

const app = createApp({ db: createNeonDb(env.DATABASE_URL), config, mailer, logger, now: () => new Date() })

// Vercel's Node.js runtime accepts web-standard (Request) => Response handlers per HTTP method.
const handler = (request: Request) => app.fetch(request)
export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
