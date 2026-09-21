import { provider as UI, Button } from '@dropins/tools/components.js';
import { getRootPath } from '@dropins/tools/lib/aem/configs.js';
import {
  getLocaleRootPath,
  localizedFragmentPath,
  resetMediaBasePaths,
} from '../../scripts/commerce.js';
import { decorateIcons } from '../../scripts/aem.js';
import createModal from '../modal/modal.js';

/**
 * Fetches one store-switcher fragment candidate as a decorated DOM tree.
 * @param {string} path Root-relative fragment path
 * @returns {Promise<HTMLElement|null>} The fragment root, or null if missing
 */
async function fetchStoreSwitcherFragment(path) {
  const resp = await fetch(`${path}.plain.html`);
  if (!resp.ok) return null;

  const main = document.createElement('main');
  main.innerHTML = await resp.text();

  resetMediaBasePaths(main, path);

  await decorateIcons(main);
  return main;
}

/**
 * Loads the store-switcher fragment WITHOUT running the full `decorateMain()`
 * pipeline. `loadFragment()` calls `decorateLinks()`, which localizes every
 * same-origin link to the ACTIVE store root — it rewrites the other store's
 * bare locale-root link (e.g. `href="/"` viewed on a `/fr` page) to `/fr`,
 * so every option in the switcher would navigate to the same URL. The fragment
 * only contains a heading and a list of store links, so fetching the plain
 * HTML directly (plus icon decoration) is sufficient and preserves the
 * authored hrefs.
 * @returns {Promise<HTMLElement|null>} The fragment root, or null if missing
 */
async function loadStoreSwitcherFragment() {
  const root = getRootPath().replace(/\/$/, '');
  const localizedPath = localizedFragmentPath('/store-switcher');
  const paths = [...new Set([`${root}${localizedPath}`, `${root}/store-switcher`])];

  const candidates = await Promise.all(paths.map(fetchStoreSwitcherFragment));
  return candidates.find((fragment) => fragment && fragment.children.length > 0) || null;
}

function toggleStoreDropdown(sections) {
  sections.querySelectorAll('.storeview-multiple-stores')
    .forEach((section) => section.setAttribute('aria-expanded', 'false'));
}

/**
 * Modifies store-view links inside the modal container so that switching
 * locales keeps the shopper on the same content page instead of redirecting
 * to the locale root.
 *
 * Store-view links typically point to locale roots (e.g. "/", "/fr", "/de"),
 * so we append the current page path (the segment after the locale prefix)
 * to preserve the page the visitor was viewing.
 *
 * @param {HTMLElement} container The modal container with store-view links
 */
function localizeStoreLinks(container) {
  const currentPath = window.location.pathname;
  const localeRoot = getLocaleRootPath();
  const currentPagePath = localeRoot
    ? (currentPath.slice(localeRoot.length) || '/')
    : currentPath;

  const isLocaleRoot = (pathname) => {
    if (pathname === '/') return true;
    const normalized = pathname.replace(/\/$/, '');
    return /^\/[a-z]{2}(-[a-z]{2})?$/i.test(normalized);
  };

  container.querySelectorAll('a').forEach((a) => {
    // Cache the original href on first encounter so repeated modal openings
    // always re-derive from the fragment value (not a previously rewritten URL).
    if (!a.dataset.originalHref) {
      a.dataset.originalHref = a.href;
    }
    const { originalHref } = a.dataset;

    try {
      const url = new URL(originalHref, window.location.origin);
      // Only modify same-origin links
      if (url.origin !== window.location.origin) return;
      // Only modify links that are bare locale roots (e.g. "/", "/fr", "/de")
      if (isLocaleRoot(url.pathname)) {
        const basePath = url.pathname.replace(/\/$/, '');
        url.pathname = `${basePath}${currentPagePath}`.replace(/\/{2,}/g, '/') || '/';
        a.href = url.toString();
      }
    } catch {
      // ignore invalid URLs
    }
  });
}

