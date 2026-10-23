import type { Config } from './config.js'
import type { Db } from './db/client.js'
import type { Logger } from './logger.js'
import type { Mailer } from './mail/mailer.js'
import type { ChatModel } from './chat/model.js'

/** Everything the API needs, injected so tests can swap in an in-memory database, fake clock and mailer. */
export interface AppDeps {
  db: Db
  config: Config
  mailer: Mailer
  logger: Logger
  /** Current time. All expiry and inactivity decisions use this, never the database clock. */
  now: () => Date
  /** The Coach's model; null when none is configured (the Coach then answers 503). */
  chatModel: ChatModel | null
}
