import { db } from './db'
import type { StoredAttachment } from './types'
import { ATTACHMENT_SIZE_LIMIT } from './types'
import type { AttachmentFile } from '@ui/components/FileAttachment'

const DEBUG = false
const log = (...args: unknown[]) => DEBUG && console.log('[AttachmentStorage]', ...args)

export async function storeAttachment(
  threadId: string,
  messageId: string,
  file: AttachmentFile
): Promise<StoredAttachment> {
  const shouldStore = file.file.size <= ATTACHMENT_SIZE_LIMIT

  const attachment: StoredAttachment = {
    id: file.id,
    messageId,
    threadId,
    type: file.type,
    filename: file.file.name,
    mediaType: file.mediaType,
    size: file.file.size,
    dataUrl: shouldStore ? file.dataUrl : null,
    stored: shouldStore,
  }

  await db.attachments.add(attachment)
  log('Stored attachment:', file.id, 'stored:', shouldStore)
  return attachment
}

export async function getAttachments(
  messageId: string
): Promise<StoredAttachment[]> {
  return db.attachments.where('messageId').equals(messageId).toArray()
}

export async function getAttachmentsByThread(
  threadId: string
): Promise<StoredAttachment[]> {
  return db.attachments.where('threadId').equals(threadId).toArray()
}

export function storedAttachmentToAttachmentFile(
  stored: StoredAttachment
): AttachmentFile | null {
  if (!stored.stored || !stored.dataUrl) {
    return null
  }

  return {
    id: stored.id,
    file: new File([], stored.filename, { type: stored.mediaType }),
    dataUrl: stored.dataUrl,
    type: stored.type,
    mediaType: stored.mediaType,
  }
}
