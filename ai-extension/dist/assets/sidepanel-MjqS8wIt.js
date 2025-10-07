import"./modulepreload-polyfill-B5Qt9EMX.js";class d{constructor(e){this.messages=[],this.currentStreamingMessageId=null,this.currentRequestId=null;const t=document.getElementById(e);if(!t)throw new Error(`Container element with id "${e}" not found`);this.container=t,this.conversationId=crypto.randomUUID(),this.initializeUI(),this.setupMessageListener(),this.setupKeyboardShortcuts()}initializeUI(){this.container.innerHTML=`
      <div class="chat-container">
        <div class="chat-header">
          <h2>AI Pocket Assistant</h2>
          <div class="chat-status" id="chat-status"></div>
        </div>
        
        <div class="message-list" id="message-list" role="log" aria-live="polite" aria-label="Chat messages">
          <div class="welcome-message">
            <p>👋 Welcome to AI Pocket!</p>
            <p>Ask me anything about your saved content or start a conversation.</p>
          </div>
        </div>
        
        <div class="chat-input-container">
          <div class="typing-indicator" id="typing-indicator" style="display: none;" aria-live="polite">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="typing-text">AI is thinking...</span>
          </div>
          
          <div class="input-wrapper">
            <textarea 
              id="chat-input" 
              class="chat-input" 
              placeholder="Type your message..." 
              rows="1"
              aria-label="Chat message input"
            ></textarea>
            
            <div class="button-group">
              <button 
                id="cancel-button" 
                class="cancel-button" 
                style="display: none;"
                aria-label="Cancel current request"
                title="Cancel (Esc)"
              >
                ✕ Cancel
              </button>
              
              <button 
                id="send-button" 
                class="send-button"
                aria-label="Send message"
                title="Send (Ctrl+Enter)"
              >
                ➤ Send
              </button>
            </div>
          </div>
        </div>
      </div>
    `,this.messageList=document.getElementById("message-list"),this.inputField=document.getElementById("chat-input"),this.sendButton=document.getElementById("send-button"),this.cancelButton=document.getElementById("cancel-button"),this.sendButton.addEventListener("click",()=>this.handleSend()),this.cancelButton.addEventListener("click",()=>this.handleCancel()),this.inputField.addEventListener("input",()=>this.handleInputChange())}setupKeyboardShortcuts(){this.inputField.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.key==="Enter"&&(e.preventDefault(),this.handleSend()),e.key==="Escape"&&this.currentRequestId&&(e.preventDefault(),this.handleCancel())})}handleInputChange(){this.inputField.style.height="auto",this.inputField.style.height=Math.min(this.inputField.scrollHeight,150)+"px"}async handleSend(){const e=this.inputField.value.trim();if(!(!e||this.currentRequestId)){this.addMessage({id:crypto.randomUUID(),role:"user",content:e,timestamp:Date.now()}),this.inputField.value="",this.handleInputChange(),this.showTypingIndicator();try{const t={prompt:e,conversationId:this.conversationId,preferLocal:!0},s=await this.sendMessage({kind:"AI_PROCESS_STREAM_START",requestId:crypto.randomUUID(),payload:t});s.success&&s.data?(this.currentRequestId=s.data.requestId,this.showCancelButton()):(this.hideTypingIndicator(),this.showError("Failed to start AI processing"))}catch(t){console.error("Error sending message:",t),this.hideTypingIndicator(),this.showError("Failed to send message")}}}async handleCancel(){if(this.currentRequestId)try{const e={requestId:this.currentRequestId};if(await this.sendMessage({kind:"AI_PROCESS_CANCEL",requestId:crypto.randomUUID(),payload:e}),this.currentStreamingMessageId){const t=this.messages.find(s=>s.id===this.currentStreamingMessageId);t&&(t.isStreaming=!1,t.content+=`

[Cancelled by user]`,this.updateMessageInDOM(t))}this.currentRequestId=null,this.currentStreamingMessageId=null,this.hideTypingIndicator(),this.hideCancelButton()}catch(e){console.error("Error cancelling request:",e)}}setupMessageListener(){chrome.runtime.onMessage.addListener(e=>{switch(e.kind){case"AI_PROCESS_STREAM_START":this.handleStreamStart(e.payload);break;case"AI_PROCESS_STREAM_CHUNK":this.handleStreamChunk(e.payload);break;case"AI_PROCESS_STREAM_END":this.handleStreamEnd(e.payload);break;case"AI_PROCESS_STREAM_ERROR":this.handleStreamError(e.payload);break}})}handleStreamStart(e){console.log("Stream started:",e);const t=crypto.randomUUID();this.currentStreamingMessageId=t,this.addMessage({id:t,role:"assistant",content:"",timestamp:Date.now(),isStreaming:!0}),this.hideTypingIndicator()}handleStreamChunk(e){if(!this.currentStreamingMessageId)return;const t=this.messages.find(s=>s.id===this.currentStreamingMessageId);t&&(t.content+=e.chunk,this.updateMessageInDOM(t),this.scrollToBottom())}handleStreamEnd(e){if(!this.currentStreamingMessageId)return;const t=this.messages.find(s=>s.id===this.currentStreamingMessageId);t&&(t.isStreaming=!1,t.source=e.source,t.processingTime=e.processingTime,t.tokensUsed=e.totalTokens,this.updateMessageInDOM(t)),this.currentRequestId=null,this.currentStreamingMessageId=null,this.hideCancelButton(),console.log("Stream completed:",e)}handleStreamError(e){if(console.error("Stream error:",e),this.currentStreamingMessageId){const t=this.messages.find(s=>s.id===this.currentStreamingMessageId);t&&(t.isStreaming=!1,t.content+=`

❌ Error: ${e.error}`,this.updateMessageInDOM(t))}else this.showError(e.error);this.currentRequestId=null,this.currentStreamingMessageId=null,this.hideTypingIndicator(),this.hideCancelButton()}addMessage(e){this.messages.push(e),this.renderMessage(e),this.scrollToBottom()}renderMessage(e){const t=document.createElement("div");t.className=`message message-${e.role}`,t.id=`message-${e.id}`,t.setAttribute("role","article"),t.setAttribute("aria-label",`${e.role} message`);const s=document.createElement("div");s.className="message-content",s.textContent=e.content;const n=document.createElement("div");n.className="message-meta";const o=new Date(e.timestamp).toLocaleTimeString();if(n.textContent=o,e.source){const a=document.createElement("span");a.className="message-source",a.textContent=` • ${this.formatSource(e.source)}`,n.appendChild(a)}if(e.isStreaming){const a=document.createElement("span");a.className="streaming-indicator",a.textContent=" • Streaming...",n.appendChild(a)}t.appendChild(s),t.appendChild(n);const i=this.messageList.querySelector(".welcome-message");i&&i.remove(),this.messageList.appendChild(t)}updateMessageInDOM(e){const t=document.getElementById(`message-${e.id}`);if(!t)return;const s=t.querySelector(".message-content");s&&(s.textContent=e.content);const n=t.querySelector(".message-meta");if(n){const o=new Date(e.timestamp).toLocaleTimeString();if(n.textContent=o,e.source){const i=document.createElement("span");i.className="message-source",i.textContent=` • ${this.formatSource(e.source)}`,n.appendChild(i)}if(e.isStreaming){const i=document.createElement("span");i.className="streaming-indicator",i.textContent=" • Streaming...",n.appendChild(i)}}}formatSource(e){return{"gemini-nano":"Gemini Nano (Local)","gemini-flash":"Gemini Flash (Cloud)","gemini-pro":"Gemini Pro (Cloud)"}[e]||e}showTypingIndicator(){const e=document.getElementById("typing-indicator");e&&(e.style.display="flex")}hideTypingIndicator(){const e=document.getElementById("typing-indicator");e&&(e.style.display="none")}showCancelButton(){this.cancelButton.style.display="block",this.sendButton.style.display="none"}hideCancelButton(){this.cancelButton.style.display="none",this.sendButton.style.display="block"}showError(e){this.addMessage({id:crypto.randomUUID(),role:"system",content:`❌ ${e}`,timestamp:Date.now()})}scrollToBottom(){this.messageList.scrollTop=this.messageList.scrollHeight}async sendMessage(e){return new Promise((t,s)=>{chrome.runtime.sendMessage(e,n=>{chrome.runtime.lastError?s(chrome.runtime.lastError):t(n)})})}clearConversation(){this.messages=[],this.messageList.innerHTML=`
      <div class="welcome-message">
        <p>👋 Welcome to AI Pocket!</p>
        <p>Ask me anything about your saved content or start a conversation.</p>
      </div>
    `,this.conversationId=crypto.randomUUID()}getMessages(){return[...this.messages]}}console.info("AI Pocket side panel initialized");let c=null;try{c=new d("app"),console.info("Chat interface initialized successfully")}catch(r){console.error("Failed to initialize chat interface:",r);const e=document.getElementById("app");e&&(e.innerHTML=`
      <div style="padding: 20px; text-align: center; color: #dc3545;">
        <h2>⚠️ Initialization Error</h2>
        <p>Failed to initialize the chat interface.</p>
        <p style="font-size: 12px; color: #666;">${r instanceof Error?r.message:"Unknown error"}</p>
      </div>
    `)}chrome.runtime.sendMessage({kind:"SIDE_PANEL_READY"}).catch(r=>{console.warn("Failed to notify service worker:",r)});window.chatInterface=c;
