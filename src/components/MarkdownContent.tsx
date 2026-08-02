import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MarkdownTone = 'default' | 'error' | 'muted' | 'onDark';

interface MarkdownContentProps {
  children: string;
  tone?: MarkdownTone;
  className?: string;
}

function toneClass(tone: MarkdownTone): string {
  if (tone === 'error') return 'ai-md--error';
  if (tone === 'muted') return 'ai-md--muted';
  if (tone === 'onDark') return 'ai-md--on-dark';
  return '';
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  children,
  tone = 'default',
  className = '',
}) => {
  const text = children.trim();
  if (!text) return null;

  return (
    <div className={`ai-md select-text ${toneClass(tone)} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {linkChildren}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};
