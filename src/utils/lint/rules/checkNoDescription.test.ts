import { describe, it, expect } from 'vitest';
import { checkNoDescription } from './checkNoDescription';

describe('checkNoDescription', () => {
  const IMAGE_ID = 'img-001';

  // ── Passing cases (returns null) ────────────────────────────────────────────

  it('returns null when the description is populated with plain text', () => {
    const wikitext = `{{Information
|description=A beautiful sunset
|date=2025-01-01
}}`;
    expect(checkNoDescription(wikitext, IMAGE_ID)).toBeNull();
  });

  it('returns null when the description uses the {{en|1=...}} wrapper', () => {
    const wikitext = `{{Information
|description={{en|1=A beautiful sunset over the mountains}}
|date=2025-01-01
}}`;
    expect(checkNoDescription(wikitext, IMAGE_ID)).toBeNull();
  });

  it('returns null when the description contains special characters', () => {
    const wikitext = '|description=Château de Versailles – exterior façade';
    expect(checkNoDescription(wikitext, IMAGE_ID)).toBeNull();
  });

  it('returns null when the description field has leading whitespace before content', () => {
    const wikitext = '|description=   Some valid description';
    expect(checkNoDescription(wikitext, IMAGE_ID)).toBeNull();
  });

  it('returns null when the description is a single word', () => {
    expect(checkNoDescription('|description=Photo', IMAGE_ID)).toBeNull();
  });

  it('returns null when the |description= key has surrounding whitespace', () => {
    expect(checkNoDescription('| description = Some text', IMAGE_ID)).toBeNull();
  });

  it('returns null with a non-empty {{en|1=}} wrapper', () => {
    expect(checkNoDescription('|description={{en|1=Hello world}}', IMAGE_ID)).toBeNull();
  });

  // ── Failing cases (returns error) ───────────────────────────────────────────

  it('returns an error when the |description= field is completely absent', () => {
    const wikitext = `{{Information
|date=2025-01-01
|source={{own}}
}}`;
    const result = checkNoDescription(wikitext, IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('error');
    expect(result?.code).toBe('no-description');
    expect(result?.imageId).toBe(IMAGE_ID);
  });

  it('returns an error when the description is blank (empty after the equals sign)', () => {
    const wikitext = `{{Information
|description=
|date=2025-01-01
}}`;
    const result = checkNoDescription(wikitext, IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('error');
    expect(result?.code).toBe('no-description');
    expect(result?.imageId).toBe(IMAGE_ID);
  });

  it('returns an error when the description is whitespace only', () => {
    const wikitext = `{{Information
|description=   
|date=2025-01-01
}}`;
    const result = checkNoDescription(wikitext, IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('error');
    expect(result?.code).toBe('no-description');
  });

  it('returns an error when the description contains the bare missing placeholder', () => {
    const result = checkNoDescription('|description=<<<missing>>>', IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('error');
    expect(result?.code).toBe('no-description');
  });

  it('returns an error when the placeholder is wrapped in {{en|1=...}}', () => {
    const wikitext = `{{Information
|description={{en|1=<<<missing>>>}}
|date=2025-01-01
}}`;
    const result = checkNoDescription(wikitext, IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('error');
    expect(result?.code).toBe('no-description');
  });

  it('returns an error when the placeholder appears alongside other text', () => {
    // e.g. a partially-resolved template left the placeholder inline
    const result = checkNoDescription('|description=Photo of <<<missing>>>', IMAGE_ID);
    expect(result).not.toBeNull();
    expect(result?.code).toBe('no-description');
  });

  // ── imageId propagation ─────────────────────────────────────────────────────

  it('includes the correct imageId in the returned issue', () => {
    const result = checkNoDescription('{{Information}}', 'unique-img-42');
    expect(result?.imageId).toBe('unique-img-42');
  });

  // ── Case-insensitivity of the field name ────────────────────────────────────

  it('matches a capitalised |Description= field name', () => {
    expect(checkNoDescription('|Description=Some text', IMAGE_ID)).toBeNull();
  });

  it('returns an error for an empty capitalised |Description= field', () => {
    const result = checkNoDescription('|Description=', IMAGE_ID);
    expect(result?.code).toBe('no-description');
  });
});
