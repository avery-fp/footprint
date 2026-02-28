import pino from 'pino'

// Do not use pino's `transport` option (e.g. pino-pretty) in Next.js.
// Webpack bundles API routes and pino-pretty's thread-stream worker cannot
// resolve its worker.js through the bundle, causing uncaught MODULE_NOT_FOUND
// exceptions that crash route handlers with 500s.
export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
})

export function routeLogger(method: string, route: string, extra?: Record<string, unknown>) {
  return logger.child({ route, method, ...extra })
}
