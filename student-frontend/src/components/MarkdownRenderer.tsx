import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const remarkPlugins = [remarkMath];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rehypePlugins: any[] = [[rehypeKatex, { throwOnError: false, errorColor: '#cc0000' }]];

function MarkdownRendererComponent({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content [&_p]:inline [&_p]:m-0 [&_.katex-display]:my-2 [&_.katex-display]:text-center ${className}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererComponent);
