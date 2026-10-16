/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 */

import { getRootPath } from '@dropins/tools/lib/aem/configs.js';
import { decorateMain } from '../../scripts/scripts.js';
import { resetMediaBasePaths } from '../../scripts/commerce.js';
import {
  loadSections,
} from '../../scripts/aem.js';

/**
 * Loads a fragment.
 * @param {string} path The path to the fragment
 * @returns {Promise<HTMLElement>} The root element of the fragment
 */
export async function loadFragment(path) {
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    const root = getRootPath().replace(/\/$/, '');
    const url = `${root}${path}.plain.html`;
    const resp = await fetch(url);
    if (resp.ok) {
      const main = document.createElement('main');
      main.innerHTML = await resp.text();

      resetMediaBasePaths(main, path);

      decorateMain(main);
      await loadSections(main);
      return main;
    }
  }
  return null;
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  const fragment = await loadFragment(path);
  if (fragment) block.replaceChildren(...fragment.childNodes);
}
