import { describe, it, expect } from 'vitest';
import { extractCategories } from './extractCategories';

describe('extractCategories', () => {
  // ── Basic extraction ────────────────────────────────────────────────────────

  it('returns an empty array when there are no categories', () => {
    expect(extractCategories('{{Information|description={{en|1=A photo}}}}')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(extractCategories('')).toEqual([]);
  });

  it('extracts a single category', () => {
    expect(extractCategories('[[Category:Birds of Europe]]')).toEqual(['Birds of Europe']);
  });

  it('extracts multiple categories in order', () => {
    const wikitext = `
{{Information|description={{en|1=A photo}}}}
[[Category:Birds of Europe]]
[[Category:Nature photography]]
    `.trim();
    expect(extractCategories(wikitext)).toEqual(['Birds of Europe', 'Nature photography']);
  });

  // ── Sort keys ───────────────────────────────────────────────────────────────

  it('ignores sort keys after the pipe separator', () => {
    expect(extractCategories('[[Category:Birds|Sparrow]]')).toEqual(['Birds']);
  });

  it('ignores sort key even when it contains spaces', () => {
    expect(extractCategories('[[Category:Mammals|Brown bear]]')).toEqual(['Mammals']);
  });

  // ── Whitespace handling ─────────────────────────────────────────────────────

  it('trims leading and trailing whitespace from category names', () => {
    expect(extractCategories('[[Category:  Mammals  ]]')).toEqual(['Mammals']);
  });

  it('preserves internal spaces within a category name', () => {
    expect(extractCategories('[[Category:Birds of Europe]]')).toEqual(['Birds of Europe']);
  });

  // ── Case insensitivity ──────────────────────────────────────────────────────

  it('matches a lowercase "category:" prefix', () => {
    expect(extractCategories('[[category:Flowers]]')).toEqual(['Flowers']);
  });

  it('matches a mixed-case "CATEGORY:" prefix', () => {
    expect(extractCategories('[[CATEGORY:Flowers]]')).toEqual(['Flowers']);
  });

  // ── Deduplication ───────────────────────────────────────────────────────────

  it('de-duplicates repeated identical categories', () => {
    expect(extractCategories('[[Category:Birds]]\n[[Category:Birds]]')).toEqual(['Birds']);
  });

  it('treats categories with the same name but different prefixes as duplicates', () => {
    // Both resolve to the same category name after extracting the prefix
    expect(extractCategories('[[Category:Birds]]\n[[category:Birds]]')).toEqual(['Birds']);
  });

  // ── Unicode and special characters ─────────────────────────────────────────

  it('handles category names with unicode characters', () => {
    expect(extractCategories('[[Category:Château de Versailles]]')).toEqual([
      'Château de Versailles',
    ]);
  });

  it('handles category names with parentheses', () => {
    expect(extractCategories('[[Category:Buildings (France)]]')).toEqual(['Buildings (France)']);
  });

  it('handles category names with commas', () => {
    expect(extractCategories('[[Category:Birds, European]]')).toEqual(['Birds, European']);
  });

  // ── Embedded in template markup ─────────────────────────────────────────────

  it('extracts categories that appear after an Information template block', () => {
    const wikitext = `{{Information
|description={{en|1=A beautiful photo}}
|date=2025-01-01
}}
[[Category:Sunsets]]
[[Category:Photography]]`;
    expect(extractCategories(wikitext)).toEqual(['Sunsets', 'Photography']);
  });

  it('does not extract wikilinks that are not categories', () => {
    const wikitext = '[[File:Photo.jpg]] [[Wikipedia:Something]] [[Category:Birds]]';
    expect(extractCategories(wikitext)).toEqual(['Birds']);
  });

  it('returns an empty array when only non-category wikilinks are present', () => {
    const wikitext = '[[File:Photo.jpg]] [[Wikipedia:Something]]';
    expect(extractCategories(wikitext)).toEqual([]);
  });
});
