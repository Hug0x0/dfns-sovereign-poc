import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'

function getEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

let instance: DfnsApiClient | null = null

export function getDfnsClient(): DfnsApiClient {
  if (instance) return instance

  const signer = new AsymmetricKeySigner({
    credId: getEnv('DFNS_CRED_ID'),
    privateKey: getEnv('DFNS_PRIVATE_KEY').replace(/\\n/g, '\n'),
  })

  instance = new DfnsApiClient({
    authToken: getEnv('DFNS_AUTH_TOKEN'),
    baseUrl: getEnv('DFNS_BASE_URL'),
    signer,
  })

  return instance
}
