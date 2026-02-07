import { type FC, useRef, useEffect, useState, useCallback } from 'react'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { WelcomeScreen } from './WelcomeScreen'
import type { AttachmentFile } from '../FileAttachment'
import type { ToolCallInfo } from '@agent/index'

export interface Message {
  id: string
  parentId?: string | null
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[]
  attachments?: AttachmentFile[]
  reasoning?: string
  siblingCount?: number
  siblingIndex?: number
}

interface MessageListProps {
  messages: Message[]
  isStreaming: boolean
  canEditMessages: boolean
  editingMessageId: string | null
  editContent: string
  onEditContentChange: (content: string) => void
  onStartEdit: (messageId: string, content: string) => void
  onCancelEdit: () => void
  onSubmitEdit: () => void
  onNavigateBranch: (messageId: string, direction: 'prev' | 'next') => void
  onCopyMessage: (messageId: string, text: string) => void
  onRetry: (messageId: string) => void
  onStop: () => void
  onSuggestionClick: (action: string) => void
}

export const MessageList: FC<MessageListProps> = ({
  messages,
  isStreaming,
  canEditMessages,
  editingMessageId,
  editContent,
  onEditContentChange,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onNavigateBranch,
  onCopyMessage,
  onRetry,
  onStop,
  onSuggestionClick,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMouseEnter = useCallback((messageId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setHoveredMessageId(messageId)
  }, [])

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMessageId(null)
      hoverTimeoutRef.current = null
    }, 100)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleCopyMessage = useCallback((messageId: string, text: string) => {
    onCopyMessage(messageId, text)
    setCopiedMessageId(messageId)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }, [onCopyMessage])

  if (messages.length === 0) {
    return (
      <div className="aui-thread-viewport">
        <WelcomeScreen onSuggestionClick={onSuggestionClick} />
        <div ref={messagesEndRef} />
      </div>
    )
  }

  return (
    <div className="aui-thread-viewport">
      {messages.map((message) => {
        const isLastMessage = message.id === messages[messages.length - 1]?.id
        const isStreamingMessage = isStreaming && isLastMessage

        if (message.role === 'user') {
          return (
            <UserMessage
              key={message.id}
              id={message.id}
              content={message.content}
              attachments={message.attachments}
              siblingCount={message.siblingCount}
              siblingIndex={message.siblingIndex}
              isHovered={hoveredMessageId === message.id}
              isEditing={editingMessageId === message.id}
              editContent={editContent}
              isStreaming={isStreaming}
              canEdit={canEditMessages}
              onMouseEnter={() => handleMouseEnter(message.id)}
              onMouseLeave={handleMouseLeave}
              onStartEdit={() => onStartEdit(message.id, message.content)}
              onCancelEdit={onCancelEdit}
              onSubmitEdit={onSubmitEdit}
              onEditContentChange={onEditContentChange}
              onNavigateBranch={(direction) => onNavigateBranch(message.id, direction)}
            />
          )
        }

        return (
          <AssistantMessage
            key={message.id}
            id={message.id}
            content={message.content}
            reasoning={message.reasoning}
            toolCalls={message.toolCalls}
            isStreaming={isStreamingMessage}
            isLastMessage={isLastMessage}
            isHovered={hoveredMessageId === message.id}
            isCopied={copiedMessageId === message.id}
            onMouseEnter={() => handleMouseEnter(message.id)}
            onMouseLeave={handleMouseLeave}
            onCopy={() => handleCopyMessage(message.id, message.content)}
            onRetry={() => onRetry(message.id)}
            onStop={onStop}
          />
        )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}
