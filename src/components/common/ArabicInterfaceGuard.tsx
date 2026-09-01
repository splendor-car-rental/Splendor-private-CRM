import React, { useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { translateArabicUiText, type ArabicTranslationMode } from '../../i18n/arabicInterface';

type TextTranslationState = {
  original: string;
  translated: string;
};

type AttributeTranslationState = {
  original: string;
  translated: string;
};

const SKIP_SELECTOR = [
  'script',
  'style',
  'code',
  'pre',
  'textarea',
  '.a4-document',
  '[data-preserve-document-language]',
  '[data-arabic-keep]',
  '[data-no-translate]',
].join(',');

const AGGRESSIVE_SELECTOR = [
  '[data-arabic-ui="aggressive"]',
  'button',
  'label',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'nav',
  'aside',
  'summary',
  'option',
  '[role="button"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="alert"]',
  '[role="status"]',
].join(',');

const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'] as const;

function shouldSkip(element: Element | null): boolean {
  return Boolean(element?.closest(SKIP_SELECTOR));
}

function modeFor(element: Element | null): ArabicTranslationMode {
  return element?.closest(AGGRESSIVE_SELECTOR) ? 'aggressive' : 'safe';
}

/**
 * Final Arabic-mode safety net for legacy/internal screens.
 *
 * The application already has a normal i18n dictionary, but several mature
 * modules contain older hard-coded bilingual labels. Rewriting all runtime data
 * is unsafe because supplier names, customer names and vehicle models can be
 * legitimately English. This guard therefore translates UI chrome aggressively
 * and normal content conservatively, while never touching approved printable
 * documents (.a4-document) or explicitly preserved content.
 */
export const ArabicInterfaceGuard: React.FC = () => {
  const { language } = useLanguage();
  const textStatesRef = useRef(new Map<Text, TextTranslationState>());
  const attributeStatesRef = useRef(new Map<Element, Map<string, AttributeTranslationState>>());

  useEffect(() => {
    const textStates = textStatesRef.current;
    const attributeStates = attributeStatesRef.current;

    const restoreAll = () => {
      for (const [node, state] of textStates) {
        if (node.isConnected && node.data === state.translated) node.data = state.original;
      }
      textStates.clear();

      for (const [element, states] of attributeStates) {
        if (!element.isConnected) continue;
        for (const [attribute, state] of states) {
          if (element.getAttribute(attribute) === state.translated) {
            element.setAttribute(attribute, state.original);
          }
        }
      }
      attributeStates.clear();
    };

    if (language !== 'ar') {
      restoreAll();
      return undefined;
    }

    const translateTextNode = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || shouldSkip(parent)) return;

      const current = node.data;
      if (!current.trim()) return;

      const previous = textStates.get(node);
      let original = current;
      if (previous) {
        if (current === previous.translated) return;
        // React or another runtime update changed the node while Arabic mode is
        // active. Treat the new value as the new source instead of restoring stale copy.
        original = current;
      }

      const translated = translateArabicUiText(original, modeFor(parent));
      if (translated === original) {
        textStates.delete(node);
        return;
      }

      textStates.set(node, { original, translated });
      node.data = translated;
    };

    const translateElementAttributes = (element: Element) => {
      if (shouldSkip(element)) return;

      let states = attributeStates.get(element);
      for (const attribute of TRANSLATABLE_ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        if (!current?.trim()) continue;

        const previous = states?.get(attribute);
        if (previous && current === previous.translated) continue;

        const original = current;
        const translated = translateArabicUiText(original, 'aggressive');
        if (translated === original) {
          states?.delete(attribute);
          continue;
        }

        if (!states) {
          states = new Map();
          attributeStates.set(element, states);
        }
        states.set(attribute, { original, translated });
        element.setAttribute(attribute, translated);
      }
    };

    const processSubtree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;

      if (root.nodeType === Node.ELEMENT_NODE) {
        const element = root as Element;
        if (shouldSkip(element)) return;
        translateElementAttributes(element);
      }

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        if (current.nodeType === Node.ELEMENT_NODE) {
          const element = current as Element;
          if (!shouldSkip(element)) translateElementAttributes(element);
        } else if (current.nodeType === Node.TEXT_NODE) {
          translateTextNode(current as Text);
        }
        current = walker.nextNode();
      }
    };

    processSubtree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          processSubtree(mutation.target);
          continue;
        }
        if (mutation.type === 'attributes') {
          if (mutation.target instanceof Element) translateElementAttributes(mutation.target);
          continue;
        }
        for (const node of mutation.addedNodes) processSubtree(node);
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
    });

    return () => {
      observer.disconnect();
      restoreAll();
    };
  }, [language]);

  return null;
};
