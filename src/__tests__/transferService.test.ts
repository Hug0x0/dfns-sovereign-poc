import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTransferAsset = vi.fn()
const mockGetTransfer = vi.fn()
const mockListTransfers = vi.fn()

vi.mock('../dfns/client', () => ({
  getDfnsClient: () => ({
    wallets: {
      transferAsset: mockTransferAsset,
      getTransfer: mockGetTransfer,
      listTransfers: mockListTransfers,
    },
  }),
}))

import {
  transferERC20,
  getTransferStatus,
  pollTransferStatus,
  PipelineTimeoutError,
} from '../transfers/transferService'

describe('transferService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('transferERC20', () => {
    it('initiates an ERC-20 transfer', async () => {
      mockTransferAsset.mockResolvedValue({
        id: 'tx-001',
        walletId: 'wa-123',
        status: 'Pending',
        network: 'EthereumSepolia',
        requestBody: { kind: 'Erc20' },
        requester: { userId: 'usr-1' },
        metadata: { asset: {} },
        dateRequested: '2026-01-01T00:00:00Z',
      })

      const result = await transferERC20({
        walletId: 'wa-123',
        contract: '0xUSDC',
        to: '0xRecipient',
        amount: '1000000',
      })

      expect(mockTransferAsset).toHaveBeenCalledWith({
        walletId: 'wa-123',
        body: {
          kind: 'Erc20',
          contract: '0xUSDC',
          to: '0xRecipient',
          amount: '1000000',
        },
      })
      expect(result.id).toBe('tx-001')
      expect(result.status).toBe('Pending')
    })

    it('passes priority when provided', async () => {
      mockTransferAsset.mockResolvedValue({
        id: 'tx-002',
        walletId: 'wa-123',
        status: 'Pending',
        network: 'EthereumSepolia',
        requestBody: { kind: 'Erc20' },
        requester: { userId: 'usr-1' },
        metadata: { asset: {} },
        dateRequested: '2026-01-01T00:00:00Z',
      })

      await transferERC20({
        walletId: 'wa-123',
        contract: '0xUSDC',
        to: '0xRecipient',
        amount: '1000000',
        priority: 'Fast',
      })

      expect(mockTransferAsset).toHaveBeenCalledWith({
        walletId: 'wa-123',
        body: {
          kind: 'Erc20',
          contract: '0xUSDC',
          to: '0xRecipient',
          amount: '1000000',
          priority: 'Fast',
        },
      })
    })
  })

  describe('getTransferStatus', () => {
    it('returns the transfer status', async () => {
      mockGetTransfer.mockResolvedValue({
        id: 'tx-001',
        status: 'Confirmed',
        txHash: '0xhash123',
      })

      const result = await getTransferStatus('wa-123', 'tx-001')
      expect(result.status).toBe('Confirmed')
      expect(result.txHash).toBe('0xhash123')
    })

    it('returns Failed status', async () => {
      mockGetTransfer.mockResolvedValue({
        id: 'tx-002',
        status: 'Failed',
        reason: 'Insufficient funds',
      })

      const result = await getTransferStatus('wa-123', 'tx-002')
      expect(result.status).toBe('Failed')
      expect(result.reason).toBe('Insufficient funds')
    })
  })

  describe('pollTransferStatus', () => {
    it('returns immediately if already confirmed', async () => {
      mockGetTransfer.mockResolvedValue({
        id: 'tx-001',
        status: 'Confirmed',
        txHash: '0xhash',
      })

      const result = await pollTransferStatus('wa-123', 'tx-001')
      expect(result.status).toBe('Confirmed')
      expect(result.txHash).toBe('0xhash')
    })

    it('polls until confirmed', async () => {
      mockGetTransfer
        .mockResolvedValueOnce({ id: 'tx-001', status: 'Pending' })
        .mockResolvedValueOnce({ id: 'tx-001', status: 'Broadcasted' })
        .mockResolvedValueOnce({ id: 'tx-001', status: 'Confirmed', txHash: '0xfinal' })

      const result = await pollTransferStatus('wa-123', 'tx-001', 30_000, 10)
      expect(result.status).toBe('Confirmed')
      expect(mockGetTransfer).toHaveBeenCalledTimes(3)
    })

    it('throws PipelineTimeoutError on timeout', async () => {
      mockGetTransfer.mockResolvedValue({ id: 'tx-001', status: 'Pending' })

      await expect(
        pollTransferStatus('wa-123', 'tx-001', 50, 10),
      ).rejects.toThrow(PipelineTimeoutError)
    })
  })
})
