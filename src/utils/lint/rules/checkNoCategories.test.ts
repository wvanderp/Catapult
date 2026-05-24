import { describe, it, expect } from 'vitest';
import { checkNoCategories } from './checkNoCategories';

describe('checkNoCategories', () => {
  const IMAGE_ID = 'img-002';

  // ── Passing cases (returns null) ────────────────────────────────────────────

  it('returns null when a single category is present', () => {
    const wikitext = `{{Information|description={{en|1=A photo}}}}
[[Category:Birds of Europe]]`;
    expect(checkNoCategories(wikitext, IMAGE_ID)).toBeNull();
  });

  it('returns null when multiple categories are present', () => {
    const wikitext = `{{Information|description={{en|1=A photo}}}}
[[Category:Birds]]
[[Category:Nature]]`;
    expect(checkNoCategories(wikitext, IMAGE_ID)).toBeNull();
  });

  it('returns null when a category has a sort key', () => {
    // Sort keys are still a valid category reference
    expect(checkNoCategories('[[Category:Birds|Sparrow]]', IMAGE_ID)).toBeNull();
  });

  it('returns null when the category prefix is lowercase', () => {
    expect(checkNoCategories('[[category:Flowers]]', IMAGE_ID)).toBeNull();
  });

  it('returns null when the category prefix is UPPERCASE', () => {
    expect(checkNoCategories('[[CATEGORY:Flowers]]', IMAGE_ID)).toBeNull();
  });

  it('returns null when a duplicate category is present (de-dup still gives ≥ 1)', () => {
    expect(checkNoCategories('[[Category:Birds]]\n[[Category:Birds]]', IMAGE_ID)).toBeNull();
  });

  // ── Failing cases (returns warning) ─────────────────────────────────────────

  it('returns a warning when no categories are present', () => {
    const wikitext = `{{Information|description={{en|1=A photo}}}}`;
    const result = checkNoCategories(wikitext, IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('warning');
    expect(result?.code).toBe('no-categories');
    expect(result?.imageId).toBe(IMAGE_ID);
  });

  it('returns a warning for an empty string', () => {
    const result = checkNoCategories('', IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('warning');
    expect(result?.code).toBe('no-categories');
  });

  it('returns a warning when only non-category wikilinks are present', () => {
    const wikitext = '[[File:Photo.jpg]] [[Wikipedia:Something]]';
    const result = checkNoCategories(wikitext, IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.code).toBe('no-categories');
  });

  it('returns a warning for a fully-filled template with no categories', () => {
    const wikitext = `{{Information
|description={{en|1=A beautiful photo}}
|date=2025-01-01
|source={{own}}
|author=John Doe
|permission={{self|cc-by-sa-4.0}}
}}`;
    const result = checkNoCategories(wikitext, IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('warning');
  });

  // ── imageId propagation ─────────────────────────────────────────────────────

  it('includes the correct imageId in the returned issue', () => {
    const result = checkNoCategories('no categories here', 'specific-id-99');
    expect(result?.imageId).toBe('specific-id-99');
  });

  // ── Severity and code contract ──────────────────────────────────────────────

  it('always uses severity "warning" (not "error") for missing categories', () => {
    const result = checkNoCategories('', IMAGE_ID);
    expect(result?.severity).toBe('warning');
  });

  it('uses the code "no-categories"', () => {
    const result = checkNoCategories('', IMAGE_ID);
    expect(result?.code).toBe('no-categories');
  });
});
