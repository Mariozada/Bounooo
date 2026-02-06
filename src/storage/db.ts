import Dexie, { type EntityTable } from 'dexie'
import type { Thread, StoredMessage, StoredAttachment, ThreadBranchState } from './types'

class ChatDatabase extends Dexie {
  threads!: EntityTable<Thread, 'id'>
  messages!: EntityTable<StoredMessage, 'id'>
  attachments!: EntityTable<StoredAttachment, 'id'>
  branchStates!: EntityTable<ThreadBranchState, 'threadId'>

  constructor() {
    super('bouno-chat')

    this.version(3).stores({
      threads: 'id, updatedAt',
      messages: 'id, threadId, parentId, createdAt',
      attachments: 'id, messageId, threadId',
      branchStates: 'threadId',
    })
  }
}

export const db = new ChatDatabase()

// Export for convenience
export type { Thread, StoredMessage, StoredAttachment, ThreadBranchState }
