import { describe, expect, it } from 'vitest';
import { parseInlineMarkdown } from './markdown';

describe('markdown inline parser', () => {
  it('should escape raw HTML characters', () => {
    const element = parseInlineMarkdown('<div>&foo</div>');
    expect(element.props.dangerouslySetInnerHTML.__html).toContain('&lt;div&gt;&amp;foo&lt;/div&gt;');
  });

  it('should replace **bold** syntax', () => {
    const element = parseInlineMarkdown('This is **bold** text');
    expect(element.props.dangerouslySetInnerHTML.__html).toContain('<strong>bold</strong>');
  });

  it('should replace *italic* syntax', () => {
    const element = parseInlineMarkdown('This is *italic* text');
    expect(element.props.dangerouslySetInnerHTML.__html).toContain('<em>italic</em>');
  });

  it('should replace `code` syntax', () => {
    const element = parseInlineMarkdown('Here is `code` block');
    expect(element.props.dangerouslySetInnerHTML.__html).toContain('<code');
    expect(element.props.dangerouslySetInnerHTML.__html).toContain('code</code>');
  });

  it('should replace [link](url) syntax', () => {
    const element = parseInlineMarkdown('Check [Google](https://google.com)');
    expect(element.props.dangerouslySetInnerHTML.__html).toContain('<a href="https://google.com"');
    expect(element.props.dangerouslySetInnerHTML.__html).toContain('>Google</a>');
  });
});
