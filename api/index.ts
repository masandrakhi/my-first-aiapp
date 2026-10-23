/**
 * Vercel Function entry (Node.js runtime). vercel.json rewrites every /api/* request here.
 * Configuration comes from Vercel project environment variables; missing secrets fail fast.
 */
import { createApp } from '../server/app.js'
import { loadConfig } from '../server/config.js'
import { createNeonDb } from '../server/db/client.js'
import { createLogger } from '../server/logger.js'
import { selectMailer } from '../server/mail/select.js'
import { AnthropicChatModel } from '../server/chat/model.js'

const env = process.env
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
const config = loadConfig(env)
const logger = createLogger()

const { mailer, provider } = selectMailer(env, config.mailFrom, logger)
logger.info('mail provider', { provider })

// The Coach is switched on only by configuring a key; without one its routes answer 503.
const chatModel = env.ANTHROPIC_API_KEY ? new AnthropicChatModel(env.ANTHROPIC_API_KEY) : null
logger.info('coach model', { model: chatModel?.name ?? 'none' })

const app = createApp({ db: createNeonDb(env.DATABASE_URL), config, mailer, logger, now: () => new Date(), chatModel })

// Vercel's Node.js runtime accepts web-standard (Request) => Response handlers per HTTP method.
const handler = (request: Request) => app.fetch(request)
export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
