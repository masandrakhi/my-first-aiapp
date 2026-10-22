import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppDeps } from './deps'
import { HttpError } from './errors'
import { errorResponse, originCheck, requestId, requestLog, type AppEnv } from './middleware'
import { authRoutes } from './routes/auth'
import { dataRoutes } from './routes/habits'

/** Builds the API. Everything external (database, clock, mailer, config) is injected. */
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api')

  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
    // API responses are per-user and must never be cached by the browser or a proxy.
    c.header('Cache-Control', 'no-store')
  })
  app.use('*', requestId)
  app.use('*', requestLog)
  app.use('*', bodyLimit({
    maxSize: 512 * 1024,
    onError: () => { throw new HttpError(413, 'validation_error', 'Request is too large.') },
  }))
  app.use('*', originCheck)

  app.route('/auth', authRoutes)

  app.route('/', dataRoutes)

  app.notFound((c) => {
    c.set('errorCode', 'not_found')
    return c.json({ error: { code: 'not_found', message: 'Not found.', requestId: c.get('requestId') } }, 404)
  })
  app.onError(errorResponse)
  return app
}

export type App = ReturnType<typeof createApp>
