import { Router, Request, Response } from 'express'
import { logger } from '../dfns/logger'

// Wallet service
import {
  createSovereignWallet,
  listWallets,
  getWalletAssets,
  getWalletHistory,
} from '../wallets/walletService'

// Transfer service
import {
  transferERC20,
  getTransferStatus,
} from '../transfers/transferService'

// Swap service
import {
  requestSwapQuote,
  executeSwap,
  getSwapStatus,
} from '../swaps/swapService'

// Policy service
import {
  createTransferLimitPolicy,
  createApprovalPolicy,
  listPendingApprovals,
  approveAction,
  listPolicies,
} from '../policies/policyService'

// Webhook service
import {
  registerWebhook,
  listWebhooks,
  getWebhookEvents,
  recordWebhookEvent,
  getReceivedEvents,
} from '../webhooks/webhookService'

// IAM service
import {
  createOrchestratorPermission,
  assignPermission,
  createServiceAccount,
} from '../iam/permissionService'

// Orchestrator
import { runTransferPipeline } from '../orchestrator/orchestrationPipeline'

export const router = Router()

// ---------- Health ----------

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ---------- Wallets ----------

router.post('/wallets', async (req: Request, res: Response) => {
  try {
    const { name, network } = req.body
    if (!name) {
      res.status(400).json({ error: 'name is required' })
      return
    }
    const wallet = await createSovereignWallet(name, network)
    res.status(201).json(wallet)
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/wallets', async (_req: Request, res: Response) => {
  try {
    const result = await listWallets()
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/wallets/:id/assets', async (req: Request, res: Response) => {
  try {
    const assets = await getWalletAssets(String(req.params.id))
    res.json(assets)
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/wallets/:id/history', async (req: Request, res: Response) => {
  try {
    const history = await getWalletHistory(String(req.params.id))
    res.json(history)
  } catch (err) {
    handleError(res, err)
  }
})

// ---------- Transfers ----------

router.post('/transfers', async (req: Request, res: Response) => {
  try {
    const { walletId, contract, to, amount, priority } = req.body
    if (!walletId || !contract || !to || !amount) {
      res.status(400).json({ error: 'walletId, contract, to, and amount are required' })
      return
    }
    const transfer = await transferERC20({ walletId, contract, to, amount, priority })
    res.status(201).json(transfer)
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/transfers/:walletId/:transferId', async (req: Request, res: Response) => {
  try {
    const transfer = await getTransferStatus(String(req.params.walletId), String(req.params.transferId))
    res.json(transfer)
  } catch (err) {
    handleError(res, err)
  }
})

// ---------- Swaps ----------

router.post('/swaps/quote', async (req: Request, res: Response) => {
  try {
    const { walletId, sourceContract, targetContract, amount, slippageBps, provider } = req.body
    if (!walletId || !amount) {
      res.status(400).json({ error: 'walletId and amount are required' })
      return
    }
    const sourceAsset = sourceContract
      ? { kind: 'Erc20' as const, contract: sourceContract, amount: String(amount) }
      : { kind: 'Native' as const, amount: String(amount) }
    const targetAsset = targetContract
      ? { kind: 'Erc20' as const, contract: targetContract }
      : { kind: 'Native' as const }
    const quote = await requestSwapQuote({
      walletId,
      sourceAsset,
      targetAsset,
      slippageBps: slippageBps ?? 100,
      provider,
    })
    res.status(201).json(quote)
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/swaps', async (req: Request, res: Response) => {
  try {
    const { walletId, quoteId, provider, slippageBps, sourceAsset, targetAsset } = req.body
    if (!walletId || !quoteId || !provider || !sourceAsset || !targetAsset) {
      res.status(400).json({ error: 'walletId, quoteId, provider, sourceAsset, and targetAsset are required' })
      return
    }
    const swap = await executeSwap(walletId, quoteId, { provider, slippageBps, sourceAsset, targetAsset })
    res.status(201).json(swap)
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/swaps/:id', async (req: Request, res: Response) => {
  try {
    const swap = await getSwapStatus(String(req.params.id))
    res.json(swap)
  } catch (err) {
    handleError(res, err)
  }
})

// ---------- Pipeline ----------

router.post('/pipeline/run', async (req: Request, res: Response) => {
  try {
    const { senderWalletId, recipientAddress, amount, tokenContract, requireSwap, swapTargetContract } = req.body
    if (!senderWalletId || !recipientAddress || !amount || !tokenContract) {
      res.status(400).json({
        error: 'senderWalletId, recipientAddress, amount, and tokenContract are required',
      })
      return
    }
    const result = await runTransferPipeline({
      senderWalletId,
      recipientAddress,
      amount,
      tokenContract,
      requireSwap,
      swapTargetContract,
    })
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// ---------- Webhook receiver ----------

router.post('/webhook/receiver', (req: Request, res: Response) => {
  const { kind, data } = req.body ?? {}
  recordWebhookEvent(kind ?? 'unknown', data ?? req.body)
  res.status(200).json({ received: true })
})

router.get('/webhook/events', (_req: Request, res: Response) => {
  res.json(getReceivedEvents())
})

// ---------- Policies ----------

router.get('/policies', async (_req: Request, res: Response) => {
  try {
    const policies = await listPolicies()
    res.json(policies)
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/policies/transfer-limit', async (req: Request, res: Response) => {
  try {
    const { name, limitUsd, approverUserIds } = req.body
    if (!approverUserIds || !Array.isArray(approverUserIds) || approverUserIds.length === 0) {
      res.status(400).json({ error: 'approverUserIds (array of user IDs) is required' })
      return
    }
    const policy = await createTransferLimitPolicy({ name, limitUsd, approverUserIds })
    res.status(201).json(policy)
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/policies/approval', async (req: Request, res: Response) => {
  try {
    const { name, approverUserIds } = req.body
    if (!approverUserIds || !Array.isArray(approverUserIds) || approverUserIds.length === 0) {
      res.status(400).json({ error: 'approverUserIds (array of user IDs) is required' })
      return
    }
    const policy = await createApprovalPolicy({ name, approverUserIds })
    res.status(201).json(policy)
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/policies/approvals/pending', async (_req: Request, res: Response) => {
  try {
    const approvals = await listPendingApprovals()
    res.json(approvals)
  } catch (err) {
    handleError(res, err)
  }
})

router.put('/policies/approvals/:id/approve', async (req: Request, res: Response) => {
  try {
    const result = await approveAction(String(req.params.id))
    res.json(result)
  } catch (err) {
    handleError(res, err)
  }
})

// ---------- Webhooks ----------

router.post('/webhooks', async (req: Request, res: Response) => {
  try {
    const { url, description } = req.body
    if (!url) {
      res.status(400).json({ error: 'url is required' })
      return
    }
    const webhook = await registerWebhook(url, description)
    res.status(201).json(webhook)
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/webhooks', async (_req: Request, res: Response) => {
  try {
    const webhooks = await listWebhooks()
    res.json(webhooks)
  } catch (err) {
    handleError(res, err)
  }
})

router.get('/webhooks/:id/events', async (req: Request, res: Response) => {
  try {
    const events = await getWebhookEvents(String(req.params.id))
    res.json(events)
  } catch (err) {
    handleError(res, err)
  }
})

// ---------- IAM / Permissions ----------

router.post('/permissions', async (req: Request, res: Response) => {
  try {
    const { name } = req.body
    const permission = await createOrchestratorPermission(name)
    res.status(201).json(permission)
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/permissions/:id/assign', async (req: Request, res: Response) => {
  try {
    const { identityId } = req.body
    if (!identityId) {
      res.status(400).json({ error: 'identityId is required' })
      return
    }
    const assignment = await assignPermission(String(req.params.id), identityId)
    res.status(201).json(assignment)
  } catch (err) {
    handleError(res, err)
  }
})

router.post('/service-accounts', async (req: Request, res: Response) => {
  try {
    const { name, publicKey } = req.body
    if (!name || !publicKey) {
      res.status(400).json({ error: 'name and publicKey are required' })
      return
    }
    const sa = await createServiceAccount(name, publicKey)
    res.status(201).json(sa)
  } catch (err) {
    handleError(res, err)
  }
})

// ---------- Error helper ----------

function handleError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  logger.error({ err: message }, 'API error')
  res.status(500).json({ error: message })
}
