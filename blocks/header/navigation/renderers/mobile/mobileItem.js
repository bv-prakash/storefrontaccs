import {
  createElement,
} from '../../utils.js';

/**
 * Render a single mobile navigation item matching unified tree definitions.
 * @param {Object} item - Clean node object containing item properties
 * @returns {HTMLLIElement}
 */
export function renderMobileItem(item) {
  const listItem = createElement('li', 'mobile-nav__item');

  // Safely assign trace keys from our unified map array definition
  const randId = Math.random().toString(36).substr(2, 5);
  listItem.dataset.id = item.id || `nav-${randId}`;
  listItem.className = 'mobile-nav__item';

  // Check if children exist using the updated JSON key naming conventions
  const hasSubCategories = item.children && item.children.length > 0;

  if (hasSubCategories) {
    // If the category contains sub-children, render a structural trigger
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-nav__trigger';
    button.textContent = item.name;

    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `submenu-${listItem.dataset.id}`);

    // If it has a true link attached alongside children, cache it to data
    if (item.url_path && item.url_path !== '#') {
      const isAbsolute = item.url_path.startsWith('/')
        || item.url_path.startsWith('http');

      button.dataset.href = isAbsolute
        ? item.url_path
        : `/products/${item.url_path}`;
    }

    listItem.append(button);
    return listItem;
  }

  // Otherwise, construct a clean redirect hyperlink for leaf nodes
  const link = document.createElement('a');
  link.className = 'mobile-nav__link';
  link.textContent = item.name;

  let targetUrl = item.url_path || '#';
  const isAbsoluteUrl = targetUrl.startsWith('/')
    || targetUrl.startsWith('http');

  if (!item.isCustom && !isAbsoluteUrl) {
    targetUrl = `/products/${targetUrl}`;
  }
  if (targetUrl.endsWith('/all') || targetUrl === '/products/all') {
    targetUrl = '#';
  }

  link.href = targetUrl;
  listItem.append(link);

  return listItem;
}
