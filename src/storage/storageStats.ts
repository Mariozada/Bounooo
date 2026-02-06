import { db } from './db'

export async function getStorageStats(): Promise<{
  threadCount: number
  messageCount: number
  attachmentCount: number
  estimatedSizeBytes: number
}> {
  const threads = await db.threads.count()
  const messages = await db.messages.count()
  const attachments = await db.attachments.toArray()

  // Estimate storage size (very rough)
  let estimatedSize = 0
  for (const att of attachments) {
    if (att.dataUrl) {
      estimatedSize += att.dataUrl.length
    }
    estimatedSize += 200 // metadata overhead
  }

  return {
    threadCount: threads,
    messageCount: messages,
    attachmentCount: attachments.length,
    estimatedSizeBytes: estimatedSize,
  }
}
