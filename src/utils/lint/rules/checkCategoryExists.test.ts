import { describe, it, expect } from 'vitest';
import { checkCategoryExists } from './checkCategoryExists';

describe('checkCategoryExists', () => {
  const IMAGE_ID = 'img-003';

  // ── Passing cases (returns null) ────────────────────────────────────────────

  it('returns null when the category exists', () => {
    expect(checkCategoryExists('Birds of Europe', true, IMAGE_ID)).toBeNull();
  });

  it('returns null for any category name when exists is true', () => {
    expect(checkCategoryExists('Nonexistent Category XYZ', true, IMAGE_ID)).toBeNull();
  });

  it('returns null when exists is true and the category name is empty', () => {
    // Edge case: caller passed an empty string but still flagged it as existing
    expect(checkCategoryExists('', true, IMAGE_ID)).toBeNull();
  });

  // ── Failing cases (returns error) ───────────────────────────────────────────

  it('returns an error when the category does not exist', () => {
    const result = checkCategoryExists('Nonexistent Category XYZ', false, IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('error');
    expect(result?.code).toBe('category-not-found');
    expect(result?.imageId).toBe(IMAGE_ID);
  });

  it('includes the category name in the error message', () => {
    const result = checkCategoryExists('My Missing Category', false, IMAGE_ID);
    expect(result?.message).toContain('My Missing Category');
  });

  it('surrounds the category name with quotes in the error message', () => {
    const result = checkCategoryExists('Birds', false, IMAGE_ID);
    expect(result?.message).toContain('"Birds"');
  });

  it('includes the correct imageId in the returned issue', () => {
    const result = checkCategoryExists('Some Category', false, 'unique-img-77');
    expect(result?.imageId).toBe('unique-img-77');
  });

  // ── Severity and code contract ──────────────────────────────────────────────

  it('always uses severity "error" (not "warning") for missing categories', () => {
    const result = checkCategoryExists('Missing', false, IMAGE_ID);
    expect(result?.severity).toBe('error');
  });

  it('uses the code "category-not-found"', () => {
    const result = checkCategoryExists('Missing', false, IMAGE_ID);
    expect(result?.code).toBe('category-not-found');
  });

  // ── Category name edge cases ─────────────────────────────────────────────────

  it('handles a category name with special characters', () => {
    const result = checkCategoryExists('Château de Versailles', false, IMAGE_ID);
    expect(result?.message).toContain('Château de Versailles');
  });

  it('handles a category name with parentheses', () => {
    const result = checkCategoryExists('Buildings (France)', false, IMAGE_ID);
    expect(result?.message).toContain('Buildings (France)');
  });

  it('handles a very long category name', () => {
    const longName = 'A'.repeat(200);
    const result = checkCategoryExists(longName, false, IMAGE_ID);
    expect(result?.message).toContain(longName);
  });

  it('handles a category name that is only whitespace', () => {
    // The rule itself does not validate the category name; it just checks exists
    const result = checkCategoryExists('   ', false, IMAGE_ID);
    expect(result?.code).toBe('category-not-found');
  });
});
