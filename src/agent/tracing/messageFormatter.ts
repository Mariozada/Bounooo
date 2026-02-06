import type { ChatMessage, MessageContent } from './types'
import { OI, isMultimodalMessage } from './types'

export function formatMessageContent(
  content: MessageContent,
  prefix: string
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {
    [`${prefix}.${OI.MESSAGE_CONTENT_TYPE}`]: content.type,
  }

  if (content.type === 'text') {
    attrs[`${prefix}.${OI.MESSAGE_CONTENT_TEXT}`] = content.text
  } else if (content.type === 'image') {
    attrs[`${prefix}.${OI.MESSAGE_CONTENT_IMAGE}.${OI.IMAGE_URL}`] = content.image.url
  } else if (content.type === 'file') {
    attrs[`${prefix}.message_content.file.url`] = content.file.url
    if (content.file.name) {
      attrs[`${prefix}.message_content.file.name`] = content.file.name
    }
    if (content.file.mimeType) {
      attrs[`${prefix}.message_content.file.mime_type`] = content.file.mimeType
    }
  }

  return attrs
}

export function formatMessages(
  messages: ChatMessage[],
  attrPrefix: string
): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}

  messages.forEach((msg, msgIdx) => {
    const msgPrefix = `${attrPrefix}.${msgIdx}`

    attrs[`${msgPrefix}.${OI.MESSAGE_ROLE}`] = msg.role

    if (isMultimodalMessage(msg)) {
      msg.contents.forEach((content, contentIdx) => {
        const contentPrefix = `${msgPrefix}.${OI.MESSAGE_CONTENTS}.${contentIdx}`
        Object.assign(attrs, formatMessageContent(content, contentPrefix))
      })
    } else {
      attrs[`${msgPrefix}.${OI.MESSAGE_CONTENT}`] = msg.content
    }
  })

  return attrs
}
