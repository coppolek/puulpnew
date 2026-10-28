import React, { useState } from 'react';
import { Copy, Check, Terminal, Code2 } from 'lucide-react';

interface FormattedArticleContentProps {
  content: string;
  className?: string;
}

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const cleanLang = (language || 'code').trim().toLowerCase();
  const displayLang = getLanguageLabel(cleanLang);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  }

  return (
    <div className="my-4 border-2 border-border rounded-none overflow-hidden shadow-[3px_3px_0_0_var(--foreground)] bg-zinc-950 text-zinc-100">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900 border-b-2 border-zinc-800 text-xs">
        <div className="flex items-center gap-2">
          {/* Terminal dots */}
          <div className="flex items-center gap-1.5 mr-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80 inline-block" />
          </div>

          <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-[11px] font-bold">
            {cleanLang === 'bash' || cleanLang === 'sh' || cleanLang === 'shell' || cleanLang === 'terminal' ? (
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Code2 className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="uppercase tracking-wider">{displayLang}</span>
          </div>
        </div>

        {/* Copy Button */}
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-bold transition-all border cursor-pointer ${
            copied
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700 active:scale-95'
          }`}
          title="Copia codice negli appunti"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copiato!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copia</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content */}
      <div className="relative overflow-x-auto p-4 font-mono text-xs sm:text-sm leading-relaxed max-h-[500px] overflow-y-auto">
        <pre className="text-zinc-100 font-mono whitespace-pre selection:bg-primary/40 selection:text-white">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function getLanguageLabel(lang: string): string {
  switch (lang) {
    case 'js':
    case 'javascript':
      return 'JavaScript';
    case 'ts':
    case 'typescript':
      return 'TypeScript';
    case 'py':
    case 'python':
      return 'Python';
    case 'html':
      return 'HTML';
    case 'css':
      return 'CSS';
    case 'json':
      return 'JSON';
    case 'bash':
    case 'sh':
    case 'shell':
      return 'Bash / Terminal';
    case 'sql':
      return 'SQL';
    case 'rust':
      return 'Rust';
    case 'go':
    case 'golang':
      return 'Go';
    case 'php':
      return 'PHP';
    case 'xml':
      return 'XML';
    case 'yaml':
    case 'yml':
      return 'YAML';
    case 'md':
    case 'markdown':
      return 'Markdown';
    default:
      return lang ? lang.toUpperCase() : 'CODICE';
  }
}

// Render inline code and basic bold/italic formatting inside text
function renderInlineFormatting(text: string): React.ReactNode {
  // Split on inline code: `code`
  const parts = text.split(/(`[^`]+`)/g);

  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      const codeSnippet = part.slice(1, -1);
      return (
        <code
          key={index}
          className="font-mono text-[0.88em] bg-muted/80 text-primary border border-border/80 px-1.5 py-0.5 rounded font-bold select-all mx-0.5"
        >
          {codeSnippet}
        </code>
      );
    }

    // Bold formatting: **bold**
    if (part.includes('**')) {
      const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
      return (
        <React.Fragment key={index}>
          {boldParts.map((bPart, bIdx) => {
            if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length >= 4) {
              return <strong key={bIdx} className="font-extrabold text-foreground">{bPart.slice(2, -2)}</strong>;
            }
            return bPart;
          })}
        </React.Fragment>
      );
    }

    return part;
  });
}

export function FormattedArticleContent({ content, className = '' }: FormattedArticleContentProps) {
  if (!content) return null;

  // Split into blocks: separates fenced code blocks from normal text paragraphs
  const blocks: Array<
    | { type: 'code'; language: string; code: string }
    | { type: 'h2'; text: string }
    | { type: 'h3'; text: string }
    | { type: 'blockquote'; text: string }
    | { type: 'list'; items: string[] }
    | { type: 'paragraph'; text: string }
  > = [];

  const lines = content.split('\n');
  let inCodeBlock = false;
  let currentCodeLang = '';
  let currentCodeLines: string[] = [];
  let currentListItems: string[] = [];
  let currentParagraphLines: string[] = [];

  function flushParagraph() {
    if (currentParagraphLines.length > 0) {
      const text = currentParagraphLines.join('\n').trim();
      if (text) {
        blocks.push({ type: 'paragraph', text });
      }
      currentParagraphLines = [];
    }
  }

  function flushList() {
    if (currentListItems.length > 0) {
      blocks.push({ type: 'list', items: [...currentListItems] });
      currentListItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check code fence
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        blocks.push({
          type: 'code',
          language: currentCodeLang,
          code: currentCodeLines.join('\n'),
        });
        inCodeBlock = false;
        currentCodeLang = '';
        currentCodeLines = [];
      } else {
        // Start of code block
        flushParagraph();
        flushList();
        inCodeBlock = true;
        currentCodeLang = trimmed.replace(/^```/, '').trim();
        currentCodeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      currentCodeLines.push(line);
      continue;
    }

    // List item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      flushParagraph();
      currentListItems.push(trimmed.slice(2));
      continue;
    } else if (currentListItems.length > 0 && !trimmed) {
      flushList();
      continue;
    }

    // Heading 2 (## )
    if (trimmed.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'h2', text: trimmed.replace(/^##\s+/, '') });
      continue;
    }

    // Heading 3 (### )
    if (trimmed.startsWith('### ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'h3', text: trimmed.replace(/^###\s+/, '') });
      continue;
    }

    // Blockquote (> )
    if (trimmed.startsWith('> ')) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'blockquote', text: trimmed.replace(/^>\s+/, '') });
      continue;
    }

    // Empty line separates paragraphs
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    // Regular text line
    currentParagraphLines.push(line);
  }

  // Final flushes
  if (inCodeBlock && currentCodeLines.length > 0) {
    blocks.push({
      type: 'code',
      language: currentCodeLang,
      code: currentCodeLines.join('\n'),
    });
  }
  flushParagraph();
  flushList();

  const fontFraunces = { fontFamily: 'Fraunces, Georgia, serif' };

  return (
    <div className={`space-y-4 text-foreground/90 leading-relaxed ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'code':
            return <CodeBlock key={idx} code={block.code} language={block.language} />;

          case 'h2':
            return (
              <h2
                key={idx}
                className="text-xl sm:text-2xl font-black mt-7 mb-3 text-foreground pt-3 border-t border-border/40"
                style={fontFraunces}
              >
                {renderInlineFormatting(block.text)}
              </h2>
            );

          case 'h3':
            return (
              <h3
                key={idx}
                className="text-lg sm:text-xl font-bold mt-5 mb-2 text-foreground"
                style={fontFraunces}
              >
                {renderInlineFormatting(block.text)}
              </h3>
            );

          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className="p-3 sm:p-4 my-3 bg-muted/40 border-l-4 border-primary text-foreground/90 italic text-sm sm:text-base"
              >
                {renderInlineFormatting(block.text)}
              </blockquote>
            );

          case 'list':
            return (
              <ul key={idx} className="list-disc list-inside space-y-1.5 my-3 pl-2 text-sm sm:text-base">
                {block.items.map((it, iIdx) => (
                  <li key={iIdx} className="leading-relaxed">
                    {renderInlineFormatting(it)}
                  </li>
                ))}
              </ul>
            );

          case 'paragraph':
          default:
            return (
              <p key={idx} className="text-sm sm:text-base leading-relaxed">
                {renderInlineFormatting(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
