export const TOKENS = {
  /** Circle USDC on Ethereum Sepolia */
  USDC_SEPOLIA: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  /** Circle EURC on Ethereum Sepolia (official testnet deploy) */
  EURC_SEPOLIA: '0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4',
  /** EURCV — placeholder, no official Sepolia deploy yet */
  EURCV_SEPOLIA: '0x0000000000000000000000000000000000000000', // TODO: replace when available
} as const

export const NETWORKS = {
  ETHEREUM_SEPOLIA: 'EthereumSepolia',
} as const

export const DECIMALS: Record<string, number> = {
  [TOKENS.USDC_SEPOLIA]: 6,
  [TOKENS.EURC_SEPOLIA]: 6,
}
