import { events } from '@dropins/tools/event-bus.js';
import { getMetadata, decorateBlocks, loadBlock } from '../../scripts/aem.js';
import {
  checkIsAuthenticated,
  rootLink,
  localizedFragmentPath,
} from '../../scripts/commerce.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * Renders mobile links block in footer
 * @param {Element} container The footer container element
 */
function renderMobileLinks(container) {
  const mobileLinks = document.createElement('ul');
  mobileLinks.className = 'mobile-links';

  const updateLinks = () => {
    const isAuthenticated = checkIsAuthenticated();

    const authLink = isAuthenticated
      ? `<li class="link send-requisition">
          <a class="icon-requisition-list" href="${rootLink('/#/')}">
            <span>My Requisition Lists</span>
          </a>
        </li>`
      : `<li class="link authorization-link">
          <a class="icon-user-fill" href="${rootLink('/customer/account/login/')}">
            <span>Sign In</span>
          </a>
        </li>`;

    mobileLinks.innerHTML = `
      ${authLink}
      <li class="link track-order-link">
        <a class="icon-delivery-cart" href="${rootLink('/#/')}">
          <span>Track Your Order</span>
        </a>
      </li>
      <li class="link compare">
        <a class="icon-compare-light" href="${rootLink('/compare')}">
          <span>Compare Products</span>
        </a>
      </li>
      <li class="link call">
        <a class="icon-call2" href="${rootLink('/contact-us/')}">
          <span>Call</span>
        </a>
      </li>
    `;
  };

  updateLinks();
  events.on('authenticated', updateLinks);

  container.append(mobileLinks);
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  const footerMeta = getMetadata('footer');

  // Resolve the localized footer fragment (e.g. "/fr/footer" on French pages).
  // loadFragment() already prefixes the configured root path, so the fallback
  // path is expressed relative to it to avoid double-prefixing.
  const footerPath = footerMeta
    ? new URL(footerMeta, window.location).pathname
    : localizedFragmentPath('/footer');

  let fragment = await loadFragment(footerPath);

  // Fall back to the master /footer when the localized fragment is missing.
  // loadFragment() resolves to a <main> element, so check its own children:
  // querySelector('main') always returns null here and would silently discard
  // the localized fragment, forcing the default (English) footer.
  if (!fragment || fragment.children.length === 0) {
    fragment = await loadFragment('/footer');
  }

  block.textContent = '';
  const footer = document.createElement('div');
  footer.className = 'footer-content-wrapper';

  if (fragment && fragment.children.length > 0) {
    // 1. Decorate block CSS classes inside the fragment tree
    decorateBlocks(fragment);

    // 2. Append elements into footer DOM
    while (fragment.firstElementChild) {
      footer.append(fragment.firstElementChild);
    }

    // 3. Find nested store-switcher blocks and explicitly trigger loadBlock
    const switcherBlocks = footer.querySelectorAll('.store-switcher');
    await Promise.all([...switcherBlocks].map((switcherBlock) => loadBlock(switcherBlock)));
  }
  block.append(footer);
  renderMobileLinks(block);
}
