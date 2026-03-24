import { getDfnsClient } from '../dfns/client'
import { withRetry } from '../dfns/retry'
import { logger } from '../dfns/logger'

/**
 * Create a permission with the minimal operations required for the orchestration pipeline.
 */
export async function createOrchestratorPermission(name?: string) {
  const dfns = getDfnsClient()
  const permission = await withRetry(
    () =>
      dfns.permissions.createPermission({
        body: {
          name: name ?? 'Orchestrator Pipeline',
          operations: [
            'Wallets:Read',
            'Wallets:Create',
            'Wallets:Transfers:Create',
            'Wallets:Transfers:Read',
            'Policies:Read',
            'Policies:Approvals:Read',
            'Policies:Approvals:Approve',
            'Webhooks:Read',
            'Webhooks:Create',
          ],
        },
      }),
    'createOrchestratorPermission',
  )

  logger.info({ permissionId: permission.id }, 'Orchestrator permission created')
  return permission
}

/**
 * Assign a permission to a user or service account.
 */
export async function assignPermission(permissionId: string, identityId: string) {
  const dfns = getDfnsClient()
  const assignment = await withRetry(
    () =>
      dfns.permissions.createAssignment({
        permissionId,
        body: { identityId },
      }),
    'assignPermission',
  )

  logger.info({ permissionId, identityId }, 'Permission assigned')
  return assignment
}

/**
 * Create a service account for automations.
 * Requires a PEM public key for the service account credential.
 */
export async function createServiceAccount(name: string, publicKey: string) {
  const dfns = getDfnsClient()
  const sa = await withRetry(
    () =>
      dfns.auth.createServiceAccount({
        body: { name, publicKey },
      }),
    'createServiceAccount',
  )

  logger.info({ userId: sa.userInfo.userId, name }, 'Service account created')
  return sa
}
