// provider UI not required here
import { readBlockConfig } from '../../scripts/aem.js';
import { getGlobalBreadcrumbsContainer, renderBreadcrumbs } from '../../scripts/breadcrumbs.js';
import { fetchPlaceholders } from '../../scripts/commerce.js';

/**
 * Safely renders breadcrumbs without breaking the block execution if an error occurs.
 */
function safeRenderBreadcrumbs(container, categoryData, labels) {
  try {
    if (typeof renderBreadcrumbs === 'function' && container) {
      renderBreadcrumbs(container, categoryData, labels);
    }
  } catch (error) {
    console.error('Breadcrumb rendering failed in commerce-account-header:', error);
  }
}

export default async function decorate(block) {
  const {
    title = 'My account',
  } = readBlockConfig(block);

  block.innerHTML = '';

  const placeholders = await fetchPlaceholders();
  const accountBreadcrumbsData = {
    name: title,
    breadcrumbs: [],
  };

  const globalBreadcrumbsContainer = getGlobalBreadcrumbsContainer();
  safeRenderBreadcrumbs(globalBreadcrumbsContainer, accountBreadcrumbsData, placeholders);

  const headerContainer = document.createElement('h1');
  headerContainer.classList.add('commerce-header-title');
  headerContainer.textContent = title;
  block.appendChild(headerContainer);

  return block;
}
