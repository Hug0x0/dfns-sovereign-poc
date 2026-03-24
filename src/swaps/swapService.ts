import { getDfnsClient } from '../dfns/client'
import { withRetry } from '../dfns/retry'
import { logger } from '../dfns/logger'

// ---------- Types ----------

export type SwapProvider = 'UniswapX' | 'UniswapClassic'

export interface SwapQuoteRequest {
  walletId: string
  sourceAsset: { kind: 'Native'; amount: string } | { kind: 'Erc20'; contract: string; amount: string }
  targetAsset: { kind: 'Native' } | { kind: 'Erc20'; contract: string }
  slippageBps: number
  provider?: SwapProvider
}

// ---------- Service functions ----------

/**
 * Request a swap quote via DFNS Swaps API (Uniswap integration).
 * Prerequisites: T&C acceptance via the Agreements API.
 */
export async function requestSwapQuote(params: SwapQuoteRequest) {
  const dfns = getDfnsClient()
  const provider = params.provider ?? 'UniswapClassic'

  const quote = await withRetry(
    () =>
      dfns.swaps.createSwapQuote({
        body: {
          provider,
          walletId: params.walletId,
          targetWalletId: params.walletId,
          sourceAsset: params.sourceAsset,
          targetAsset: params.targetAsset,
          slippageBps: params.slippageBps,
        },
      }),
    'requestSwapQuote',
  )

  logger.info({ quoteId: quote.id, provider: quote.provider }, 'Swap quote received')
  return quote
}

/**
 * Execute a swap from a previously obtained quote.
 * Requires `Swaps:Create` permission. May trigger policy approval (up to 4 signatures).
 */
export async function executeSwap(
  walletId: string,
  quoteId: string,
  quote: {
    provider: SwapProvider
    slippageBps: number
    sourceAsset: { kind: 'Native'; amount: string } | { kind: 'Erc20'; contract: string; amount: string }
    targetAsset:
      | { kind: 'Native'; amount: string }
      | { kind: 'Erc20'; contract: string; amount: string }
  },
) {
  const dfns = getDfnsClient()

  const swap = await withRetry(
    () =>
      dfns.swaps.createSwap({
        body: {
          quoteId,
          provider: quote.provider,
          walletId,
          targetWalletId: walletId,
          slippageBps: quote.slippageBps,
          sourceAsset: quote.sourceAsset,
          targetAsset: quote.targetAsset,
        },
      }),
    'executeSwap',
  )

  logger.info({ swapId: swap.id, status: swap.status, provider: swap.provider }, 'Swap created')
  return swap
}

/**
 * Get swap status by ID.
 */
export async function getSwapStatus(swapId: string) {
  const dfns = getDfnsClient()
  const swap = await withRetry(
    () => dfns.swaps.getSwap({ swapId }),
    'getSwapStatus',
  )
  logger.info({ swapId, status: swap.status }, 'Swap status')
  return swap
}

/**
 * List all swaps.
 */
export async function listSwaps() {
  const dfns = getDfnsClient()
  return withRetry(() => dfns.swaps.listSwaps(), 'listSwaps')
}

/**
 * Poll swap status until terminal (Completed, Failed, Rejected).
 * UniswapClassic: 30 min window. UniswapX: 5 min window.
 */
export async function pollSwapStatus(
  swapId: string,
  timeoutMs: number = 5 * 60 * 1000,
  intervalMs: number = 5000,
) {
  const deadline = Date.now() + timeoutMs
  const terminal = new Set(['Completed', 'Failed', 'Rejected'])

  while (Date.now() < deadline) {
    const swap = await getSwapStatus(swapId)
    if (terminal.has(swap.status)) return swap
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`Swap ${swapId} timed out after ${timeoutMs}ms`)
}
