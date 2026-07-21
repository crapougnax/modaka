import { describe, expect, it } from 'vitest';
import { formatRelativeDate } from './date';

describe('formatRelativeDate', () => {
  it('should return empty string for undefined, empty, or invalid dates', () => {
    expect(formatRelativeDate(undefined)).toBe('');
    expect(formatRelativeDate('')).toBe('');
    expect(formatRelativeDate('invalid-date-string')).toBe('');
  });

  it('should format seconds ago as "À l\'instant"', () => {
    const now = new Date();
    const tenSecondsAgo = new Date(now.getTime() - 10 * 1000).toISOString();
    expect(formatRelativeDate(tenSecondsAgo)).toBe("À l'instant");
  });

  it('should format minutes ago', () => {
    const now = new Date();
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeDate(fiveMinsAgo)).toBe('Il y a 5 min');
  });

  it('should format hours ago', () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeDate(twoHoursAgo)).toBe('Il y a 2 h');
  });

  it('should format days ago up to 2 days', () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 49 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeDate(oneDayAgo)).toBe('Il y a 1 jour');
    expect(formatRelativeDate(twoDaysAgo)).toBe('Il y a 2 jours');
  });

  it('should format older dates using toLocaleDateString', () => {
    const oldDate = new Date('2020-01-01T12:00:00Z').toISOString();
    const formatted = formatRelativeDate(oldDate);
    expect(formatted).not.toBe('');
    expect(formatted).not.toContain('Il y a');
  });
});
