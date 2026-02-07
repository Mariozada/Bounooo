import Dexie, { type EntityTable } from 'dexie'
import type { Thread, StoredMessage, StoredAttachment, ThreadBranchState, ScheduledShortcut } from './types'
import type { StoredSkill } from '@skills/types'

class ChatDatabase extends Dexie {
  threads!: EntityTable<Thread, 'id'>
  messages!: EntityTable<StoredMessage, 'id'>
  attachments!: EntityTable<StoredAttachment, 'id'>
  branchStates!: EntityTable<ThreadBranchState, 'threadId'>
  shortcuts!: EntityTable<ScheduledShortcut, 'id'>
  skills!: EntityTable<StoredSkill, 'id'>

  constructor() {
    super('bouno-chat')

    this.version(3).stores({
      threads: 'id, updatedAt',
      messages: 'id, threadId, parentId, createdAt',
      attachments: 'id, messageId, threadId',
      branchStates: 'threadId',
    })

    // Version 4: Add shortcuts table
    this.version(4).stores({
      threads: 'id, updatedAt',
      messages: 'id, threadId, parentId, createdAt',
      attachments: 'id, messageId, threadId',
      branchStates: 'threadId',
      shortcuts: 'id, enabled, createdAt',
    })

    // Version 5: Add skills table
    this.version(5).stores({
      threads: 'id, updatedAt',
      messages: 'id, threadId, parentId, createdAt',
      attachments: 'id, messageId, threadId',
      branchStates: 'threadId',
      shortcuts: 'id, enabled, createdAt',
      skills: 'id, name, source, enabled, installedAt',
    })
  }
}

export const db = new ChatDatabase()

// Export for convenience
export type { Thread, StoredMessage, StoredAttachment, ThreadBranchState, ScheduledShortcut }
export type { StoredSkill }
