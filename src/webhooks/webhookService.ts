import { getDfnsClient } from '../dfns/client'
import { withRetry } from '../dfns/retry'
import { logger } from '../dfns/logger'

const SUBSCRIBED_EVENTS = [
  'wallet.transfer.requested',
  'wallet.transfer.broadcasted',
  'wallet.transfer.confirmed',
  'wallet.transfer.failed',
  'wallet.created',
] as const

export async function registerWebhook(url: string, description?: string) {
  const dfns = getDfnsClient()
  const webhook = await withRetry(
    () =>
      dfns.webhooks.createWebhook({
        body: {
          url,
          description: description ?? 'Sovereign POC webhook receiver',
          events: [...SUBSCRIBED_EVENTS],
          status: 'Enabled',
        },
      }),
    'registerWebhook',
  )

  logger.info({ webhookId: webhook.id, url }, 'Webhook registered')
  return webhook
}

export async function listWebhooks() {
  const dfns = getDfnsClient()
  return withRetry(() => dfns.webhooks.listWebhooks(), 'listWebhooks')
}

export async function getWebhookEvents(webhookId: string) {
  const dfns = getDfnsClient()
  return withRetry(
    () => dfns.webhooks.listWebhookEvents({ webhookId }),
    'getWebhookEvents',
  )
}

// ---------- In-memory event log (for the receiver endpoint) ----------

export interface WebhookEvent {
  kind: string
  data: unknown
  timestamp: string
}

const receivedEvents: WebhookEvent[] = []

export function recordWebhookEvent(kind: string, data: unknown): void {
  const event: WebhookEvent = {
    kind,
    data,
    timestamp: new Date().toISOString(),
  }
  receivedEvents.push(event)
  logger.info({ kind, timestamp: event.timestamp }, 'Webhook event received')
}

export function getReceivedEvents(): WebhookEvent[] {
  return receivedEvents
}
