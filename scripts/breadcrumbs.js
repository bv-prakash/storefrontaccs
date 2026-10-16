import { getRootPath } from '@dropins/tools/lib/aem/configs.js';
import { fetchPlaceholders } from './commerce.js';

/**
 * Renders structured breadcrumbs into a target HTML container.
 *
 * @param {HTMLElement} container - The wrapper element where breadcrumbs will be rendered.
 * @param {Object} data - Breadcrumb configuration data.
 * @param {string} [data.name] - Current page/category title.
 * @param {Array<Object>} [data.breadcrumbs] - Array of parent links
 *   [{ category_name, category_url_path }].
 * @param {Object} [labels=globalLabels] - Dictionary containing localized strings
 *   (e.g., labels.Global.Breadcrums.Root.label). Defaults to the module-fetched
 *   global placeholders. All property lookups are optional-chained so a
 *   missing/empty labels object never throws and falls back to sensible
 *   English defaults.
 */

// Global placeholders, used as the default `labels` for callers that do not
// pass their own. fetchPlaceholders() returns the live merged object, so
// localized values fetched later are picked up automatically.
const globalLabels = await fetchPlaceholders('placeholders/global.json');
export function renderBreadcrumbs(container, data = {}, labels = globalLabels) {
  const targetContainer = container || document.querySelector('.breadcrumbs-container');
  if (!targetContainer) return;
  targetContainer.innerHTML = '';

  const nav = document.createElement('nav');
  nav.className = 'breadcrumbs';
  nav.setAttribute('aria-label', 'Breadcrumb');

  const ol = document.createElement('ol');
  ol.className = 'breadcrumbs-list';

  // 1. Home Link
  const homeLi = document.createElement('li');
  homeLi.className = 'breadcrumbs-item';
  const homeLink = document.createElement('a');
  homeLink.href = '/';
  homeLink.className = 'breadcrumbs-link';
  homeLink.textContent = labels?.Global?.Breadcrums?.Root?.label || 'Home';
  homeLi.appendChild(homeLink);
  ol.appendChild(homeLi);

  // 2. Ancestor/Parent Links
  if (Array.isArray(data.breadcrumbs)) {
    data.breadcrumbs.forEach((item) => {
      if (!item?.category_name) return;

      const li = document.createElement('li');
      li.className = 'breadcrumbs-item';

      const link = document.createElement('a');
      link.className = 'breadcrumbs-link';

      // Ensure clean path routing without double slashes
      const rawPath = item.category_url_path || '#';
      const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

      link.href = cleanPath;
      link.textContent = item.category_name;

      li.appendChild(link);
      ol.appendChild(li);
    });
  }

  // 3. Current Page / Active Category Item
  if (data.name) {
    const currentLi = document.createElement('li');
    currentLi.className = 'breadcrumbs-item breadcrumbs-item--current';
    currentLi.setAttribute('aria-current', 'page');

    const currentSpan = document.createElement('span');
    currentSpan.className = 'breadcrumbs-current-label';
    currentSpan.textContent = data.name;

    currentLi.appendChild(currentSpan);
    ol.appendChild(currentLi);
  }

  nav.appendChild(ol);
  targetContainer.appendChild(nav);
}

export function getGlobalBreadcrumbsContainer() {
  const rootPath = getRootPath().replace(/\/$/, '') || '/';
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  if (pathname === rootPath) return null;
  return document.querySelector('.breadcrumbs-container');
}
