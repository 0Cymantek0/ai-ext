import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai/conversation";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai/message";
import { Response } from "@/components/ai/response";
import { AIInputWithFile } from "@/components/ui/ai-input-with-file";
import { Loader } from "@/components/ai/loader";
import { Actions, ActionButton } from "@/components/ai/actions";
import { TopBar } from "@/components/TopBar";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { HistoryPanel } from "@/components/HistoryPanel";
import type { Mode } from "@/components/ModeSwitcher";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/animate-ui/components/animate/tooltip";
import { PocketManager, type PocketManagerRef, PocketSelectionModal } from "@/components/pockets";
import { NoteEditorPage } from "@/components/notes/NoteEditorPage";
import { ShareModal } from "@/components/ShareModal";
import { useIndexingStatus } from "@/hooks/useIndexingStatus";
import { IndexingWarningBanner } from "@/components/IndexingWarningBanner";
import { 
  exportToMarkdown, 
  exportToJSON, 
  exportToPDF,
  exportMessageToMarkdown,
  exportMessageToJSON,
  exportMessageToPDF
} from "@/lib/export-utils";
import { useVirtualizer } from "@tanstack/react-virtual";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  files?: File[] | undefined;
}

interface ConversationMetadata {
  summary: string;
  keywords: string[];
  topics: string[];
  entities: string[];
  mainQuestions: string[];
  generatedAt: number;
}

interface ConversationData {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
  messages?: Array<{ role: string; content: string }>;
  metadata?: ConversationMetadata;
}

interface PocketSelectionRequestState {
  requestId: string;
  pockets: Array<{ id: string; name: string; description?: string; color?: string }>;
  selectionText?: string;
  preview?: string;
  sourceUrl?: string;
}

