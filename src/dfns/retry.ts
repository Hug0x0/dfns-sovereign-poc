import { logger } from './logger'

const MAX_RETRIES = 3
const BASE_DELAY_MS = 500

export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1)
        logger.warn({ attempt, delay, label, err }, 'Retrying DFNS call')
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}
