import * as React from "react"
import {
  Conversation,
  ConversationContent,
} from "@/components/ai/conversation"
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai/message"
import { Response } from "@/components/ai/response"
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai/prompt-input"
import { Loader } from "@/components/ai/loader"
import { Actions, ActionButton } from "@/components/ai/actions"
import { TopBar } from "@/components/TopBar"
import { WelcomeScreen } from "@/components/WelcomeScreen"
import { HistoryPanel } from "@/components/HistoryPanel"
import { Button } from "@/components/ui/button"

interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  isStreaming?: boolean
}

interface ConversationData {
  id: string
  title: string
  timestamp: number
  messageCount: number
}

export function ChatApp() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [currentRequestId, setCurrentRequestId] = React.useState<string | null>(null)
  const [conversations, setConversations] = React.useState<ConversationData[]>([])
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false)

  React.useEffect(() => {
    // Load conversations from storage
    loadConversations()

    // Set up message listener for streaming responses
    const messageListener = (message: any) => {
      switch (message.kind) {
        case "AI_PROCESS_STREAM_START":
          handleStreamStart(message.payload)
          break
        case "AI_PROCESS_STREAM_CHUNK":
          handleStreamChunk(message.payload)
          break
        case "AI_PROCESS_STREAM_END":
          handleStreamEnd(message.payload)
          break
        case "AI_PROCESS_STREAM_ERROR":
          handleStreamError(message.payload)
          break
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [])

  const loadConversations = async () => {
    // TODO: Load from chrome.storage
    const mockConversations: ConversationData[] = [
      {
        id: "1",
        title: "Welcome to AI Pocket",
        timestamp: Date.now() - 1000 * 60 * 60,
        messageCount: 5,
      },
      {
        id: "2",
        title: "How to use web scraping",
        timestamp: Date.now() - 1000 * 60 * 60 * 24,
        messageCount: 12,
      },
      {
        id: "3",
        title: "React best practices",
        timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
        messageCount: 8,
      },
    ]
    setConversations(mockConversations)
  }

  const handleStreamStart = (payload: any) => {
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    }
    setMessages((prev) => [...prev, newMessage])
    setIsLoading(false)
  }

  const handleStreamChunk = (payload: { chunk: string }) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1]
      if (lastMessage && lastMessage.isStreaming) {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: lastMessage.content + payload.chunk,
          },
        ]
      }
      return prev
    })
  }

  const handleStreamEnd = (payload: any) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1]
      if (lastMessage && lastMessage.isStreaming) {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            isStreaming: false,
          },
        ]
      }
      return prev
    })
    setCurrentRequestId(null)
    
    // Save conversation
    saveConversation()
  }

  const handleStreamError = (payload: { error: string }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "system",
        content: `⚠️ Error: ${payload.error}`,
        timestamp: Date.now(),
      },
    ])
    setIsLoading(false)
    setCurrentRequestId(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!input.trim() || isLoading) {
      return
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      timestamp: Date.now(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // Send request to service worker
    try {
      const requestId = crypto.randomUUID()
      const conversationId = currentConversationId || crypto.randomUUID()
      
      if (!currentConversationId) {
        setCurrentConversationId(conversationId)
      }

      const response = await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_STREAM_START",
        requestId,
        payload: {
          prompt: input,
          conversationId,
          preferLocal: true,
        },
      })

      if (response.success) {
        setCurrentRequestId(requestId)
      } else {
        handleStreamError({ error: "Failed to start AI processing" })
      }
    } catch (error) {
      handleStreamError({ error: "Failed to send message" })
    }
  }

  const handleCancel = async () => {
    if (currentRequestId) {
      await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_CANCEL",
        requestId: crypto.randomUUID(),
        payload: {
          requestId: currentRequestId,
        },
      })
      setCurrentRequestId(null)
      setIsLoading(false)
    }
  }

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content)
    // Could add a toast notification here
  }

  const handleRegenerate = async (messageId: string) => {
    // Find the user message before this assistant message
    const messageIndex = messages.findIndex((m) => m.id === messageId)
    if (messageIndex > 0) {
      const userMessage = messages[messageIndex - 1]
      if (userMessage && userMessage.role === "user") {
        // Remove the assistant message and resend
        setMessages((prev) => prev.filter((m) => m.id !== messageId))
        setInput(userMessage.content)
        // Trigger submit
        setTimeout(() => {
          const form = document.querySelector("form")
          if (form) {
            const event = new Event("submit", { bubbles: true, cancelable: true })
            form.dispatchEvent(event)
          }
        }, 0)
      }
    }
  }

  const handleNewChat = () => {
    if (messages.length > 0) {
      const confirmNew = confirm("Start a new conversation? Current chat will be saved.")
      if (!confirmNew) return
    }
    
    setMessages([])
    setCurrentConversationId(null)
    setInput("")
  }

  const handleSelectConversation = async (id: string) => {
    // TODO: Load conversation messages from storage
    setCurrentConversationId(id)
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Loaded conversation: ${conversations.find((c) => c.id === id)?.title}`,
        timestamp: Date.now(),
      },
    ])
  }

  const handleDeleteConversation = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (currentConversationId === id) {
      setMessages([])
      setCurrentConversationId(null)
    }
    // TODO: Delete from storage
  }

  const saveConversation = async () => {
    if (!currentConversationId || messages.length === 0) return

    // Generate title from first user message
    const firstUserMessage = messages.find((m) => m.role === "user")
    const title = firstUserMessage?.content.slice(0, 50) + (firstUserMessage?.content.length! > 50 ? "..." : "") || "New Conversation"

    const conversation: ConversationData = {
      id: currentConversationId,
      title,
      timestamp: Date.now(),
      messageCount: messages.length,
    }

    setConversations((prev) => {
      const existing = prev.findIndex((c) => c.id === currentConversationId)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = conversation
        return updated
      }
      return [conversation, ...prev]
    })

    // TODO: Save to chrome.storage
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
    // Auto-focus the input
    setTimeout(() => {
      const textarea = document.querySelector("textarea")
      if (textarea) {
        textarea.focus()
      }
    }, 100)
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar
        onOpenHistory={() => setIsHistoryOpen(true)}
        onNewChat={handleNewChat}
      />

      <HistoryPanel
        conversations={conversations}
        currentConversationId={currentConversationId}
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        onNewConversation={handleNewChat}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {messages.length === 0 ? (
          <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
        ) : (
          <Conversation>
            <ConversationContent>
              {messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageAvatar
                    src={message.role === "user" ? "" : ""}
                    name={message.role === "user" ? "You" : message.role === "assistant" ? "AI" : "System"}
                  />
                  <MessageContent>
                    <Response>{message.content}</Response>
                    {message.role === "assistant" && !message.isStreaming && (
                      <Actions>
                        <ActionButton 
                          onClick={() => handleCopy(message.content)}
                          title="Copy to clipboard"
                        >
                          <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </ActionButton>
                        <ActionButton 
                          onClick={() => handleRegenerate(message.id)}
                          title="Regenerate response"
                        >
                          <svg className="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Regenerate
                        </ActionButton>
                      </Actions>
                    )}
                    {message.isStreaming && (
                      <div className="mt-2">
                        <Loader />
                      </div>
                    )}
                  </MessageContent>
                </Message>
              ))}
            </ConversationContent>
          </Conversation>
        )}

        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="Ask me anything..."
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault()
                handleSubmit(e)
              }
              if (e.key === "Escape" && currentRequestId) {
                handleCancel()
              }
            }}
            disabled={isLoading || !!currentRequestId}
          />
          {currentRequestId ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              size="default"
              title="Cancel generation"
            >
              <svg className="size-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              Cancel
            </Button>
          ) : (
            <PromptInputSubmit
              status={isLoading ? "loading" : "idle"}
              disabled={!input.trim()}
            />
          )}
        </PromptInput>
      </div>
    </div>
  )
}
