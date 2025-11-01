import { AIInputWithFile } from "@/components/ui/ai-input-with-file";

export function AIInputWithFileDemo() {
  const handleSubmit = (message: string, files?: File[]) => {
    console.log("Message:", message);
    if (files && files.length) {
      console.log(`Files (${files.length}):`);
      for (const f of files) {
        console.log("-", f.name, f.size, f.type);
      }
    } else {
      console.log("No files attached");
    }

    // Here you would typically:
    // 1. Process the message with AI
    // 2. Upload the file if present
    // 3. Add to conversation history
    // 4. Clear the input
  };

  return (
    <div className="space-y-8 min-w-[400px] p-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">
          AI Input with File Upload Demo (Chrome Extension Ready)
        </h2>
        <p className="text-sm text-muted-foreground">
          Try typing a message and/or uploading an image file. Works with Chrome
          extension security constraints.
        </p>
      </div>

      <AIInputWithFile
        onSubmit={handleSubmit}
        placeholder="Ask me anything or upload a file!"
        accept="image/*,.pdf,.doc,.docx,.txt"
        maxFileSize={10}
        maxFiles={5}
      />

      <div className="text-xs text-muted-foreground space-y-1 bg-muted p-3 rounded-lg">
        <h3 className="font-semibold text-sm mb-2">
          Chrome Extension Features:
        </h3>
        <p>✅ Click the paperclip to open file picker</p>
        <p>✅ Drag and drop files onto the input area</p>
        <p>✅ Works within Chrome extension security constraints</p>
        <p>✅ File validation (size and type checking)</p>
        <p>✅ Visual feedback during drag operations</p>
        <p>✅ Error handling with clear messages</p>

        <h3 className="font-semibold text-sm mt-3 mb-2">File Support:</h3>
        <p>• Maximum file size: 10MB</p>
        <p>• Supported formats: Images, PDF, DOC, DOCX, TXT</p>
        <p>• File information display (name, size)</p>
        <p>• Easy file removal with clear button</p>
      </div>
    </div>
  );
}
