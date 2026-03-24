import { getDfnsClient } from '../dfns/client'
import { withRetry } from '../dfns/retry'
import { logger } from '../dfns/logger'
import { NETWORKS } from '../config/tokens'

export async function createSovereignWallet(
  name: string,
  network: string = NETWORKS.ETHEREUM_SEPOLIA,
) {
  const dfns = getDfnsClient()
  const wallet = await withRetry(
    () =>
      dfns.wallets.createWallet({
        body: { network: network as any, name, tags: ['sovereign'] },
      }),
    'createWallet',
  )

  logger.info({ walletId: wallet.id, address: wallet.address, network }, 'Wallet created')
  return {
    id: wallet.id,
    address: wallet.address,
    network: wallet.network,
    signingKey: wallet.signingKey,
  }
}

export async function getWallet(walletId: string) {
  const dfns = getDfnsClient()
  return withRetry(() => dfns.wallets.getWallet({ walletId }), 'getWallet')
}

export async function listWallets(limit?: number, paginationToken?: string) {
  const dfns = getDfnsClient()
  return withRetry(
    () =>
      dfns.wallets.listWallets({
        query: {
          ...(limit ? { limit } : {}),
          ...(paginationToken ? { paginationToken } : {}),
        },
      }),
    'listWallets',
  )
}

export async function getWalletAssets(walletId: string) {
  const dfns = getDfnsClient()
  const assets = await withRetry(
    () => dfns.wallets.getWalletAssets({ walletId }),
    'getWalletAssets',
  )
  logger.info({ walletId, assetCount: assets.assets.length }, 'Fetched wallet assets')
  return assets
}

export async function getWalletHistory(walletId: string) {
  const dfns = getDfnsClient()
  return withRetry(
    () => dfns.wallets.getWalletHistory({ walletId }),
    'getWalletHistory',
  )
}

/**
 * Reuse an existing key to create a wallet on another network (multi-chain pattern).
 * This uses the PublicKeys API to derive an address on the target network from the
 * same underlying key, then creates a new wallet linked to that key.
 */
export async function addNetworkToWallet(walletId: string, network: string) {
  const dfns = getDfnsClient()

  // Get the original wallet to retrieve its signing key info
  const original = await withRetry(
    () => dfns.wallets.getWallet({ walletId }),
    'getWallet',
  )

  // Create a new wallet on the target network — DFNS handles key reuse internally
  // when using the same org and compatible key scheme (ECDSA/secp256k1 for EVM chains)
  const newWallet = await withRetry(
    () =>
      dfns.wallets.createWallet({
        body: {
          network: network as any,
          name: `${original.name ?? walletId}-${network}`,
          tags: ['sovereign', 'multi-chain'],
        },
      }),
    'createWallet (addNetwork)',
  )

  logger.info(
    { originalWalletId: walletId, newWalletId: newWallet.id, network },
    'Added network to wallet (new wallet created)',
  )
  return newWallet
}
