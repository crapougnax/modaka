/**
 * Formats an ISO or timestamp string into a human-readable relative date representation.
 *
 * @param dateString - Optional date string (e.g. ISO 8601 string or Date parseable format).
 * @returns A relative date string (e.g., "À l'instant", "Il y a 5 min", "Il y a 2 h", "Il y a 1 jour") or localized date.
 */
export function formatRelativeDate(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) {
      return date.toLocaleDateString();
    }

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffDays < 3) {
      if (diffSec < 60) {
        return "À l'instant";
      }
      if (diffMin < 60) {
        return `Il y a ${diffMin} min`;
      }
      if (diffHrs < 24) {
        return `Il y a ${diffHrs} h`;
      }
      return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    }

    return date.toLocaleDateString();
  } catch (e) {
    return '';
  }
}
