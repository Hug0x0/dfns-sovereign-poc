import { getDfnsClient } from '../dfns/client'
import { withRetry } from '../dfns/retry'
import { logger } from '../dfns/logger'

export interface TransferERC20Params {
  walletId: string
  contract: string
  to: string
  amount: string
  priority?: 'Slow' | 'Standard' | 'Fast'
}

export async function transferERC20(params: TransferERC20Params) {
  const dfns = getDfnsClient()
  const { walletId, contract, to, amount, priority } = params

  const transfer = await withRetry(
    () =>
      dfns.wallets.transferAsset({
        walletId,
        body: {
          kind: 'Erc20',
          contract,
          to,
          amount,
          ...(priority ? { priority } : {}),
        },
      }),
    'transferERC20',
  )

  logger.info(
    { transferId: transfer.id, walletId, to, amount, status: transfer.status },
    'ERC-20 transfer initiated',
  )
  return transfer
}

export async function getTransferStatus(walletId: string, transferId: string) {
  const dfns = getDfnsClient()
  const transfer = await withRetry(
    () => dfns.wallets.getTransfer({ walletId, transferId }),
    'getTransferStatus',
  )
  logger.info({ transferId, status: transfer.status }, 'Transfer status')
  return transfer
}

export async function listTransfers(walletId: string) {
  const dfns = getDfnsClient()
  return withRetry(
    () => dfns.wallets.listTransfers({ walletId }),
    'listTransfers',
  )
}

/**
 * Poll transfer status until it reaches a terminal state or timeout.
 * Terminal states: Confirmed, Failed, Rejected.
 */
export async function pollTransferStatus(
  walletId: string,
  transferId: string,
  timeoutMs: number = 5 * 60 * 1000,
  intervalMs: number = 5000,
): Promise<{ status: string; txHash?: string }> {
  const deadline = Date.now() + timeoutMs
  const terminalStates = new Set(['Confirmed', 'Failed', 'Rejected'])

  while (Date.now() < deadline) {
    const transfer = await getTransferStatus(walletId, transferId)
    if (terminalStates.has(transfer.status)) {
      return { status: transfer.status, txHash: transfer.txHash }
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new PipelineTimeoutError(
    `Transfer ${transferId} did not reach terminal state within ${timeoutMs}ms`,
  )
}

export class PipelineTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineTimeoutError'
  }
}
