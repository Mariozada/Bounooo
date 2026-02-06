// Re-export all storage functions for backward compatibility
export {
  createThread,
  getThread,
  getAllThreads,
  updateThread,
  deleteThread,
  deleteAllThreads,
} from './threadStorage'

export {
  addMessage,
  getMessage,
  getMessages,
  updateMessage,
  deleteMessage,
  getChildMessages,
  getSiblings,
  getSiblingInfo,
  deleteMessageTree,
  buildActiveConversation,
  type MessageInput,
} from './messageStorage'

export {
  storeAttachment,
  getAttachments,
  getAttachmentsByThread,
  storedAttachmentToAttachmentFile,
} from './attachmentStorage'

export {
  getBranchState,
  saveBranchState,
  updateBranchState,
} from './branchStorage'

export { getStorageStats } from './storageStats'
