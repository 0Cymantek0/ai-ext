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

interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  isStreaming?: boolean
}

export function ChatApp() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const [currentRequestId, setCurrentRequestId] = React.useState<string | null>(null)

  React.useEffect(() => {
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
  }

  const handleStreamError = (payload: { error: string }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "system",
        content: `Error: ${payload.error}`,
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
      const response = await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_STREAM_START",
        requestId,
        payload: {
          prompt: input,
          conversationId: crypto.randomUUID(),
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
            form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
          }
        }, 0)
      }
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-muted-foreground">
              <div>
                <p className="text-lg">👋 Welcome to AI Pocket!</p>
                <p className="mt-2">Ask me anything about your saved content or start a conversation.</p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <Message key={message.id} from={message.role}>
                <MessageAvatar
                  src={message.role === "user" ? "" : ""}
                  name={message.role === "user" ? "You" : "AI"}
                />
                <MessageContent>
                  <Response>{message.content}</Response>
                  {message.role === "assistant" && !message.isStreaming && (
                    <Actions>
                      <ActionButton onClick={() => handleCopy(message.content)}>
                        Copy
                      </ActionButton>
                      <ActionButton onClick={() => handleRegenerate(message.id)}>
                        Regenerate
                      </ActionButton>
                    </Actions>
                  )}
                  {message.isStreaming && <Loader />}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
      </Conversation>

      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder="Type your message..."
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault()
              handleSubmit(e)
            }
          }}
        />
        {currentRequestId ? (
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            Cancel
          </button>
        ) : (
          <PromptInputSubmit
            status={isLoading ? "loading" : "idle"}
            disabled={!input.trim()}
          />
        )}
      </PromptInput>
    </div>
  )
}

