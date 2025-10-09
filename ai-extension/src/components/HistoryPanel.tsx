import * as React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Conversation {
  id: string
  title: string
  timestamp: number
  messageCount: number
}

interface HistoryPanelProps {
  conversations: Conversation[]
  currentConversationId: string | null
  isOpen: boolean
  onClose: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onNewConversation: () => void
  className?: string
}

export function HistoryPanel({
  conversations,
  currentConversationId,
  isOpen,
  onClose,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  className,
}: HistoryPanelProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return "Today"
    if (days === 1) return "Yesterday"
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  const groupConversationsByDate = () => {
    const groups: Record<string, Conversation[]> = {}
    
    conversations.forEach((conv) => {
      const label = formatDate(conv.timestamp)
      if (!groups[label]) {
        groups[label] = []
      }
      groups[label].push(conv)
    })

    return groups
  }

  const grouped = groupConversationsByDate()

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-80 transform border-r border-border/50 bg-background shadow-xl transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full",
          className
        )}
      >
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          <h2 className="text-sm font-semibold">Conversation History</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close history"
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* New Chat Button */}
        <div className="p-4 border-b">
          <Button
            className="w-full justify-start gap-2"
            variant="outline"
            onClick={() => {
              onNewConversation()
              onClose()
            }}
          >
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Conversation
          </Button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="size-12 text-muted-foreground/50 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start chatting to create history</p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, convs]) => (
              <div key={dateLabel} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {dateLabel}
                </h3>
                <div className="space-y-1">
                  {convs.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={cn(
                        "group relative flex items-start gap-3 rounded-lg p-3 transition-all",
                        "hover:bg-accent cursor-pointer",
                        conversation.id === currentConversationId && "bg-accent/50 border border-primary/20"
                      )}
                      onClick={() => {
                        onSelectConversation(conversation.id)
                        onClose()
                      }}
                    >
                      <svg className="size-4 mt-0.5 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {conversation.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conversation.messageCount} message{conversation.messageCount !== 1 ? 's' : ''}
                        </p>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm("Delete this conversation?")) {
                            onDeleteConversation(conversation.id)
                          }
                        }}
                        aria-label="Delete conversation"
                      >
                        <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{conversations.length} conversation{conversations.length !== 1 ? 's' : ''} saved</span>
          </div>
        </div>
      </div>
    </>
  )
}

