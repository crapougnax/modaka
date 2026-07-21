import { describe, expect, it, vi } from 'vitest';
import { searchAndCreateConcept } from './concept-autolink';

describe('searchAndCreateConcept', () => {
  it('should ignore empty or whitespace proper noun input', async () => {
    await expect(searchAndCreateConcept('')).resolves.toBeUndefined();
    await expect(searchAndCreateConcept('   ')).resolves.toBeUndefined();
  });
});
