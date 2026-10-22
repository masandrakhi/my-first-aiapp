import type { Config } from './config'
import type { Db } from './db/client'
import type { Logger } from './logger'
import type { Mailer } from './mail/mailer'

/** Everything the API needs, injected so tests can swap in an in-memory database, fake clock and mailer. */
export interface AppDeps {
  db: Db
  config: Config
  mailer: Mailer
  logger: Logger
  /** Current time. All expiry and inactivity decisions use this, never the database clock. */
  now: () => Date
}
