import React from 'react';

/**
 * Parses inline markdown elements (bold, italic, code, links) into safe HTML.
 *
 * @param text - The raw text line to parse.
 * @returns JSX Element with rendered HTML content.
 */
export function parseInlineMarkdown(text: string): React.ReactElement {
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>'
    )
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #00e599; text-decoration: underline;">$1</a>'
    );

  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Properties for the Markdown component.
 */
export interface MarkdownProps {
  content?: string;
}

/**
 * Lightweight React component for rendering simple Markdown structured text.
 * Supports headings (#, ##, ###), lists (*, -), paragraphs, bold, italic, code, and links.
 *
 * @param props - Markdown Component properties containing the string content.
 * @returns Rendered React node tree.
 */
export function Markdown({ content }: MarkdownProps): React.ReactElement | null {
  if (!content) return null;

  const lines = content.split('\n');
  let inList = false;
  const elements: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) {
        inList = true;
        currentListItems = [];
      }
      currentListItems.push(
        <li key={`li-${i}`} style={{ marginBottom: '4px', fontSize: '15px' }}>
          {parseInlineMarkdown(line.substring(2))}
        </li>
      );
    } else {
      if (inList) {
        inList = false;
        elements.push(
          <ul key={`ul-${i}`} style={{ marginLeft: '20px', marginBottom: '12px', listStyleType: 'disc' }}>
            {currentListItems}
          </ul>
        );
      }

      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={i} style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '16px', marginBottom: '8px' }}>
            {parseInlineMarkdown(line.substring(4))}
          </h4>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3 key={i} style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '20px', marginBottom: '10px' }}>
            {parseInlineMarkdown(line.substring(3))}
          </h3>
        );
      } else if (line.startsWith('# ')) {
        elements.push(
          <h2 key={i} style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '24px', marginBottom: '12px' }}>
            {parseInlineMarkdown(line.substring(2))}
          </h2>
        );
      } else if (line) {
        elements.push(
          <p key={i} style={{ fontSize: '15px', lineHeight: '1.6', marginBottom: '12px' }}>
            {parseInlineMarkdown(line)}
          </p>
        );
      }
    }
  }

  if (inList) {
    elements.push(
      <ul key="ul-end" style={{ marginLeft: '20px', marginBottom: '12px', listStyleType: 'disc' }}>
        {currentListItems}
      </ul>
    );
  }

  return <div style={{ display: 'flex', flexDirection: 'column' }}>{elements}</div>;
}