export function ChatApp() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [currentRequestId, setCurrentRequestId] = React.useState<string | null>(
    null,
  );
  const [conversations, setConversations] = React.useState<ConversationData[]>(
    [],
  );
  const [currentConversationId, setCurrentConversationId] = React.useState<
    string | null
  >(null);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);
  const [currentMode, setCurrentMode] = React.useState<Mode>("ask");
  const conversationContentRef = React.useRef<HTMLDivElement>(null);
  // Floating mode switcher removed; drop scroll bookkeeping
  const pocketManagerRef = React.useRef<PocketManagerRef>(null);
  // Track if the conversation scroll is at the very top
  const [isAtTop, setIsAtTop] = React.useState(true);
  // Auto context toggle - enabled by default
  const [autoContext, setAutoContext] = React.useState(true);
  // Track if user is inside a pocket
  const [isInsidePocket, setIsInsidePocket] = React.useState(false);
  // Store current pocket ID for add actions
  const [currentPocketId, setCurrentPocketId] = React.useState<string | null>(null);
  // Pending pocket selection request from background
  const [pendingSelectionRequest, setPendingSelectionRequest] = React.useState<PocketSelectionRequestState | null>(null);
  // Note editor state
  const [showNoteEditor, setShowNoteEditor] = React.useState(false);
  const [isSavingNote, setIsSavingNote] = React.useState(false);
  // Share modal state
  const [showShareModal, setShowShareModal] = React.useState(false);
  // Export menu state - track which message's export menu is open
  const [exportMenuOpenForMessage, setExportMenuOpenForMessage] = React.useState<string | null>(null);
  // Virtual scroll activation threshold and setup
  const useVirtualizedMessages = messages.length > 50;
  const rowVirtualizer = useVirtualizer({
    count: useVirtualizedMessages ? messages.length : 0,
    getScrollElement: () => conversationContentRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });

  // Model selection: "auto" | "nano" | "flash-lite" | "flash" | "pro"
  const [selectedModel, setSelectedModel] = React.useState<
    "auto" | "nano" | "flash-lite" | "flash" | "pro"
  >("auto");
  
  // Indexing status hook
  const indexingStatus = useIndexingStatus();

  const mapSelectedToPreferLocal = (
    model: typeof selectedModel,
  ): boolean | undefined => {
    if (model === "nano") return true;
    if (model === "auto") return true; // Currently bias to local in engine
    return false; // cloud models
  };

  const mapSelectedToConversationModel = (
    model: typeof selectedModel,
  ): "gemini-nano" | "gemini-flash" | "gemini-pro" => {
    if (model === "pro") return "gemini-pro";
    if (model === "flash" || model === "flash-lite") return "gemini-flash";
    return "gemini-nano";
  };

  const mapSelectedToPayloadModel = (
    model: typeof selectedModel,
  ): "nano" | "flash" | "pro" | undefined => {
    if (model === "nano") return "nano";
    if (model === "pro") return "pro";
    if (model === "flash" || model === "flash-lite") return "flash";
    return undefined;
  };

  const loadConversations = async () => {
    console.log("📋 Loading conversations from IndexedDB...");
    try {
      // Load all conversations from IndexedDB via service worker
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_LIST",
        requestId: crypto.randomUUID(),
        payload: {},
      });

      console.log("Response from CONVERSATION_LIST:", response);

      if (response.success && response.data.conversations) {
        console.log(
          `Found ${response.data.conversations.length} conversations in database`,
        );

        // Transform IndexedDB Conversation to UI ConversationData format
        const conversationData: ConversationData[] =
          response.data.conversations.map((conv: any) => {
            // Generate title from first user message or use default
            const firstUserMessage = conv.messages?.find(
              (m: any) => m.role === "user",
            );
            let title = "New Conversation";

            if (firstUserMessage) {
              const content = firstUserMessage.content;
              title =
                content.length > 50 ? content.slice(0, 50) + "..." : content;
            }

            console.log(
              `  - Conversation "${title}" (${conv.messages?.length || 0} messages)`,
            );

            return {
              id: conv.id,
              title,
              timestamp: conv.updatedAt || conv.createdAt,
              messageCount: conv.messages?.length || 0,
              messages: conv.messages?.map((m: any) => ({
                role: m.role,
                content: m.content,
              })) || [],
              metadata: conv.metadata,
            };
          });

        // Sort by timestamp descending (newest first)
        conversationData.sort((a, b) => b.timestamp - a.timestamp);
        setConversations(conversationData);
        console.log(
          `✅ Loaded ${conversationData.length} conversations successfully`,
        );
      } else {
        console.log("⚠️ No conversations found or response unsuccessful");
        setConversations([]);
      }
    } catch (error) {
      console.error("❌ Failed to load conversations:", error);
      setConversations([]);
    }
  };

  // Streaming handlers with useCallback to prevent stale closures
  const handleStreamStart = React.useCallback((payload: any) => {
    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, newMessage]);
    setIsLoading(false);
  }, []);

  const handleStreamChunk = React.useCallback((payload: { chunk: string }) => {
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.isStreaming) {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: lastMessage.content + payload.chunk,
          },
        ];
      }
      return prev;
    });
  }, []);

  const saveConversationRef = React.useRef<(() => Promise<void>) | null>(null);

  const handleStreamEnd = React.useCallback(async (payload: any) => {
    // Update the streaming status first
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.isStreaming) {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            isStreaming: false,
          },
        ];
      }
      return prev;
    });
    setCurrentRequestId(null);

    // Save conversation - wait for state to settle
    setTimeout(async () => {
      try {
        if (saveConversationRef.current) {
          await saveConversationRef.current();
          console.log("✅ Conversation saved successfully");
        }
      } catch (error) {
        console.error("❌ Failed to save conversation:", error);
      }
    }, 100);
  }, []);

  const handleStreamError = React.useCallback((payload: { error: string }) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "system",
        content: `⚠️ Error: ${payload.error}`,
        timestamp: Date.now(),
      },
    ]);
    setIsLoading(false);
    setCurrentRequestId(null);
  }, []);

  const handlePocketSelectionConfirm = React.useCallback(
    async (pocketId: string, editedTitle?: string) => {
      if (!pendingSelectionRequest) return;
      try {
        await chrome.runtime.sendMessage({
          kind: "POCKET_SELECTION_RESPONSE",
          payload: {
            requestId: pendingSelectionRequest.requestId,
            status: "success",
            pocketId,
            editedTitle,
          },
        });
      } catch (error) {
        console.error("Failed to acknowledge pocket selection", error);
      } finally {
        setPendingSelectionRequest(null);
      }
    },
    [pendingSelectionRequest],
  );

  const handlePocketSelectionCancel = React.useCallback(async () => {
    if (!pendingSelectionRequest) return;
    try {
      await chrome.runtime.sendMessage({
        kind: "POCKET_SELECTION_RESPONSE",
        payload: {
          requestId: pendingSelectionRequest.requestId,
          status: "cancelled",
        },
      });
    } catch (error) {
      console.error("Failed to cancel pocket selection", error);
    } finally {
      setPendingSelectionRequest(null);
    }
  }, [pendingSelectionRequest]);

  // Set up message listener for streaming responses
  React.useEffect(() => {
    const messageListener = (message: any) => {
      switch (message.kind) {
        case "AI_PROCESS_STREAM_START":
          handleStreamStart(message.payload);
          break;
        case "AI_PROCESS_STREAM_CHUNK":
          handleStreamChunk(message.payload);
          break;
        case "AI_PROCESS_STREAM_END":
          handleStreamEnd(message.payload);
          break;
        case "AI_PROCESS_STREAM_ERROR":
          handleStreamError(message.payload);
          break;
        case "POCKET_SELECTION_REQUEST": {
          const payload = message.payload || {};
          setPendingSelectionRequest({
            requestId: payload.requestId,
            pockets: payload.pockets || [],
            selectionText: payload.selectionText,
            preview: payload.preview,
            sourceUrl: payload.sourceUrl,
          });
          break;
        }
        case "POCKET_SELECTION_RESPONSE": {
          const payload = message.payload || {};
          if (
            pendingSelectionRequest &&
            payload.requestId === pendingSelectionRequest.requestId
          ) {
            setPendingSelectionRequest(null);
          }
          break;
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [
    handleStreamStart,
    handleStreamChunk,
    handleStreamEnd,
    handleStreamError,
    pendingSelectionRequest,
  ]);

  // Load conversations on mount
  React.useEffect(() => {
    loadConversations();
  }, []);

  const handleSubmit = async (text: string, files?: File[]) => {
    // Consent check for cloud models
    if (selectedModel === "flash" || selectedModel === "flash-lite" || selectedModel === "pro") {
      const confirmed = confirm(
        `This will use a cloud model (${selectedModel === "pro" ? "Gemini 2.5 Pro" : selectedModel === "flash" ? "Gemini 2.5 Flash" : "Gemini 2.5 Flash Lite"}). Your data may be sent to the cloud. Continue?`,
      );
      if (!confirmed) {
        return;
      }
    }
    const hasText = Boolean(text?.trim());
    const hasFiles = Array.isArray(files) && files.length > 0;

    if (!hasText && !hasFiles) {
      return;
    }

    if (isLoading) {
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || (hasFiles ? "Sent with attachments" : ""),
      timestamp: Date.now(),
      files: hasFiles ? files : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Generate or use existing conversation ID
    const requestId = crypto.randomUUID();
    const conversationId = currentConversationId || crypto.randomUUID();

    if (!currentConversationId) {
      setCurrentConversationId(conversationId);
    }

    // Save conversation immediately after user message (don't wait for AI response)
    // This ensures conversations are saved even if AI doesn't respond
    setTimeout(async () => {
      try {
        console.log("💾 Saving conversation after user message...");
        // Create a temporary messages array with the user message
        const tempMessages = [...messages, userMessage];

        // Transform to IndexedDB format
        const dbMessages = tempMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          source: "gemini-nano" as const,
          metadata: { tokensUsed: 0 },
        }));

        // Check if conversation exists
        const existingResponse = await chrome.runtime.sendMessage({
          kind: "CONVERSATION_GET",
          requestId: crypto.randomUUID(),
          payload: { conversationId },
        });

        if (existingResponse.success && existingResponse.data.conversation) {
          // Update existing - add the user message
          const lastMessage = dbMessages[dbMessages.length - 1];
          if (lastMessage) {
            await chrome.runtime.sendMessage({
              kind: "CONVERSATION_UPDATE",
              requestId: crypto.randomUUID(),
              payload: {
                conversationId,
                message: lastMessage,
              },
            });
            console.log("✅ User message added to existing conversation");
          }
        } else {
          // Create new conversation
          await chrome.runtime.sendMessage({
            kind: "CONVERSATION_CREATE",
            requestId: crypto.randomUUID(),
            payload: {
              conversationId,
              messages: dbMessages,
              model: mapSelectedToConversationModel(selectedModel),
              pocketId: undefined,
            },
          });
          console.log("✅ New conversation created with user message");
        }

        // Refresh conversation list
        await loadConversations();
      } catch (error) {
        console.error(
          "❌ Failed to save conversation after user message:",
          error,
        );
      }
    }, 100);

    // Send request to service worker with mode information
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_STREAM_START",
        requestId,
        payload: {
          prompt: text || "Sent with attachment",
          conversationId,
          preferLocal: mapSelectedToPreferLocal(selectedModel),
          model: mapSelectedToPayloadModel(selectedModel),
          mode: currentMode, // Include current mode
          autoContext, // Use state variable for automatic context inclusion
        },
      });

      if (response.success) {
        setCurrentRequestId(requestId);
      } else {
        handleStreamError({ error: "Failed to start AI processing" });
      }
    } catch (error) {
      handleStreamError({ error: "Failed to send message" });
    }
  };

  const handleCancel = async () => {
    if (currentRequestId) {
      await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_CANCEL",
        requestId: crypto.randomUUID(),
        payload: {
          requestId: currentRequestId,
        },
      });
      setCurrentRequestId(null);
      setIsLoading(false);
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    // Could add a toast notification here
  };

  const handleRegenerate = async (messageId: string) => {
    // Find the user message before this assistant message
    const messageIndex = messages.findIndex((m) => m.id === messageId);
    if (messageIndex > 0) {
      const userMessage = messages[messageIndex - 1];
      if (userMessage && userMessage.role === "user") {
        // Remove the assistant message and resend
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        // Resend the user message
        const prevFiles = userMessage.files;
        handleSubmit(userMessage.content, prevFiles);
      }
    }
  };

  const handleShare = () => {
    if (messages.length === 0) {
      alert("No messages to share");
      return;
    }
    setShowShareModal(true);
  };

  const handleExportAll = (format: "markdown" | "json" | "pdf") => {
    if (messages.length === 0) {
      alert("No messages to export");
      return;
    }
    try {
      switch (format) {
        case "markdown":
          exportToMarkdown(messages);
          break;
        case "json":
          exportToJSON(messages);
          break;
        case "pdf":
          exportToPDF(messages);
          break;
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export conversation. Please try again.");
    }
  };

  const handleExportMessage = (message: ChatMessage, format: "markdown" | "json" | "pdf") => {
    try {
      switch (format) {
        case "markdown":
          exportMessageToMarkdown(message);
          break;
        case "json":
          exportMessageToJSON(message);
          break;
        case "pdf":
          exportMessageToPDF(message);
          break;
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export message. Please try again.");
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
  };

  const handleNewPocket = () => {
    if (pocketManagerRef.current) {
      pocketManagerRef.current.handleNewPocket();
    }
  };

  const handleInsidePocketChange = (isInside: boolean) => {
    setIsInsidePocket(isInside);
  };

  const handleAddNote = async () => {
    setShowNoteEditor(true);
  };

  const handleSaveNote = async (noteData: any) => {
    if (!currentPocketId) {
      alert("No pocket selected");
      return;
    }

    setIsSavingNote(true);
    try {
      const response = await chrome.runtime.sendMessage({
        kind: "CAPTURE_REQUEST",
        requestId: crypto.randomUUID(),
        payload: {
          mode: "note",
          pocketId: currentPocketId,
          content: noteData.content,
          metadata: {
            title: noteData.title,
            tags: noteData.tags || [],
            category: noteData.category,
          },
        },
      });

      if (response.success) {
        console.log("Note saved successfully");
        setShowNoteEditor(false);
        // Optionally reload content list
      } else {
        console.error("Failed to save note:", response.error);
        alert("Failed to save note. Please try again.");
      }
    } catch (error) {
      console.error("Error saving note:", error);
      alert("Error saving note. Please try again.");
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleAddFile = async () => {
    if (!currentPocketId) {
      alert("No pocket selected. Please select a pocket first.");
      return;
    }

    // Create a file input element
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.md";
    fileInput.multiple = false;

    fileInput.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        console.log("Uploading file:", file.name, file.type, file.size);

        // Read file as base64
        const reader = new FileReader();
        reader.onload = async (event) => {
          const base64Data = event.target?.result as string;

          try {
            const response = await chrome.runtime.sendMessage({
              kind: "FILE_UPLOAD",
              requestId: crypto.randomUUID(),
              payload: {
                pocketId: currentPocketId,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: base64Data,
              },
            });

            if (response?.status === "success") {
              console.log("File uploaded successfully:", response.contentId);
            } else {
              console.error("Upload failed:", response?.error);
              alert("Failed to upload file. Please try again.");
            }
          } catch (error) {
            console.error("Error uploading file:", error);
            alert("Error uploading file. Please try again.");
          }
        };

        reader.onerror = () => {
          alert("Error reading file. Please try again.");
        };

        reader.readAsDataURL(file);
      } catch (error) {
        console.error("Error processing file:", error);
        alert("Error processing file. Please try again.");
      }
    };

    // Trigger file selection
    fileInput.click();
  };



  const handleSelectConversation = async (id: string) => {
    try {
      // Load full conversation with messages from IndexedDB
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_GET",
        requestId: crypto.randomUUID(),
        payload: { conversationId: id },
      });

      if (response.success && response.data.conversation) {
        const conversation = response.data.conversation;
        setCurrentConversationId(id);

        // Transform IndexedDB Message[] to ChatMessage[] format
        const chatMessages: ChatMessage[] = conversation.messages.map(
          (msg: any) => ({
            id: msg.id || crypto.randomUUID(),
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            isStreaming: false,
          }),
        );

        setMessages(chatMessages);
      } else {
        console.error("Failed to load conversation:", response.error);
        // Fallback to empty conversation
        setCurrentConversationId(id);
        setMessages([]);
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
      setCurrentConversationId(id);
      setMessages([]);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      // Delete from IndexedDB via service worker
      const response = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_DELETE",
        requestId: crypto.randomUUID(),
        payload: { conversationId: id },
      });

      if (response.success) {
        // Update local state
        setConversations((prev) => prev.filter((c) => c.id !== id));

        if (currentConversationId === id) {
          setMessages([]);
          setCurrentConversationId(null);
        }
      } else {
        console.error("Failed to delete conversation:", response.error);
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  const saveConversation = React.useCallback(async () => {
    if (!currentConversationId || messages.length === 0) {
      console.log("⚠️ Skipping save - no conversation ID or messages");
      return;
    }

    console.log(
      `💾 Saving conversation ${currentConversationId} with ${messages.length} messages`,
    );

    try {
      // Transform ChatMessage[] to IndexedDB Message[] format
      const dbMessages = messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        source: "gemini-nano" as const, // Default source
        metadata: {
          tokensUsed: 0, // Could track this if needed
        },
      }));

      console.log("🔍 Checking if conversation exists in database...");

      // Check if conversation exists
      const existingResponse = await chrome.runtime.sendMessage({
        kind: "CONVERSATION_GET",
        requestId: crypto.randomUUID(),
        payload: { conversationId: currentConversationId },
      });

      if (existingResponse.success && existingResponse.data.conversation) {
        console.log("📝 Updating existing conversation");
        // Update existing conversation - add the last message
        const lastMessage = dbMessages[dbMessages.length - 1];
        if (lastMessage) {
          const updateResponse = await chrome.runtime.sendMessage({
            kind: "CONVERSATION_UPDATE",
            requestId: crypto.randomUUID(),
            payload: {
              conversationId: currentConversationId,
              message: lastMessage,
            },
          });
          console.log("Update response:", updateResponse);
        }
      } else {
        console.log(
          "✨ Creating new conversation with",
          dbMessages.length,
          "messages",
        );
        // Create new conversation with all messages
        const createResponse = await chrome.runtime.sendMessage({
          kind: "CONVERSATION_CREATE",
          requestId: crypto.randomUUID(),
          payload: {
            conversationId: currentConversationId,
            messages: dbMessages,
            model: "gemini-nano",
            pocketId: undefined, // Could link to a pocket if needed
          },
        });
        console.log("Create response:", createResponse);
      }

      // Update local conversation list
      console.log("🔄 Refreshing conversation list...");
      await loadConversations();
      console.log("✅ Conversation saved and list refreshed");
    } catch (error) {
      console.error("❌ Failed to save conversation:", error);
    }
  }, [currentConversationId, messages]);

  // Keep the ref updated with the latest saveConversation function
  React.useEffect(() => {
    saveConversationRef.current = saveConversation;
  }, [saveConversation]);

  const handleSuggestionClick = (suggestion: string) => {
    // Submit the suggestion directly
    handleSubmit(suggestion);
  };

  const handleModeChange = (mode: Mode) => {
    console.log(`🔄 Switching mode from ${currentMode} to ${mode}`);
    setCurrentMode(mode);

    // Preserve conversation context - no need to clear messages or state
    // The mode switch is just a UI state change that affects how the AI responds
    // Future enhancement: Could adjust AI behavior based on mode

    // Store mode preference
    localStorage.setItem("ai-pocket-mode", mode);
  };

  // Load mode and autoContext preferences on mount
  React.useEffect(() => {
    const savedMode = localStorage.getItem("ai-pocket-mode") as Mode;
    if (savedMode && (savedMode === "ask" || savedMode === "ai-pocket")) {
      setCurrentMode(savedMode);
    }
    
    const savedAutoContext = localStorage.getItem("ai-pocket-auto-context");
    if (savedAutoContext !== null) {
      setAutoContext(savedAutoContext === "true");
    }
  }, []);

  // Save autoContext preference when it changes
  React.useEffect(() => {
    localStorage.setItem("ai-pocket-auto-context", String(autoContext));
  }, [autoContext]);

  // Floating mode switcher removed; add top buffer behavior
  const handleScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    // Toggle top buffer based on scroll position
    const atTop = e.currentTarget.scrollTop <= 0;
    if (atTop !== isAtTop) {
      setIsAtTop(atTop);
    }
  };

  const selectionPreviewText = pendingSelectionRequest
    ? pendingSelectionRequest.preview ?? pendingSelectionRequest.selectionText
    : undefined;

  return (
    <TooltipProvider>
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        onOpenHistory={() => setIsHistoryOpen(true)}
        onNewChat={handleNewChat}
        onNewPocket={handleNewPocket}
        onAddNote={handleAddNote}
        onAddFile={handleAddFile}
        onExportChat={handleExportAll}
        currentMode={currentMode}
        onModeChange={handleModeChange}
        isInsidePocket={isInsidePocket}
        hasMessages={messages.length > 0}
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

      <div className="flex flex-1 flex-col overflow-hidden relative bg-transparent">
        {/* Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
          {currentMode === "ai-pocket" ? (
            <div className="flex flex-1 flex-col overflow-hidden">
              <PocketManager 
                ref={pocketManagerRef}
                onInsidePocketChange={handleInsidePocketChange}
                onAddNote={handleAddNote}
                onAddFile={handleAddFile}
                onSelectPocket={(pocket) => setCurrentPocketId(pocket.id)}
              />
            </div>
          ) : messages.length === 0 ? (
            <WelcomeScreen onSuggestionClick={handleSuggestionClick} />
          ) : (
            <>
              {/* Indexing Warning Banner for Ask mode */}
              {currentMode === "ask" && (indexingStatus.status.isAnyIndexing || indexingStatus.status.failedContentIds.size > 0) && (
                <div className="px-4 pt-20 pb-2">
                  <IndexingWarningBanner
                    indexingCount={indexingStatus.status.indexingContentIds.size}
                    failedCount={indexingStatus.status.failedContentIds.size}
                    onRetry={() => {
                      indexingStatus.status.failedContentIds.forEach((contentId) => {
                        indexingStatus.retryFailedIndexing(contentId);
                      });
                    }}
                  />
                </div>
              )}
              <Conversation className="overflow-hidden">
              <ConversationContent
                ref={conversationContentRef}
                onScroll={handleScroll}
                className={cn("pt-16")}
                forceAutoScroll={messages[messages.length - 1]?.isStreaming ?? false}
              >
                {useVirtualizedMessages ? (
                  <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
                    {rowVirtualizer.getVirtualItems().map((vi) => {
                      const message = messages[vi.index];
                      if (!message) return null;
                      return (
                        <div
                          key={message.id}
                          data-index={vi.index}
                          ref={(el) => {
                            if (el) rowVirtualizer.measureElement(el);
                          }}
                          className="pb-4"
                          style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                        >
                          <Message key={message.id} from={message.role}>
                            <MessageAvatar
                              src={message.role === "user" ? "" : ""}
                              name={
                                message.role === "user"
                                  ? "You"
                                  : message.role === "assistant"
                                    ? "AI"
                                    : "System"
                              }
                            />
                            <MessageContent>
                              {/* Display file attachments if present */}
                              {message.files && message.files.length > 0 && (
                                <div
                                  className={cn(
                                    "mb-2 flex flex-wrap gap-2",
                                    message.role === "user" && "justify-end",
                                  )}
                                >
                                  {message.files.map((file, idx) => (
                                    <div
                                      key={idx}
                                      className={cn(
                                        "flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm",
                                        message.role === "user" &&
                                          "bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600",
                                      )}
                                    >
                                      {file.type?.startsWith("image/") ? (
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                          />
                                        </svg>
                                      ) : (
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                          />
                                        </svg>
                                      )}
                                      <span className="truncate max-w-[150px]">
                                        {file.name || "File"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div
                                className={cn(
                                  "inline-block max-w-[85%] break-words",
                                  message.role === "user" &&
                                    "bg-gray-200 text-gray-900 rounded-2xl rounded-br-sm px-4 py-2 ml-auto text-right dark:bg-gray-700 dark:text-gray-100",
                                )}
                                style={{ overflowWrap: "anywhere" }}
                              >
                                <Response
                                  className={cn(
                                    "prose prose-sm dark:prose-invert max-w-full",
                                    "prose-p:leading-relaxed prose-pre:p-0",
                                    message.role === "user" &&
                                      "prose-p:text-gray-900 prose-p:m-0 prose-p:text-right prose-headings:text-gray-900 prose-code:text-gray-900 prose-pre:text-gray-900 dark:prose-p:text-gray-100 dark:prose-headings:text-gray-100 dark:prose-code:text-gray-100 dark:prose-pre:text-gray-100",
                                  )}
                                >
                                  {message.content}
                                </Response>
                              </div>
                              {message.role === "assistant" && !message.isStreaming && (
                                <Actions>
                                 
                                  <ActionButton onClick={() => handleCopy(message.content)} title="Copy to clipboard">
                                    <svg
                                      className="size-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M8 16h8a2 2 0 002-2V8m-6 8h2m-2 0V6"
                                      />
                                    </svg>
                                    Copy
                                  </ActionButton>
                                  <ActionButton onClick={() => handleRegenerate(message.id)} title="Regenerate this response">
                                    <svg
                                      className="size-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                      />
                                    </svg>
                                    Regenerate
                                  </ActionButton>
                                  <div className="relative">
                                    <ActionButton
                                      onClick={() => setExportMenuOpenForMessage(
                                        exportMenuOpenForMessage === message.id ? null : message.id
                                      )}
                                      title="Export this response"
                                    >
                                      <svg
                                        className="size-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                        />
                                      </svg>
                                      Export
                                    </ActionButton>
                                    {exportMenuOpenForMessage === message.id && (
                                      <div 
                                        className="absolute bottom-full left-0 mb-2 bg-gray-900/90 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-700/50 dark:border-gray-800/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px] z-50"
                                      >
                                        <button
                                          className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                          onClick={() => {
                                            handleExportMessage(message, "markdown");
                                            setExportMenuOpenForMessage(null);
                                          }}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                          </svg>
                                          Markdown
                                        </button>
                                        <button
                                          className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                          onClick={() => {
                                            handleExportMessage(message, "json");
                                            setExportMenuOpenForMessage(null);
                                          }}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                          </svg>
                                          JSON
                                        </button>
                                        <button
                                          className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                          onClick={() => {
                                            handleExportMessage(message, "pdf");
                                            setExportMenuOpenForMessage(null);
                                          }}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                          </svg>
                                          PDF
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </Actions>
                              )}
                              {message.isStreaming && (
                                <div className="mt-2">
                                  <Loader />
                                </div>
                              )}
                            </MessageContent>
                          </Message>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <MessageAvatar
                      src={message.role === "user" ? "" : ""}
                      name={
                        message.role === "user"
                          ? "You"
                          : message.role === "assistant"
                            ? "AI"
                            : "System"
                      }
                    />
                    <MessageContent>
                      {/* Display file attachments if present */}
                      {message.files && message.files.length > 0 && (
                        <div
                          className={cn(
                            "mb-2 flex flex-wrap gap-2",
                            message.role === "user" && "justify-end",
                          )}
                        >
                          {message.files.map((file, idx) => (
                            <div
                              key={idx}
                              className={cn(
                                "flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm",
                                message.role === "user" &&
                                  "bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600",
                              )}
                            >
                              {file.type?.startsWith("image/") ? (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                  />
                                </svg>
                              )}
                              <span className="truncate max-w-[150px]">
                                {file.name || "File"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div
                        className={cn(
                          "inline-block max-w-[85%] break-words",
                          message.role === "user" &&
                            "bg-gray-200 text-gray-900 rounded-2xl rounded-br-sm px-4 py-2 ml-auto text-right dark:bg-gray-700 dark:text-gray-100",
                        )}
                        style={{ overflowWrap: "anywhere" }}
                      >
                        <Response
                          className={cn(
                            "prose prose-sm dark:prose-invert max-w-full",
                            "prose-p:leading-relaxed prose-pre:p-0",
                            message.role === "user" &&
                              "prose-p:text-gray-900 prose-p:m-0 prose-p:text-right prose-headings:text-gray-900 prose-code:text-gray-900 prose-pre:text-gray-900 dark:prose-p:text-gray-100 dark:prose-headings:text-gray-100 dark:prose-code:text-gray-100 dark:prose-pre:text-gray-100",
                          )}
                        >
                          {message.content}
                        </Response>
                      </div>
                      {message.role === "assistant" && !message.isStreaming && (
                        <Actions>
                          <ActionButton
                            onClick={() => handleCopy(message.content)}
                            title="Copy to clipboard"
                          >
                            <svg
                              className="size-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                            Copy
                          </ActionButton>
                          <ActionButton
                            onClick={() => handleRegenerate(message.id)}
                            title="Regenerate response"
                          >
                            <svg
                              className="size-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                            Regenerate
                          </ActionButton>
                          <div className="relative">
                            <ActionButton
                              onClick={() => setExportMenuOpenForMessage(
                                exportMenuOpenForMessage === message.id ? null : message.id
                              )}
                              title="Export this response"
                            >
                              <svg
                                className="size-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                />
                              </svg>
                              Export
                            </ActionButton>
                            {exportMenuOpenForMessage === message.id && (
                              <div 
                                className="absolute bottom-full left-0 mb-2 bg-gray-900/90 dark:bg-gray-950/90 backdrop-blur-xl border border-gray-700/50 dark:border-gray-800/50 rounded-lg shadow-2xl overflow-hidden min-w-[180px] z-50"
                              >
                                <button
                                  className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                  onClick={() => {
                                    handleExportMessage(message, "markdown");
                                    setExportMenuOpenForMessage(null);
                                  }}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                  Markdown
                                </button>
                                <button
                                  className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                  onClick={() => {
                                    handleExportMessage(message, "json");
                                    setExportMenuOpenForMessage(null);
                                  }}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                  </svg>
                                  JSON
                                </button>
                                <button
                                  className="w-full text-left px-4 py-2 text-xs text-gray-100 hover:bg-gray-800/60 dark:hover:bg-gray-900/60 transition-colors flex items-center gap-2"
                                  onClick={() => {
                                    handleExportMessage(message, "pdf");
                                    setExportMenuOpenForMessage(null);
                                  }}
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                  PDF
                                </button>
                              </div>
                            )}
                          </div>
                        </Actions>
                      )}
                      {message.isStreaming && (
                        <div className="mt-2">
                          <Loader />
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                ))
                )}
              </ConversationContent>
            </Conversation>
            </>
          )}
        </div>
      </div>

      {/* Fixed Bottom Input Bar (floating, no background) - Only show in ask mode */}
      {currentMode === "ask" && (
        <div className="fixed bottom-4 left-0 right-0 z-50 bg-transparent pointer-events-none">
          {currentRequestId ? (
          <div className="max-w-xl mx-auto pointer-events-auto">
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              className="w-full h-10"
              title="Cancel generation"
            >
              <svg
                className="size-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              Cancel Generation
            </Button>
          </div>
        ) : (
          <div className="pointer-events-auto">
            <AIInputWithFile
              onSubmit={handleSubmit}
              placeholder={
                isLoading
                  ? "Processing..."
                  : "Ask anything about captured content"
              }
              accept="image/*,.pdf,.doc,.docx,.txt"
              maxFileSize={10}
              disabled={isLoading}
              className="mx-auto p-0 sm:p-0 py-0 px-0 max-w-[92vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl"
              model={selectedModel}
              onModelChange={setSelectedModel}
              autoContext={autoContext}
              onAutoContextChange={setAutoContext}
            />
          </div>
        )}
        </div>
      )}

      {/* Note Editor - Full Page */}
      {showNoteEditor && (
        <div className="fixed inset-0 z-[100]">
          <NoteEditorPage
            {...(currentPocketId ? { note: { pocketId: currentPocketId, title: "", content: "", tags: [] } } : {})}
            onSave={handleSaveNote}
            onCancel={() => setShowNoteEditor(false)}
            isLoading={isSavingNote}
          />
        </div>
      )}

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onExport={handleExportAll}
      />

      {pendingSelectionRequest && (
        <PocketSelectionModal
          pockets={pendingSelectionRequest.pockets}
          selectionText={pendingSelectionRequest.selectionText}
          preview={pendingSelectionRequest.preview}
          sourceUrl={pendingSelectionRequest.sourceUrl}
          onSelect={handlePocketSelectionConfirm}
          onCancel={handlePocketSelectionCancel}
        />
      )}
    </div>
    </TooltipProvider>
  );
}
