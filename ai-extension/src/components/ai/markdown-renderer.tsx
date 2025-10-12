import * as React from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

interface CodeBlockProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ inline, className, children }) => {
  const [copied, setCopied] = React.useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (inline) {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
        {children}
      </code>
    );
  }

  return (
    <div className="group relative my-4 max-w-full overflow-x-auto rounded-lg">
      <div className="absolute right-2 top-2 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || "text"}
        PreTag="div"
        className="rounded-lg !bg-[#282c34] text-sm min-w-0"
        customStyle={{
          margin: 0,
          padding: "1rem",
          paddingTop: "2.5rem",
          overflowX: "auto",
          maxWidth: "100%",
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
}) => {
  return (
    <div className={cn("markdown-content break-words max-w-full", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Code blocks with syntax highlighting
          code: CodeBlock,
          
          // Links open in new tab
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            />
          ),
          
          // Headings with appropriate styles
          h1: ({ node, ...props }) => (
            <h1
              {...props}
              className="mb-4 mt-6 text-2xl font-bold tracking-tight first:mt-0"
            />
          ),
          h2: ({ node, ...props }) => (
            <h2
              {...props}
              className="mb-3 mt-6 text-xl font-semibold tracking-tight first:mt-0"
            />
          ),
          h3: ({ node, ...props }) => (
            <h3
              {...props}
              className="mb-2 mt-4 text-lg font-semibold tracking-tight first:mt-0"
            />
          ),
          h4: ({ node, ...props }) => (
            <h4
              {...props}
              className="mb-2 mt-4 text-base font-semibold tracking-tight first:mt-0"
            />
          ),
          h5: ({ node, ...props }) => (
            <h5
              {...props}
              className="mb-2 mt-4 text-sm font-semibold tracking-tight first:mt-0"
            />
          ),
          h6: ({ node, ...props }) => (
            <h6
              {...props}
              className="mb-2 mt-4 text-sm font-semibold tracking-tight first:mt-0"
            />
          ),
          
          // Paragraphs
          p: ({ node, ...props }) => (
            <p {...props} className="mb-4 leading-7 last:mb-0 break-words" />
          ),
          
          // Unordered lists
          ul: ({ node, ...props }) => (
            <ul {...props} className="mb-4 ml-6 list-disc space-y-2" />
          ),
          
          // Ordered lists
          ol: ({ node, ...props }) => (
            <ol {...props} className="mb-4 ml-6 list-decimal space-y-2" />
          ),
          
          // List items
          li: ({ node, ...props }) => (
            <li {...props} className="leading-7" />
          ),
          
          // Tables
          table: ({ node, ...props }) => (
            <div className="my-4 w-full overflow-x-auto">
              <table
                {...props}
                className="w-full border-collapse border border-border"
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead {...props} className="bg-muted" />
          ),
          tbody: ({ node, ...props }) => <tbody {...props} />,
          tr: ({ node, ...props }) => (
            <tr {...props} className="border-b border-border" />
          ),
          th: ({ node, ...props }) => (
            <th
              {...props}
              className="border border-border px-4 py-2 text-left font-semibold"
            />
          ),
          td: ({ node, ...props }) => (
            <td {...props} className="border border-border px-4 py-2" />
          ),
          
          // Blockquotes
          blockquote: ({ node, ...props }) => (
            <blockquote
              {...props}
              className="my-4 border-l-4 border-primary pl-4 italic text-muted-foreground"
            />
          ),
          
          // Horizontal rules
          hr: ({ node, ...props }) => (
            <hr {...props} className="my-8 border-border" />
          ),
          
          // Strong (bold)
          strong: ({ node, ...props }) => (
            <strong {...props} className="font-bold" />
          ),
          
          // Emphasis (italic)
          em: ({ node, ...props }) => (
            <em {...props} className="italic" />
          ),
          
          // Strikethrough (from GFM)
          del: ({ node, ...props }) => (
            <del {...props} className="line-through" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
