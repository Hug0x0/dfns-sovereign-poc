import { getDfnsClient } from '../dfns/client'
import { withRetry } from '../dfns/retry'
import { logger } from '../dfns/logger'

/**
 * Create a TransactionAmountLimit policy on wallets tagged "sovereign".
 * Blocks transfers exceeding the specified USD limit.
 */
export async function createTransferLimitPolicy(params: {
  name?: string
  limitUsd?: number
  approverUserIds: string[]
}) {
  const dfns = getDfnsClient()
  const { name = 'Sovereign Transfer Limit', limitUsd = 10_000, approverUserIds } = params

  const policy = await withRetry(
    () =>
      dfns.policies.createPolicy({
        body: {
          name,
          activityKind: 'Wallets:Sign',
          rule: {
            kind: 'TransactionAmountLimit',
            configuration: { limit: limitUsd, currency: 'USD' },
          },
          action: {
            kind: 'RequestApproval',
            approvalGroups: [
              {
                name: 'Transfer limit approvers',
                quorum: 1,
                approvers: { userId: { in: approverUserIds } },
              },
            ],
            autoRejectTimeout: 3600, // 1 hour
          },
          filters: {
            walletTags: { hasAny: ['sovereign'] },
          },
        },
      }),
    'createTransferLimitPolicy',
  )

  logger.info({ policyId: policy.id, limitUsd }, 'Transfer limit policy created')
  return policy
}

/**
 * Create an approval policy that requires human approval for all signing activity
 * on sovereign wallets.
 */
export async function createApprovalPolicy(params: {
  name?: string
  approverUserIds: string[]
}) {
  const dfns = getDfnsClient()
  const { name = 'Sovereign Approval Required', approverUserIds } = params

  const policy = await withRetry(
    () =>
      dfns.policies.createPolicy({
        body: {
          name,
          activityKind: 'Wallets:Sign',
          rule: {
            kind: 'AlwaysTrigger',
          },
          action: {
            kind: 'RequestApproval',
            approvalGroups: [
              {
                name: 'Manual approvers',
                quorum: 1,
                approvers: { userId: { in: approverUserIds } },
              },
            ],
            autoRejectTimeout: 7200, // 2 hours
          },
          filters: {
            walletTags: { hasAny: ['sovereign'] },
          },
        },
      }),
    'createApprovalPolicy',
  )

  logger.info({ policyId: policy.id }, 'Approval policy created')
  return policy
}

/**
 * List pending approvals.
 */
export async function listPendingApprovals() {
  const dfns = getDfnsClient()
  const approvals = await withRetry(
    () =>
      dfns.policies.listApprovals({
        query: { status: 'Pending' },
      }),
    'listPendingApprovals',
  )
  logger.info({ count: approvals.items.length }, 'Pending approvals fetched')
  return approvals
}

/**
 * Approve a pending action.
 */
export async function approveAction(approvalId: string) {
  const dfns = getDfnsClient()
  const result = await withRetry(
    () =>
      dfns.policies.createApprovalDecision({
        approvalId,
        body: { value: 'Approved' },
      }),
    'approveAction',
  )
  logger.info({ approvalId, status: result.status }, 'Action approved')
  return result
}

/**
 * List all active policies.
 */
export async function listPolicies() {
  const dfns = getDfnsClient()
  return withRetry(
    () => dfns.policies.listPolicies({ query: { status: 'Active' } }),
    'listPolicies',
  )
}
