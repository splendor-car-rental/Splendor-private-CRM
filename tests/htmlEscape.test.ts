import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/server/htmlEscape';

describe('escapeHtml', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'quoted'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;'
    );
  });

  it('handles nullish values deterministically', () => {
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(123.45)).toBe('123.45');
  });
});