export default async function decorate(block) {
  // Guard against double-decoration: loadSection() and the footer fragment
  // both call loadBlock(), so this would run twice and the second pass would
  // wipe the rendered button (fragment is already moved into the modal).
  if (block.dataset.storeSwitcherDecorated === 'true') return;
  block.dataset.storeSwitcherDecorated = 'true';

  // 1. Load the localized fragment (e.g. /fr/store-switcher) and fall back to
  // the master /store-switcher. Bypasses loadFragment()/decorateMain() so the
  // authored cross-store hrefs are not localized to the active store root.
  const fragmentStoreView = await loadStoreSwitcherFragment();

  // 3. Extract contents directly using querySelector to handle plain HTML structures safely
  const fragmentContainer = fragmentStoreView;

  // Guard against empty content
  if (!fragmentContainer || !fragmentContainer.children.length) {
    console.warn('[Store Switcher] Fragment returned 200 OK but contains no inner child nodes.');
    return;
  }

  // Clear placeholder block content
  block.textContent = '';

  const switcherButtonContainer = document.createElement('div');
  switcherButtonContainer.className = 'storeview-switcher-wrapper';
  block.append(switcherButtonContainer);

  const storeModalContainer = document.createElement('div');
  storeModalContainer.id = 'storeview-modal';

  // Read the active locale link text (e.g. "Canada (French)" on /fr pages)
  const localeRoot = getLocaleRootPath();
  const currentActiveLink = [...fragmentContainer.querySelectorAll('a')].find((a) => {
    try {
      const url = new URL(a.href, window.location.origin);
      if (localeRoot === '') return url.pathname === '/';
      return url.pathname === localeRoot || url.pathname.startsWith(`${localeRoot}/`);
    } catch (e) {
      return false;
    }
  });

  // Append fragment child nodes into modal container
  while (fragmentContainer.firstElementChild) {
    storeModalContainer.append(fragmentContainer.firstElementChild);
  }

  // Decorate structure classes
  const classes = ['storeview-title', 'storeview-list'];
  classes.forEach((className, index) => {
    const targetSection = storeModalContainer.children[index];
    if (targetSection) targetSection.classList.add(`storeview-modal-${className}`);
  });

  const storeViewTitle = storeModalContainer.querySelector('.storeview-modal-storeview-title');
  const modalHeading = storeViewTitle?.querySelector('h3');
  if (modalHeading) {
    modalHeading.className = 'storeview-modal-heading';
    modalHeading.setAttribute('tabindex', '0');
  }

  const storeViewList = storeModalContainer.querySelector('.storeview-modal-storeview-list');
  if (storeViewList && storeViewList.children.length) {
    storeViewList.querySelectorAll(':scope .default-content-wrapper > ul').forEach((ulElement) => {
      if (ulElement.querySelector('ul')) ulElement.classList.add('storeview-selection-grid');
    });

    storeViewList.querySelectorAll('.default-content-wrapper > ul > li > ul').forEach((subUlElement) => {
      const parentLi = subUlElement.closest('li');

      if (subUlElement.children.length > 1) {
        subUlElement.classList.add('storeviews-dropdown');
        parentLi.classList.add('storeview-multiple-stores');
        parentLi.setAttribute('tabindex', '0');
        parentLi.setAttribute('aria-expanded', 'false');

        const triggerToggle = (event) => {
          event.stopPropagation();
          const isCurrentlyExpanded = parentLi.getAttribute('aria-expanded') === 'true';
          toggleStoreDropdown(storeViewList);
          parentLi.setAttribute('aria-expanded', isCurrentlyExpanded ? 'false' : 'true');
        };

        parentLi.addEventListener('click', triggerToggle);
        parentLi.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            triggerToggle(event);
          }
        });
      } else {
        parentLi.classList.add('storeview-single-store');
        const rootUl = parentLi.closest('ul');
        const uniqueChildLi = subUlElement.firstElementChild;
        if (uniqueChildLi) {
          uniqueChildLi.className = 'storeview-single-store-item';
          rootUl.replaceChild(uniqueChildLi, parentLi);
        }
      }
    });
  }

  // Render the trigger button even if list decoration found no nodes, so the
  // button is never silently hidden. Prefer the Drop-in Button, with a native
  // <button> fallback if the Drop-in component fails to mount.
  const buttonLabel = currentActiveLink ? `${currentActiveLink.text}` : 'Select Store';
  const openStoresModal = async () => {
    // Rewrite store-view links to preserve the current page path so
    // switching locales keeps the shopper on the same content page.
    localizeStoreLinks(storeModalContainer);
    const modalInstance = await createModal([storeModalContainer]);
    modalInstance.showModal();
  };

  const fallbackButton = document.createElement('button');
  fallbackButton.type = 'button';
  fallbackButton.className = 'storeview-trigger-btn';
  fallbackButton.setAttribute('data-testid', 'storeview-switcher-button');
  fallbackButton.textContent = buttonLabel;
  fallbackButton.addEventListener('click', openStoresModal);
  switcherButtonContainer.append(fallbackButton);

  try {
    await UI.render(Button, {
      children: buttonLabel,
      'data-testid': 'storeview-switcher-button',
      className: 'storeview-trigger-btn',
      size: 'medium',
      variant: 'tertiary',
      onClick: openStoresModal,
    })(switcherButtonContainer);
    fallbackButton.remove();
  } catch (e) {
    console.warn('[Store Switcher] Drop-in Button failed, using native button fallback.', e);
  }
}
