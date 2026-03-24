import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the DFNS client before importing the service
const mockCreateWallet = vi.fn()
const mockGetWallet = vi.fn()
const mockListWallets = vi.fn()
const mockGetWalletAssets = vi.fn()
const mockGetWalletHistory = vi.fn()

vi.mock('../dfns/client', () => ({
  getDfnsClient: () => ({
    wallets: {
      createWallet: mockCreateWallet,
      getWallet: mockGetWallet,
      listWallets: mockListWallets,
      getWalletAssets: mockGetWalletAssets,
      getWalletHistory: mockGetWalletHistory,
    },
  }),
}))

import {
  createSovereignWallet,
  getWallet,
  listWallets,
  getWalletAssets,
  getWalletHistory,
} from '../wallets/walletService'

describe('walletService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createSovereignWallet', () => {
    it('creates a wallet on EthereumSepolia by default', async () => {
      const mockResponse = {
        id: 'wa-123',
        address: '0xabc',
        network: 'EthereumSepolia',
        signingKey: { scheme: 'ECDSA', curve: 'secp256k1', publicKey: '0xpub' },
        status: 'Active',
        tags: ['sovereign'],
        dateCreated: '2026-01-01T00:00:00Z',
        custodial: false,
      }
      mockCreateWallet.mockResolvedValue(mockResponse)

      const result = await createSovereignWallet('test-wallet')

      expect(mockCreateWallet).toHaveBeenCalledWith({
        body: { network: 'EthereumSepolia', name: 'test-wallet', tags: ['sovereign'] },
      })
      expect(result).toEqual({
        id: 'wa-123',
        address: '0xabc',
        network: 'EthereumSepolia',
        signingKey: { scheme: 'ECDSA', curve: 'secp256k1', publicKey: '0xpub' },
      })
    })

    it('creates a wallet on a custom network', async () => {
      mockCreateWallet.mockResolvedValue({
        id: 'wa-456',
        address: '0xdef',
        network: 'Polygon',
        signingKey: { scheme: 'ECDSA', curve: 'secp256k1', publicKey: '0xpub2' },
        status: 'Active',
        tags: ['sovereign'],
        dateCreated: '2026-01-01T00:00:00Z',
        custodial: false,
      })

      const result = await createSovereignWallet('poly-wallet', 'Polygon')

      expect(mockCreateWallet).toHaveBeenCalledWith({
        body: { network: 'Polygon', name: 'poly-wallet', tags: ['sovereign'] },
      })
      expect(result.id).toBe('wa-456')
    })
  })

  describe('getWalletAssets', () => {
    it('returns wallet assets', async () => {
      mockGetWalletAssets.mockResolvedValue({
        assets: [
          { symbol: 'USDC', balance: '1000000', decimals: 6 },
          { symbol: 'ETH', balance: '500000000000000000', decimals: 18 },
        ],
      })

      const result = await getWalletAssets('wa-123')

      expect(mockGetWalletAssets).toHaveBeenCalledWith({ walletId: 'wa-123' })
      expect(result.assets).toHaveLength(2)
      expect(result.assets[0].symbol).toBe('USDC')
    })
  })

  describe('listWallets', () => {
    it('returns paginated wallet list', async () => {
      mockListWallets.mockResolvedValue({
        items: [{ id: 'wa-1' }, { id: 'wa-2' }],
        nextPageToken: 'token-abc',
      })

      const result = await listWallets(10)

      expect(mockListWallets).toHaveBeenCalledWith({
        query: { limit: 10 },
      })
      expect(result.items).toHaveLength(2)
    })
  })

  describe('getWalletHistory', () => {
    it('returns wallet history', async () => {
      mockGetWalletHistory.mockResolvedValue({
        items: [{ kind: 'transfer', status: 'Confirmed' }],
      })

      const result = await getWalletHistory('wa-123')
      expect(mockGetWalletHistory).toHaveBeenCalledWith({ walletId: 'wa-123' })
      expect(result.items).toHaveLength(1)
    })
  })
})
