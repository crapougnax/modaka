import { describe, expect, it } from 'vitest';
import { parseOKFContent } from './queue';

describe('parseOKFContent', () => {
   it('should parse valid OKF markdown with YAML frontmatter', () => {
      const okfContent = `---
type: specification
title: OKF Spec Test
description: A document describing OKF specification
tags:
  - okf
  - markdown
properNouns:
  - Modaka
category: technology/ai
timestamp: '2026-07-25T12:00:00.000Z'
---
# OKF Specification

This is the body of the OKF file.
`;

      const parsed = parseOKFContent(okfContent);
      expect(parsed.isOKF).toBe(true);
      expect(parsed.result).toBeDefined();
      expect(parsed.result?.title).toBe('OKF Spec Test');
      expect(parsed.result?.type).toBe('specification');
      expect(parsed.result?.summary).toBe('A document describing OKF specification');
      expect(parsed.result?.tags).toEqual(['okf', 'markdown']);
      expect(parsed.result?.properNouns).toEqual(['Modaka']);
      expect(parsed.result?.category).toBe('technology/ai');
      expect(parsed.result?.deductedDate).toBe('2026-07-25T12:00:00.000Z');
      expect(parsed.result?.markdown.trim()).toBe('# OKF Specification\n\nThis is the body of the OKF file.');
   });

   it('should return isOKF false for standard markdown without frontmatter', () => {
      const standardMd = `# Hello World\n\nJust normal markdown without frontmatter.`;
      const parsed = parseOKFContent(standardMd);
      expect(parsed.isOKF).toBe(false);
      expect(parsed.result).toBeUndefined();
   });

   it('should return isOKF false for invalid YAML frontmatter', () => {
      const brokenContent = `---
type: [invalid yaml structure: : :
---
Body text`;
      const parsed = parseOKFContent(brokenContent);
      expect(parsed.isOKF).toBe(false);
   });
});
