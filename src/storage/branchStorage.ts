import { db } from './db'

const DEBUG = false
const log = (...args: unknown[]) => DEBUG && console.log('[BranchStorage]', ...args)

export async function getBranchState(threadId: string): Promise<Record<string, string>> {
  const state = await db.branchStates.get(threadId)
  return state?.activePath ?? {}
}

export async function saveBranchState(
  threadId: string,
  activePath: Record<string, string>
): Promise<void> {
  await db.branchStates.put({ threadId, activePath })
  log('Saved branch state:', threadId, activePath)
}

export async function updateBranchState(
  threadId: string,
  parentId: string | null,
  activeChildId: string
): Promise<void> {
  const current = await getBranchState(threadId)
  const pathKey = parentId ?? 'root'
  const updated = { ...current, [pathKey]: activeChildId }
  await saveBranchState(threadId, updated)
}
