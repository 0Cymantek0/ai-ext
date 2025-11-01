import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
  className?: string | undefined;
  theme?: "light" | "dark";
}

interface CodeBlockProps {
  inline?: boolean;
  className?: string | undefined;
  children?: React.ReactNode;
  theme?: "light" | "dark";
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  inline,
  className,
  children,
  theme = "dark",
}) => {
  const [copied, setCopied] = React.useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Treat as inline if explicitly marked or if there's no language and no newlines
  const isInline = inline || (!language && !code.includes("\n"));

  if (isInline) {
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm whitespace-nowrap">
        {children}
      </code>
    );
  }

  return (
    <div className="group relative my-4 max-w-full overflow-x-auto rounded-lg">
      {/* Language label */}
      {language && (
        <div className="bg-muted px-4 py-2 text-xs font-mono text-muted-foreground border-b border-border rounded-t-lg">
          {language}
        </div>
      )}
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
      <pre
        className={cn(
          "bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono border border-border",
          language ? "!rounded-t-none pt-4" : "pt-10",
        )}
      >
        <code className={className}>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
  theme = "dark",
}) => {
  return (
    <div className={cn("markdown-content break-words max-w-full", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex as any]}
        components={{
          // Code blocks with syntax highlighting
          code: (props) => <CodeBlock {...props} theme={theme} />,

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
          p: ({ children, ...props }) => {
            return (
              <p {...props} className="mb-4 leading-7 last:mb-0 break-words">
                {children}
              </p>
            );
          },

          // Unordered lists
          ul: ({ node, ...props }) => (
            <ul
              {...props}
              className="mb-4 ml-6 list-disc list-outside space-y-1"
            />
          ),

          // Ordered lists
          ol: ({ node, ...props }) => (
            <ol
              {...props}
              className="mb-4 ml-6 list-decimal list-outside space-y-1"
            />
          ),

          // List items (with task list support)
          li: ({ node, children, ...props }) => {
            // Check if this is a task list item
            const childArray = React.Children.toArray(children);
            const firstChild = childArray[0];

            if (
              typeof firstChild === "object" &&
              firstChild &&
              "type" in firstChild &&
              firstChild.type === "input"
            ) {
              return (
                <li className="list-none flex items-start gap-2 leading-7 ml-0">
                  {children}
                </li>
              );
            }

            return <li className="leading-7 pl-1">{children}</li>;
          },

          // Task list checkboxes
          input: ({ node, ...props }) => {
            if (props.type === "checkbox") {
              return (
                <input
                  className="mt-1.5 cursor-pointer w-4 h-4 rounded border-2 border-primary accent-primary"
                  disabled
                  {...props}
                />
              );
            }
            return <input {...props} />;
          },

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
          em: ({ node, ...props }) => <em {...props} className="italic" />,

          // Strikethrough (from GFM)
          del: ({ node, ...props }) => (
            <del {...props} className="line-through opacity-70" />
          ),

          // Images with better styling
          img: ({ node, ...props }) => (
            <img
              {...props}
              className="max-w-full h-auto rounded-lg my-4 border border-border"
              loading="lazy"
            />
          ),

          // Preformatted text (for code blocks without language)
          pre: ({ children, ...props }) => {
            // Check if this pre contains a code element
            const hasCodeChild = React.Children.toArray(children).some(
              (child) =>
                typeof child === "object" &&
                child &&
                "type" in child &&
                child.type === "code",
            );

            if (hasCodeChild) {
              return <>{children}</>;
            }

            return (
              <pre
                className="bg-muted p-4 rounded-lg overflow-x-auto my-4 text-sm font-mono border border-border"
                {...props}
              >
                {children}
              </pre>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
