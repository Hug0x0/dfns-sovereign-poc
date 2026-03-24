import { logger } from '../dfns/logger'
import { getWalletAssets } from '../wallets/walletService'
import { transferERC20, pollTransferStatus, PipelineTimeoutError } from '../transfers/transferService'
import {
  requestSwapQuote,
  executeSwap,
  pollSwapStatus,
} from '../swaps/swapService'

// ---------- Types ----------

export interface PipelineParams {
  senderWalletId: string
  recipientAddress: string
  amount: string
  tokenContract: string
  requireSwap?: boolean
  swapTargetContract?: string
}

export interface PipelineStep {
  name: string
  status: 'success' | 'failed' | 'skipped'
  detail?: unknown
}

export interface PipelineResult {
  success: boolean
  txHash?: string
  steps: PipelineStep[]
}

// ---------- Pipeline ----------

export async function runTransferPipeline(
  params: PipelineParams,
): Promise<PipelineResult> {
  const {
    senderWalletId,
    recipientAddress,
    amount,
    tokenContract,
    requireSwap,
    swapTargetContract,
  } = params

  const steps: PipelineStep[] = []

  try {
    // Step 1 — Check balance
    logger.info({ senderWalletId }, 'Pipeline step 1: checking wallet assets')
    const assets = await getWalletAssets(senderWalletId)
    steps.push({ name: 'checkBalance', status: 'success', detail: { assetCount: assets.assets.length } })

    // TODO: integrate On Ramp (Mt Pelerin / Bitvavo) — fund wallet if balance insufficient
    logger.info('TODO: integrate On Ramp (Mt Pelerin / Bitvavo)')

    // Step 2 — Optional swap (EURC → EURCV or other) via Uniswap (DFNS integrated)
    let transferContract = tokenContract
    if (requireSwap && swapTargetContract) {
      logger.info('Pipeline step 2: requesting swap quote')
      const quote = await requestSwapQuote({
        walletId: senderWalletId,
        sourceAsset: { kind: 'Erc20', contract: tokenContract, amount },
        targetAsset: { kind: 'Erc20', contract: swapTargetContract },
        slippageBps: 100,
      })
      steps.push({ name: 'swapQuote', status: 'success', detail: { quoteId: quote.id } })

      logger.info({ quoteId: quote.id }, 'Pipeline step 2b: executing swap')
      const swap = await executeSwap(senderWalletId, quote.id, {
        provider: quote.provider,
        slippageBps: 100,
        sourceAsset: quote.sourceAsset as any,
        targetAsset: quote.targetAsset as any,
      })
      steps.push({ name: 'swapExecute', status: 'success', detail: { swapId: swap.id } })

      if (swap.status !== 'Completed') {
        logger.info({ swapId: swap.id }, 'Pipeline step 2c: polling swap status')
        await pollSwapStatus(swap.id)
      }
      steps.push({ name: 'swapConfirmed', status: 'success' })

      transferContract = swapTargetContract
    } else {
      steps.push({ name: 'swap', status: 'skipped' })
    }

    // Step 3 — Transfer ERC-20 to recipient
    logger.info({ recipientAddress, amount }, 'Pipeline step 3: initiating transfer')
    const transfer = await transferERC20({
      walletId: senderWalletId,
      contract: transferContract,
      to: recipientAddress,
      amount,
    })
    steps.push({
      name: 'transfer',
      status: 'success',
      detail: { transferId: transfer.id, initialStatus: transfer.status },
    })

    // Step 4 — Poll transfer until confirmed
    logger.info({ transferId: transfer.id }, 'Pipeline step 4: polling transfer status')
    const result = await pollTransferStatus(senderWalletId, transfer.id)
    steps.push({
      name: 'transferConfirmed',
      status: result.status === 'Confirmed' ? 'success' : 'failed',
      detail: { finalStatus: result.status, txHash: result.txHash },
    })

    // TODO: integrate Off Ramp Europe (USDC/EURC → fiat via Bitvavo / Mt Pelerin)
    logger.info('TODO: integrate Off Ramp (Bitvavo / Mt Pelerin)')

    // TODO: integrate Reporting & Réconciliation (Scorechain / Chainalysis hooks)
    logger.info('TODO: integrate Reporting (Scorechain / Chainalysis)')

    const success = result.status === 'Confirmed'
    logger.info({ success, txHash: result.txHash }, 'Pipeline complete')

    return { success, txHash: result.txHash, steps }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ err: message }, 'Pipeline failed')
    steps.push({ name: 'error', status: 'failed', detail: { error: message } })

    if (err instanceof PipelineTimeoutError) {
      return { success: false, steps }
    }
    throw err
  }
}
