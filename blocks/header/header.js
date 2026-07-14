// Drop-in Tools
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { fetchPlaceholders, getProductLink, rootLink } from '../../scripts/commerce.js';

import renderAuthCombine from './renderAuthCombine.js';
import { renderAuthDropdown } from './renderAuthDropdown.js';
import renderSellerAssistedBuyingBanner from './renderSellerAssistedBuyingBanner.js';

const isDesktop = window.matchMedia('(min-width: 900px)');
const labels = await fetchPlaceholders();

const overlay = document.createElement('div');
overlay.classList.add('overlay');
document.querySelector('header').insertAdjacentElement('afterbegin', overlay);

function toggleAllNavSections(sections, expanded = false) {
  if (!sections) return;
  sections
    .querySelectorAll('.nav-sections .default-content-wrapper > ul > li')
    .forEach((section) => {
      section.setAttribute('aria-expanded', expanded);
    });
}

function toggleMenu(nav, navSections, forceExpanded = null) {
  const expanded = forceExpanded !== null ? !forceExpanded : nav.getAttribute('aria-expanded') === 'true';
  const button = nav.querySelector('.nav-hamburger button');
  if (button) {
    button.setAttribute('aria-label', expanded ? 'Open navigation' : 'Close navigation');
  }
  document.body.style.overflowY = expanded || isDesktop.matches ? '' : 'hidden';
  nav.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  toggleAllNavSections(navSections, expanded || isDesktop.matches ? 'false' : 'true');
}

/**
 * Loads and decorates the header framework layers shell
 * @param {Element} block The header block element context window node placement
 */
