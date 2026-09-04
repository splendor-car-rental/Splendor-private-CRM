/**
 * Sidebar/scroll regression guard (Issue #55)
 * ==========================================================================
 *
 * The real, confirmed root cause of the sidebar losing its sticky pinning
 * during page scroll (on every viewport size, not just short/mobile ones):
 * `src/premium-sapphire.css`'s global `html, body, #root { overflow-x: ... }`
 * rule. Any non-`visible` value there (`hidden`, `scroll`, `auto`) turns
 * that element into a CSS scroll container, which changes what "nearest
 * scrolling ancestor" a descendant's `position: sticky` resolves against --
 * confirmed directly by rendering the app's own compiled CSS in a real
 * browser: with `overflow-x: hidden`, the sidebar's sticky header/nav/footer
 * scrolled away with the page instead of staying pinned; with
 * `overflow-x: clip` (which still fully prevents horizontal overflow --
 * also verified directly), the sidebar stays correctly pinned.
 *
 * This rule lives in a plain CSS file with no compiler to catch a
 * regression, so this test reads the source file directly and fails loudly
 * if `overflow-x: hidden` (or `scroll`/`auto`) is ever reintroduced on
 * html/body/#root -- the one CSS change in this codebase capable of
 * silently breaking every sticky-positioned element in the entire app at
 * once.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CSS_PATH = new URL('../src/premium-sapphire.css', import.meta.url);

describe('html/body/#root must never re-acquire a scroll-container overflow-x value', () => {
  it('src/premium-sapphire.css keeps overflow-x: clip (never hidden/scroll/auto) on html, body, #root', () => {
    const css = readFileSync(CSS_PATH, 'utf8');

    // Isolate the exact selector block this guard cares about -- a global
    // grep for "overflow-x" would also flag unrelated, legitimate rules
    // elsewhere in the file (e.g. .overflow-x-auto's scrollable-table rule).
    const ruleMatch = css.match(/html\s*,\s*body\s*,\s*#root\s*\{([^}]*)\}/);
    expect(ruleMatch, 'Expected an "html, body, #root { ... }" rule in premium-sapphire.css').toBeTruthy();

    const ruleBody = ruleMatch![1];
    const overflowXMatch = ruleBody.match(/overflow-x\s*:\s*([a-z]+)/i);
    expect(overflowXMatch, 'Expected an overflow-x declaration inside the html/body/#root rule').toBeTruthy();

    const value = overflowXMatch![1].toLowerCase();
    // "clip" and "visible" never establish a scroll container; "hidden",
    // "scroll", and "auto" all do, and any of them here breaks every
    // position:sticky element in the app the same way "hidden" did.
    expect(['clip', 'visible']).toContain(value);
  });
});
