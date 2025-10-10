import * as React from "react"
import { cn } from "@/lib/utils"
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
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  type PromptInputMessage,
  PromptInputSpeechButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Loader } from "@/components/ai/loader"
import { Actions, ActionButton } from "@/components/ai/actions"
import { TopBar } from "@/components/TopBar"
import { WelcomeScreen } from "@/components/WelcomeScreen"
import { HistoryPanel } from "@/components/HistoryPanel"
import { ModeSwitcher } from "@/components/ModeSwitcher"
import type { Mode } from "@/components/ModeSwitcher"
import { Button } from "@/components/ui/button"
import type { ChatStatus, FileUIPart } from "ai"

interface ChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  timestamp: number
  isStreaming?: boolean
  files?: FileUIPart[] | undefined
}

interface ConversationData {
  id: string
  title: string
  timestamp: number
  messageCount: number
}

export function ChatApp() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [currentRequestId, setCurrentRequestId] = React.useState<string | null>(null)
  const [conversations, setConversations] = React.useState<ConversationData[]>([])
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false)
  const [currentMode, setCurrentMode] = React.useState<Mode>("ask")
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const promptFormRef = React.useRef<HTMLFormElement>(null)

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
    console.log("📋 Loading conversations from IndexedDB...")
    try {
      // Load all conversations from IndexedDB via service worker
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_LIST",
        requestId: crypto.randomUUID(),
        payload: {},
      })

      console.log("Response from CONVERSATION_LIST:", response)

      if (response.success && response.data.conversations) {
        console.log(`Found ${response.data.conversations.length} conversations in database`)
        
        // Transform IndexedDB Conversation to UI ConversationData format
        const conversationData: ConversationData[] = response.data.conversations.map((conv: any) => {
          // Generate title from first user message or use default
          const firstUserMessage = conv.messages?.find((m: any) => m.role === "user")
          let title = "New Conversation"
          
          if (firstUserMessage) {
            const content = firstUserMessage.content
            title = content.length > 50 ? content.slice(0, 50) + "..." : content
          }

          console.log(`  - Conversation "${title}" (${conv.messages?.length || 0} messages)`)

          return {
            id: conv.id,
            title,
            timestamp: conv.updatedAt || conv.createdAt,
            messageCount: conv.messages?.length || 0,
          }
        })

        // Sort by timestamp descending (newest first)
        conversationData.sort((a, b) => b.timestamp - a.timestamp)
        setConversations(conversationData)
        console.log(`✅ Loaded ${conversationData.length} conversations successfully`)
      } else {
        console.log("⚠️ No conversations found or response unsuccessful")
        setConversations([])
      }
    } catch (error) {
      console.error("❌ Failed to load conversations:", error)
      setConversations([])
    }
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

  const handleStreamEnd = async (payload: any) => {
    // Update the streaming status first
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
    
    // Save conversation - wait for state to settle
    setTimeout(async () => {
      try {
        await saveConversation()
        console.log("✅ Conversation saved successfully")
      } catch (error) {
        console.error("❌ Failed to save conversation:", error)
      }
    }, 100)
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

  const handleSubmit = async (message: PromptInputMessage) => {
    const hasText = Boolean(message.text?.trim())
    const hasFiles = Boolean(message.files?.length)

    if (!hasText && !hasFiles) {
      return
    }

    if (isLoading) {
      return
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message.text || (hasFiles ? "Sent with attachments" : ""),
      timestamp: Date.now(),
      files: message.files || undefined,
    }

    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    // Generate or use existing conversation ID
    const requestId = crypto.randomUUID()
    const conversationId = currentConversationId || crypto.randomUUID()
    
    if (!currentConversationId) {
      setCurrentConversationId(conversationId)
    }

    // Save conversation immediately after user message (don't wait for AI response)
    // This ensures conversations are saved even if AI doesn't respond
    setTimeout(async () => {
      try {
        console.log('💾 Saving conversation after user message...')
        // Create a temporary messages array with the user message
        const tempMessages = [...messages, userMessage]
        
        // Transform to IndexedDB format
        const dbMessages = tempMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          source: 'gemini-nano' as const,
          metadata: { tokensUsed: 0 }
        }))

        // Check if conversation exists
        const existingResponse = await chrome.runtime.sendMessage({
          kind: "CONVERSATION_GET",
          requestId: crypto.randomUUID(),
          payload: { conversationId }
        })

        if (existingResponse.success && existingResponse.data.conversation) {
          // Update existing - add the user message
          const lastMessage = dbMessages[dbMessages.length - 1]
          if (lastMessage) {
            await chrome.runtime.sendMessage({
              kind: "CONVERSATION_UPDATE",
              requestId: crypto.randomUUID(),
              payload: {
                conversationId,
                message: lastMessage
              }
            })
            console.log('✅ User message added to existing conversation')
          }
        } else {
          // Create new conversation
          await chrome.runtime.sendMessage({
            kind: "CONVERSATION_CREATE",
            requestId: crypto.randomUUID(),
            payload: {
              conversationId,
              messages: dbMessages,
              model: 'gemini-nano',
              pocketId: undefined
            }
          })
          console.log('✅ New conversation created with user message')
        }

        // Refresh conversation list
        await loadConversations()
      } catch (error) {
        console.error('❌ Failed to save conversation after user message:', error)
      }
    }, 100)

    // Send request to service worker
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_STREAM_START",
        requestId,
        payload: {
          prompt: message.text || "Sent with attachments",
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
        // Resend the user message
        const submitMessage: PromptInputMessage = { 
          text: userMessage.content
        }
        if (userMessage.files) {
          submitMessage.files = userMessage.files
        }
        handleSubmit(submitMessage)
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
  }

  const handleSelectConversation = async (id: string) => {
    try {
      // Load full conversation with messages from IndexedDB
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_GET",
        requestId: crypto.randomUUID(),
        payload: { conversationId: id },
      })

      if (response.success && response.data.conversation) {
        const conversation = response.data.conversation
        setCurrentConversationId(id)

        // Transform IndexedDB Message[] to ChatMessage[] format
        const chatMessages: ChatMessage[] = conversation.messages.map((msg: any) => ({
          id: msg.id || crypto.randomUUID(),
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          isStreaming: false,
        }))

        setMessages(chatMessages)
      } else {
        console.error("Failed to load conversation:", response.error)
        // Fallback to empty conversation
        setCurrentConversationId(id)
        setMessages([])
      }
    } catch (error) {
      console.error("Error loading conversation:", error)
      setCurrentConversationId(id)
      setMessages([])
    }
  }

  const handleDeleteConversation = async (id: string) => {
    try {
      // Delete from IndexedDB via service worker
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_DELETE",
        requestId: crypto.randomUUID(),
        payload: { conversationId: id },
      })

      if (response.success) {
        // Update local state
        setConversations((prev) => prev.filter((c) => c.id !== id))
        
        if (currentConversationId === id) {
          setMessages([])
          setCurrentConversationId(null)
        }
      } else {
        console.error("Failed to delete conversation:", response.error)
      }
    } catch (error) {
      console.error("Error deleting conversation:", error)
    }
  }

  const saveConversation = async () => {
    if (!currentConversationId || messages.length === 0) {
      console.log("⚠️ Skipping save - no conversation ID or messages")
      return
    }

    console.log(`💾 Saving conversation ${currentConversationId} with ${messages.length} messages`)

    try {
      // Transform ChatMessage[] to IndexedDB Message[] format
      const dbMessages = messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        source: 'gemini-nano' as const, // Default source
        metadata: {
          tokensUsed: 0, // Could track this if needed
        },
      }))

      console.log("🔍 Checking if conversation exists in database...")
      
      // Check if conversation exists
      const existingResponse = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_GET",
        requestId: crypto.randomUUID(),
        payload: { conversationId: currentConversationId },
      })

      if (existingResponse.success && existingResponse.data.conversation) {
        console.log("📝 Updating existing conversation")
        // Update existing conversation - add the last message
        const lastMessage = dbMessages[dbMessages.length - 1]
        if (lastMessage) {
          const updateResponse = await chrome.runtime.sendMessage({
            kind: "CONVERSATION_UPDATE",
            requestId: crypto.randomUUID(),
            payload: {
              conversationId: currentConversationId,
              message: lastMessage,
            },
          })
          console.log("Update response:", updateResponse)
        }
      } else {
        console.log("✨ Creating new conversation with", dbMessages.length, "messages")
        // Create new conversation with all messages
        const createResponse = await chrome.runtime.sendMessage({
          kind: "CONVERSATION_CREATE",
          requestId: crypto.randomUUID(),
          payload: {
            conversationId: currentConversationId,
            messages: dbMessages,
            model: 'gemini-nano',
            pocketId: undefined, // Could link to a pocket if needed
          },
        })
        console.log("Create response:", createResponse)
      }

      // Update local conversation list
      console.log("🔄 Refreshing conversation list...")
      await loadConversations()
      console.log("✅ Conversation saved and list refreshed")
    } catch (error) {
      console.error("❌ Failed to save conversation:", error)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    // Submit the suggestion directly
    handleSubmit({ text: suggestion })
  }

  const handleModeChange = (mode: Mode) => {
    console.log(`🔄 Switching mode from ${currentMode} to ${mode}`)
    setCurrentMode(mode)
    
    // Preserve conversation context - no need to clear messages or state
    // The mode switch is just a UI state change that affects how the AI responds
    // Future enhancement: Could adjust AI behavior based on mode
    
    // Store mode preference
    localStorage.setItem("ai-pocket-mode", mode)
  }

  // Load mode preference on mount
  React.useEffect(() => {
    const savedMode = localStorage.getItem("ai-pocket-mode") as Mode
    if (savedMode && (savedMode === "ask" || savedMode === "ai-pocket")) {
      setCurrentMode(savedMode)
    }
  }, [])

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

      <div className="flex flex-1 flex-col overflow-hidden relative pb-32">
        {/* Floating Mode Switcher */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10">
          <ModeSwitcher
            currentMode={currentMode}
            onModeChange={handleModeChange}
          />
        </div>

        {/* Content Area with top padding to avoid mode switcher */}
        <div className="flex flex-1 flex-col pt-16 overflow-hidden">
          {messages.length === 0 ? (
            <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
          ) : (
            <Conversation className="overflow-hidden">
              <ConversationContent bottomInsetRef={promptFormRef}>
              {messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageAvatar
                    src={message.role === "user" ? "" : ""}
                    name={message.role === "user" ? "You" : message.role === "assistant" ? "AI" : "System"}
                  />
                  <MessageContent>
                    {/* Display file attachments if present */}
                    {message.files && message.files.length > 0 && (
                      <div className={cn(
                        "mb-2 flex flex-wrap gap-2",
                        message.role === "user" && "justify-end"
                      )}>
                        {message.files.map((file, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm",
                              message.role === "user" && "bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600"
                            )}
                          >
                            {file.type?.startsWith("image/") ? (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            ) : (
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            )}
                            <span className="truncate max-w-[150px]">{file.filename || "File"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={cn(
                      "inline-block",
                      message.role === "user" && "bg-gray-200 text-gray-900 rounded-2xl rounded-br-sm px-4 py-2 max-w-[85%] ml-auto text-right dark:bg-gray-700 dark:text-gray-100"
                    )}>
                      <Response className={cn(
                        "prose prose-sm dark:prose-invert max-w-none",
                        "prose-p:leading-relaxed prose-pre:p-0",
                        message.role === "user" && "prose-p:text-gray-900 prose-p:m-0 prose-p:text-right prose-headings:text-gray-900 prose-code:text-gray-900 prose-pre:text-gray-900 dark:prose-p:text-gray-100 dark:prose-headings:text-gray-100 dark:prose-code:text-gray-100 dark:prose-pre:text-gray-100"
                      )}>
                        {message.content}
                      </Response>
                    </div>
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
        </div>
      </div>

      {/* Fixed Bottom Input Bar */}
      <PromptInput
        onSubmit={handleSubmit}
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-4 shadow-lg backdrop-blur-sm bg-opacity-100 dark:bg-opacity-100"
        multiple
        accept="image/*,.pdf,.doc,.docx,.txt"
        ref={promptFormRef}
      >
        <PromptInputBody>
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder="Ask anything"
            onKeyDown={(e) => {
              if (e.key === "Escape" && currentRequestId) {
                handleCancel()
              }
            }}
            disabled={isLoading || !!currentRequestId}
          />
        </PromptInputBody>
        <PromptInputToolbar>
          <PromptInputTools>
            {/* Attachment Menu */}
            <PromptInputActionMenu>
              <PromptInputActionMenuTrigger />
              <PromptInputActionMenuContent>
                <PromptInputActionAddAttachments />
              </PromptInputActionMenuContent>
            </PromptInputActionMenu>
            
            {/* Speech Recognition Button */}
            <PromptInputSpeechButton
              textareaRef={textareaRef}
            />
          </PromptInputTools>
          
          {/* Submit or Cancel Button */}
          {currentRequestId ? (
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              size="icon"
              title="Cancel generation"
              className="h-10 w-10"
            >
              <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          ) : (
            <PromptInputSubmit
              {...(isLoading && { status: "submitted" as ChatStatus })}
            />
          )}
        </PromptInputToolbar>
      </PromptInput>
    </div>
  )
}