export default async function decorate(block) {
  const sellerAssistedBuyingBanner = await renderSellerAssistedBuyingBanner();
  if (sellerAssistedBuyingBanner && !document.querySelector('.seller-assisted-buying-banner')) {
    document.body.insertAdjacentElement('afterbegin', sellerAssistedBuyingBanner);
  }

  // Load nav fragment document sheets natively
  const navMeta = getMetadata('nav');
  const navPath = navMeta ? new URL(navMeta, window.location).pathname : '/nav';
  const fragment = await loadFragment(navPath);

  block.textContent = '';
  const nav = document.createElement('nav');
  nav.id = 'nav';
  while (fragment.firstElementChild) nav.append(fragment.firstElementChild);

  // Map functional segment locations across AEM container classes
  const classes = ['brand', 'sections', 'tools'];
  classes.forEach((c, i) => {
    const section = nav.children[i];
    if (section) section.classList.add(`nav-${c}`);
  });

  const navBrand = nav.querySelector('.nav-brand');
  const brandLink = navBrand?.querySelector('.button');
  if (brandLink) {
    brandLink.className = '';
    brandLink.closest('.button-container').className = '';
  }

  const navSections = nav.querySelector('.nav-sections');
  
  // -------------------------------------------------------------------------
  // 🔥 DEFENSIVE SELECTION: Guarantees navTools exists to prevent null exceptions
  // -------------------------------------------------------------------------
  let navTools = nav.querySelector('.nav-tools');
  if (!navTools) {
    navTools = nav.children[2] || nav.querySelector('.default-content-wrapper > p:last-child')?.closest('div');
    if (navTools) {
      navTools.classList.add('nav-tools');
    } else {
      navTools = document.createElement('div');
      navTools.className = 'nav-tools';
      nav.appendChild(navTools);
    }
  }
  // -------------------------------------------------------------------------

  /** Wishlist panel block structure setup initialization logic loops */
  const wishlist = document.createRange().createContextualFragment(`
     <div class="wishlist-wrapper nav-tools-wrapper">
       <button type="button" class="nav-wishlist-button" aria-label="Wishlist"></button>
       <div class="wishlist-panel nav-tools-panel"></div>
     </div>
   `);
  navTools.append(wishlist);

  const wishlistButton = navTools.querySelector('.nav-wishlist-button');
  const wishlistMeta = getMetadata('wishlist');
  const wishlistPath = wishlistMeta ? new URL(wishlistMeta, window.location).pathname : '/wishlist';

  wishlistButton.addEventListener('click', () => {
    window.location.href = rootLink(wishlistPath);
  });

  /** Mini Cart implementation sequence rules checking filters */
  const excludeMiniCartFromPaths = ['/checkout'];
  const minicart = document.createRange().createContextualFragment(`
     <div class="minicart-wrapper nav-tools-wrapper">
       <button type="button" class="nav-cart-button" aria-label="Cart"></button>
       <div class="minicart-panel nav-tools-panel"></div>
     </div>
   `);
  navTools.append(minicart);

  const minicartPanel = navTools.querySelector('.minicart-panel');
  const cartButton = navTools.querySelector('.nav-cart-button');

  if (excludeMiniCartFromPaths.includes(window.location.pathname)) {
    cartButton.style.display = 'none';
  }

  async function withLoadingState(panel, button, loader) {
    if (panel.dataset.loaded === 'true' || panel.dataset.loading === 'true') return;
    button.setAttribute('aria-busy', 'true');
    panel.dataset.loading = 'true';
    try {
      await loader();
      panel.dataset.loaded = 'true';
    } finally {
      panel.dataset.loading = 'false';
      button.removeAttribute('aria-busy');
    }
  }

  async function loadMiniCartFragment() {
    await withLoadingState(minicartPanel, cartButton, async () => {
      const miniCartMeta = getMetadata('mini-cart');
      const miniCartPath = miniCartMeta ? new URL(miniCartMeta, window.location).pathname : '/mini-cart';
      const miniCartFragment = await loadFragment(miniCartPath);
      minicartPanel.append(miniCartFragment.firstElementChild);
    });
  }

  async function toggleMiniCart(state) {
    if (state) {
      await loadMiniCartFragment();
      const { publishShoppingCartViewEvent } = await import('@dropins/storefront-cart/api.js');
      publishShoppingCartViewEvent();
    }
    const show = state ?? !minicartPanel.classList.contains('nav-tools-panel--show');
    minicartPanel.classList.toggle('nav-tools-panel--show', show);
  }

  cartButton.addEventListener('click', () => toggleMiniCart(!minicartPanel.classList.contains('nav-tools-panel--show')));

  events.on('cart/data', (data) => {
    if (data) loadMiniCartFragment();
    if (data?.totalQuantity) {
      cartButton.setAttribute('data-count', data.totalQuantity);
    } else {
      cartButton.removeAttribute('data-count');
    }
  }, { eager: true });

  /** Dynamic Commerce Search Panel Generation */
  const searchFragment = document.createRange().createContextualFragment(`
  <div class="search-wrapper nav-tools-wrapper">
    <button type="button" class="nav-search-button">Search</button>
    <div class="nav-search-input nav-search-panel nav-tools-panel">
      <form id="search-bar-form"></form>
      <div class="search-bar-result" style="display: none;"></div>
    </div>
  </div>
  `);
  navTools.append(searchFragment);

  const searchPanel = navTools.querySelector('.nav-search-panel');
  const searchButton = navTools.querySelector('.nav-search-button');
  const searchForm = searchPanel.querySelector('#search-bar-form');
  const searchResult = searchPanel.querySelector('.search-bar-result');

  async function toggleSearch(state) {
    const pageSize = 4;
    if (state) {
      await withLoadingState(searchPanel, searchButton, async () => {
        await import('../../scripts/initializers/search.js');
        const [
          { search },
          { render },
          { SearchResults },
          { provider: UI, Input, Button },
        ] = await Promise.all([
          import('@dropins/storefront-product-discovery/api.js'),
          import('@dropins/storefront-product-discovery/render.js'),
          import('@dropins/storefront-product-discovery/containers/SearchResults.js'),
          import('@dropins/tools/components.js'),
          import('@dropins/tools/lib.js'),
        ]);

        render.render(SearchResults, {
          skeletonCount: pageSize,
          scope: 'popover',
          routeProduct: ({ urlKey, sku }) => getProductLink(urlKey, sku),
          onSearchResult: (results) => {
            searchResult.style.display = results.length > 0 ? 'block' : 'none';
          },
          slots: {
            ProductImage: (ctx) => {
              const { product, defaultImageProps } = ctx;
              const anchorWrapper = document.createElement('a');
              anchorWrapper.href = getProductLink(product.urlKey, product.sku);
              tryRenderAemAssetsImage(ctx, {
                alias: product.sku,
                imageProps: defaultImageProps,
                wrapper: anchorWrapper,
                params: { width: defaultImageProps.width, height: defaultImageProps.height },
              });
            },
            Footer: async (ctx) => {
              const viewAllResultsWrapper = document.createElement('div');
              const viewAllResultsButton = await UI.render(Button, {
                children: labels.Global?.SearchViewAll,
                variant: 'secondary',
                href: rootLink('/search'),
              })(viewAllResultsWrapper);
              ctx.appendChild(viewAllResultsWrapper);
              ctx.onChange((next) => {
                viewAllResultsButton?.setProps((prev) => ({
                  ...prev,
                  href: `${rootLink('/search')}?q=${encodeURIComponent(next.variables?.phrase || '')}`,
                }));
              });
            },
          },
        })(searchResult);

        UI.render(Input, {
          name: 'search',
          placeholder: labels.Global?.Search,
          onValue: (phrase) => {
            if (!phrase) { search(null, { scope: 'popover' }); return; }
            if (phrase.length < 3) return;
            search({
              phrase,
              pageSize,
              filter: [{ attribute: 'visibility', in: ['Search', 'Catalog, Search'] }],
            }, { scope: 'popover' });
          },
        })(searchForm);
      });
    }
    const show = state ?? !searchPanel.classList.contains('nav-tools-panel--show');
    searchPanel.classList.toggle('nav-tools-panel--show', show);
    if (show) searchForm?.querySelector('input')?.focus();
  }

  searchButton.addEventListener('click', () => toggleSearch(!searchPanel.classList.contains('nav-tools-panel--show')));

  document.addEventListener('click', (e) => {
    if (!minicartPanel.contains(e.target) && !cartButton.contains(e.target)) toggleMiniCart(false);
    if (!searchPanel.contains(e.target) && !searchButton.contains(e.target)) toggleSearch(false);
  });

  const navWrapper = document.createElement('div');
  navWrapper.className = 'nav-wrapper';
  navWrapper.append(nav);
  block.append(navWrapper);

  window.addEventListener('resize', () => {
    navWrapper.classList.remove('active');
    overlay.classList.remove('show');
    toggleMenu(nav, navSections, false);
  });

  const hamburger = document.createElement('div');
  hamburger.classList.add('nav-hamburger');
  hamburger.innerHTML = `<button type="button" aria-controls="nav" aria-label="Open navigation"><span class="nav-hamburger-icon"></span></button>`;
  hamburger.addEventListener('click', () => {
    navWrapper.classList.toggle('active');
    overlay.classList.toggle('show');
    toggleMenu(nav, navSections);
  });
  nav.prepend(hamburger);
  
  toggleMenu(nav, navSections, isDesktop.matches);
  isDesktop.addEventListener('change', () => toggleMenu(nav, navSections, isDesktop.matches));

  if (navSections) {
    renderAuthCombine(navSections, () => !isDesktop.matches && toggleMenu(nav, navSections, false));
  }
  renderAuthDropdown(navTools);
}