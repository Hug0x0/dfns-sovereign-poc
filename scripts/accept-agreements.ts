/**
 * Accept Uniswap agreements required for DFNS Swaps.
 * Usage: npx tsx scripts/accept-agreements.ts
 */
import 'dotenv/config'
import { getDfnsClient } from '../src/dfns/client'

const AGREEMENT_TYPES = [
  'UniswapTermsOfService',
  'UniswapPrivacyPolicy',
] as const

async function main() {
  const dfns = getDfnsClient()

  for (const agreementType of AGREEMENT_TYPES) {
    console.log(`\n--- ${agreementType} ---`)

    const res = await dfns.agreements.getLatestUnacceptedAgreement({
      query: { agreementType },
    })

    if (!res.latestAgreement) {
      console.log('  Already accepted.')
      continue
    }

    const { id, details } = res.latestAgreement
    console.log(`  Found: ${details} (${id})`)

    const acceptance = await dfns.agreements.recordAgreementAcceptance({
      agreementId: id,
    })
    console.log(`  Accepted! userId: ${acceptance.userId}, date: ${acceptance.dateAccepted}`)
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error('Failed:', err.message ?? err)
  process.exit(1)
})
