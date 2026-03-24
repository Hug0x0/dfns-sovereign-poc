import express from 'express'
import { router } from './routes'
import { logger } from '../dfns/logger'

export function createServer() {
  const app = express()

  app.use(express.json())

  // Request logging
  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.url }, 'Incoming request')
    next()
  })

  app.use(router)

  return app
}

export function startServer(port: number = Number(process.env.PORT) || 3000) {
  const app = createServer()

  app.listen(port, () => {
    logger.info({ port }, 'DFNS Sovereign POC server started')
  })

  return app
}
