import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all service dependencies
const mockGetWalletAssets = vi.fn()
vi.mock('../wallets/walletService', () => ({
  getWalletAssets: (...args: unknown[]) => mockGetWalletAssets(...args),
}))

const mockTransferERC20 = vi.fn()
const mockPollTransferStatus = vi.fn()
vi.mock('../transfers/transferService', () => ({
  transferERC20: (...args: unknown[]) => mockTransferERC20(...args),
  pollTransferStatus: (...args: unknown[]) => mockPollTransferStatus(...args),
  PipelineTimeoutError: class PipelineTimeoutError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'PipelineTimeoutError'
    }
  },
}))

const mockRequestSwapQuote = vi.fn()
const mockExecuteSwap = vi.fn()
const mockPollSwapStatus = vi.fn()
vi.mock('../swaps/swapService', () => ({
  requestSwapQuote: (...args: unknown[]) => mockRequestSwapQuote(...args),
  executeSwap: (...args: unknown[]) => mockExecuteSwap(...args),
  pollSwapStatus: (...args: unknown[]) => mockPollSwapStatus(...args),
}))

import { runTransferPipeline } from '../orchestrator/orchestrationPipeline'

describe('orchestrationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs a simple transfer pipeline without swap', async () => {
    mockGetWalletAssets.mockResolvedValue({
      assets: [{ symbol: 'USDC', balance: '5000000' }],
    })
    mockTransferERC20.mockResolvedValue({
      id: 'tx-001',
      status: 'Pending',
    })
    mockPollTransferStatus.mockResolvedValue({
      status: 'Confirmed',
      txHash: '0xabc123',
    })

    const result = await runTransferPipeline({
      senderWalletId: 'wa-123',
      recipientAddress: '0xRecipient',
      amount: '1000000',
      tokenContract: '0xUSDC',
    })

    expect(result.success).toBe(true)
    expect(result.txHash).toBe('0xabc123')
    expect(result.steps.find((s) => s.name === 'swap')?.status).toBe('skipped')
    expect(result.steps.find((s) => s.name === 'transferConfirmed')?.status).toBe('success')

    expect(mockRequestSwapQuote).not.toHaveBeenCalled()
    expect(mockTransferERC20).toHaveBeenCalledWith({
      walletId: 'wa-123',
      contract: '0xUSDC',
      to: '0xRecipient',
      amount: '1000000',
    })
  })

  it('runs a pipeline with swap step', async () => {
    mockGetWalletAssets.mockResolvedValue({ assets: [] })
    mockRequestSwapQuote.mockResolvedValue({
      id: 'quote-1',
      provider: 'UniswapClassic',
      sourceAsset: { kind: 'Erc20', contract: '0xEURC', amount: '1000000' },
      targetAsset: { kind: 'Erc20', contract: '0xEURCV', amount: '990000' },
      slippageBps: 100,
    })
    mockExecuteSwap.mockResolvedValue({
      id: 'swap-1',
      status: 'Completed',
    })
    mockTransferERC20.mockResolvedValue({ id: 'tx-002', status: 'Pending' })
    mockPollTransferStatus.mockResolvedValue({
      status: 'Confirmed',
      txHash: '0xswapped',
    })

    const result = await runTransferPipeline({
      senderWalletId: 'wa-123',
      recipientAddress: '0xRecipient',
      amount: '1000000',
      tokenContract: '0xEURC',
      requireSwap: true,
      swapTargetContract: '0xEURCV',
    })

    expect(result.success).toBe(true)
    expect(mockRequestSwapQuote).toHaveBeenCalled()
    expect(mockExecuteSwap).toHaveBeenCalledWith('wa-123', 'quote-1', expect.any(Object))
    // After swap, the transfer should use the target contract
    expect(mockTransferERC20).toHaveBeenCalledWith(
      expect.objectContaining({ contract: '0xEURCV' }),
    )
  })

  it('reports failure when transfer is not confirmed', async () => {
    mockGetWalletAssets.mockResolvedValue({ assets: [] })
    mockTransferERC20.mockResolvedValue({ id: 'tx-003', status: 'Pending' })
    mockPollTransferStatus.mockResolvedValue({
      status: 'Failed',
      txHash: undefined,
    })

    const result = await runTransferPipeline({
      senderWalletId: 'wa-123',
      recipientAddress: '0xRecipient',
      amount: '1000000',
      tokenContract: '0xUSDC',
    })

    expect(result.success).toBe(false)
    expect(result.steps.find((s) => s.name === 'transferConfirmed')?.status).toBe('failed')
  })
})
