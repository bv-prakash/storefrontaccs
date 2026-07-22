// Product Discovery Dropins
import SearchResults from '@dropins/storefront-product-discovery/containers/SearchResults.js';
import Facets from '@dropins/storefront-product-discovery/containers/Facets.js';
import SortBy from '@dropins/storefront-product-discovery/containers/SortBy.js';
import Pagination from '@dropins/storefront-product-discovery/containers/Pagination.js';
import { render as provider } from '@dropins/storefront-product-discovery/render.js';
import { Button, Icon, provider as UI } from '@dropins/tools/components.js';
import { search } from '@dropins/storefront-product-discovery/api.js';
// Wishlist Dropin
import { WishlistToggle } from '@dropins/storefront-wishlist/containers/WishlistToggle.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';
// Cart Dropin
import * as cartApi from '@dropins/storefront-cart/api.js';
import { isAemAssetsEnabled, isAemAssetsUrl, generateAemAssetsOptimizedUrl } from '@dropins/tools/lib/aem/assets.js';
// Event Bus
import { events } from '@dropins/tools/event-bus.js';
// AEM
import {
  fetchPlaceholders,
  getProductLink,
  getCategoryFromUrl,
  isCategoryPrerendered,
  isCategoryTemplate,
  IS_DA,
  IS_UE,
  CS_FETCH_GRAPHQL,
  CORE_FETCH_GRAPHQL,
  setJsonLd,
} from '../../scripts/commerce.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { getSearchStateFromUrl, applySearchStateToUrl } from './search-url.js';
import { renderBreadcrumbs } from './components/breadcrumbs.js';

// Initializers
import '../../scripts/initializers/search.js';
import '../../scripts/initializers/wishlist.js';

// Configuration Options
const FACET_OPTIONS = {
  defaultCollapsed: true, // Controls whether facets load collapsed by default
  categoriesFilterType: 'multi', // Configuration option for multi-select categories
};

/**
 * Fetches store config for PLP view modes and pagination count managed by admin.
 */
async function fetchStoreConfigPLP() {
  const query = `
    query StoreConfigPLP {
      storeConfig {
        grid_per_page
        grid_per_page_values
        list_mode
        list_per_page
        list_per_page_values
      }
    }
  `;
  try {
    const { data } = await CORE_FETCH_GRAPHQL.fetchGraphQl(query, {
      method: 'GET',
      cache: 'force-cache',
    });
    return data?.storeConfig || null;
  } catch (e) {
    console.warn('Failed to fetch storeConfig for PLP', e);
    return null;
  }
}

/**
 * Builds ItemList + BreadcrumbList JSON-LD from PLP search results
 */
function setCategoryJsonLd(payload, categoryPath) {
  const items = payload?.result?.items || [];
  if (!categoryPath || items.length === 0) return;

  const categoryMeta = getCategoryFromUrl();
  const categoryUrl = categoryMeta
    ? `${window.location.origin}/categories/${categoryMeta.urlPath}/${categoryMeta.cateId}`
    : window.location.href.split('?')[0];
  const categoryName = categoryPath.split('/').pop()?.replace(/-/g, ' ') || categoryPath;

  const itemListElement = items.slice(0, 8).map((product, index) => {
    const amount = product.priceRange?.minimum?.final?.amount || product.price?.final?.amount;
    let imageUrl = product.images?.[0]?.url || '';
    if (imageUrl.startsWith('//')) {
      imageUrl = `https:${imageUrl}`;
    }
    const productUrl = new URL(
      getProductLink(product.urlKey, product.sku),
      window.location.origin,
    ).href;

    return {
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: product.name,
        url: productUrl,
        image: imageUrl || undefined,
        offers: amount?.value != null ? {
          '@type': 'Offer',
          price: amount.value,
          priceCurrency: amount.currency || 'USD',
          availability: product.inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
        } : undefined,
      },
    };
  });

  setJsonLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        '@id': `${categoryUrl}#list`,
        name: categoryName,
        url: categoryUrl,
        numberOfItems: payload.result?.totalCount || items.length,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${window.location.origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: categoryName,
            item: categoryUrl,
          },
        ],
      },
    ],
  }, 'category-list');

  if (!isCategoryPrerendered() && !document.querySelector('meta[name="title"]')?.content) {
    document.title = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
  }
}

async function resolveUrlPathFromCategoryId(categoryId) {
  if (!categoryId) return null;

  const query = `
    query ResolveCategoryUrlPath($ids: [String!]!) {
      categories(ids: $ids, roles: ["active"]) {
        urlPath
      }
    }
  `;

  try {
    const { data } = await CS_FETCH_GRAPHQL.fetchGraphQl(query, {
      method: 'POST',
      variables: { ids: [categoryId] },
    });
    return data?.categories?.[0]?.urlPath || null;
  } catch (e) {
    console.warn('Failed to resolve category urlPath for template preview', e);
    return null;
  }
}

function getCategoryMetadataFromUrl(urlPath) {
  if (!urlPath) return null;
  const clean = urlPath.replace(/^\//, '').replace(/\/$/, '');
  const segments = clean.split('/');
  const name = segments[segments.length - 1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const breadcrumbs = segments.slice(0, -1).map((seg, i) => ({
    category_name: seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    category_url_path: `/categories/${segments.slice(0, i + 1).join('/')}`,
  }));

  return { name, breadcrumbs };
}

async function getCategoryMetadata(categoryId, urlPath) {
  if (!categoryId) return getCategoryMetadataFromUrl(urlPath);

  const CATEGORY_METADATA_QUERY = `
    query CategoryMetadata($ids: [String!]!) {
      categories(
        ids: $ids,
        roles: ["active"],
        subtree: { startLevel: 1, depth: 5 }
      ) {
        id
        name
        urlPath
        parentId
      }
    }
  `;

  try {
    const response = await CS_FETCH_GRAPHQL.fetchGraphQl(CATEGORY_METADATA_QUERY, {
      variables: { ids: [categoryId] },
    });

    const allCategories = response.data?.categories || [];
    const current = allCategories.find((c) => c.id === categoryId);

    if (!current) {
      return getCategoryMetadataFromUrl(urlPath);
    }

    const breadcrumbs = [];
    const visited = new Set();
    let pid = current.parentId;
    while (pid && !visited.has(pid)) {
      visited.add(pid);
      const ancestor = allCategories.find((c) => c.id === pid); // eslint-disable-line no-loop-func
      if (!ancestor) break;
      breadcrumbs.unshift({
        category_name: ancestor.name,
        category_url_path: `/categories/${ancestor.urlPath.replace(/^\//, '')}`,
      });
      pid = ancestor.parentId;
    }

    return { name: current.name, breadcrumbs };
  } catch (e) {
    console.warn('Failed to fetch category metadata via Catalog Service', e);
    return getCategoryMetadataFromUrl(urlPath);
  }
}

/**
 * Decorates rendered facets into collapsible accordions
 */
function initCollapsibleFacets($facets) {
  const processedGroups = new WeakSet();

  function makeFacetGroupCollapsible(group) {
    if (processedGroups.has(group)) return;

    const headerEl = group.querySelector('.product-discovery-facet__header');
    if (!headerEl) return;

    processedGroups.add(group);
    group.classList.add('plp-facet-group');

    headerEl.classList.add('plp-facet-toggle');
    headerEl.setAttribute('role', 'button');
    headerEl.setAttribute('tabindex', '0');

    if (FACET_OPTIONS.defaultCollapsed) {
      group.classList.add('plp-facet-group--collapsed');
      headerEl.setAttribute('aria-expanded', 'false');
    } else {
      headerEl.setAttribute('aria-expanded', 'true');
    }

    if (!headerEl.querySelector('.plp-facet-chevron')) {
      const chevron = document.createElement('span');
      chevron.className = 'plp-facet-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      headerEl.appendChild(chevron);
    }

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'plp-facet-content';
    let node = headerEl.nextElementSibling;
    while (node) {
      const next = node.nextElementSibling;
      contentWrapper.appendChild(node);
      node = next;
    }
    group.appendChild(contentWrapper);

    const toggle = () => {
      const collapsed = group.classList.toggle('plp-facet-group--collapsed');
      headerEl.setAttribute('aria-expanded', String(!collapsed));
    };

    headerEl.addEventListener('click', toggle);
    headerEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  }

  function decorateRenderedFacets() {
    $facets
      .querySelectorAll('.product-discovery-facet')
      .forEach(makeFacetGroupCollapsible);
  }

  decorateRenderedFacets();

  const observer = new MutationObserver(decorateRenderedFacets);
  observer.observe($facets, { childList: true, subtree: true });

  return observer;
}

/**
 * Renders the Applied Active Filter Chips widget dynamically below the filter toolbar
 */
function renderActiveFilterChips($container, activeFilters, onRemoveFilter, onResetAll) {
  $container.innerHTML = '';

  const userVisibleFilters = (activeFilters || []).filter(
    (f) => f.attribute !== 'visibility'
      && f.attribute !== 'category_uid'
      && f.attribute !== 'categoryPath',
  );

  if (userVisibleFilters.length === 0) {
    $container.style.display = 'none';
    return;
  }

  $container.style.display = 'block';

  // Section Header
  const header = document.createElement('div');
  header.className = 'plp-active-filters-header';

  const titleToggle = document.createElement('div');
  titleToggle.className = 'plp-active-filters-title-toggle';
  titleToggle.innerHTML = `
    <span class="plp-active-filters-title">FILTER OPTIONS (${userVisibleFilters.length})</span>
  `;

  const resetLink = document.createElement('button');
  resetLink.type = 'button';
  resetLink.className = 'plp-active-filters-reset';
  resetLink.textContent = 'Reset';

  // Prevent event bubbling to avoid expanding/collapsing header
  resetLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onResetAll();
  });

  header.appendChild(titleToggle);

  // Chips List Container
  const list = document.createElement('div');
  list.className = 'plp-active-filters-list';

  userVisibleFilters.forEach((filter) => {
    const attrName = filter.attribute.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    let filterValues = [];

    if (Array.isArray(filter.in)) {
      filterValues = filter.in;
    } else if (filter.eq) {
      filterValues = [filter.eq];
    } else if (filter.range) {
      filterValues = [`${filter.range.from || '0'} - ${filter.range.to || ''}`];
    }

    filterValues.forEach((val) => {
      const chip = document.createElement('div');
      chip.className = 'plp-active-filter-chip';
      chip.innerHTML = `
        <div class="plp-chip-contianer"><button type="button" class="plp-chip-remove" aria-label="Remove filter"><span></span></button>
        <span class="plp-chip-label">${attrName}:</span> <span class="plp-chip-valye">${val}</span></div>
      `;

      chip.querySelector('.plp-chip-remove').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemoveFilter(filter.attribute, val);
      });

      list.appendChild(chip);
    });
  });

  // Toggle Collapse on Header Click
  header.addEventListener('click', (e) => {
    if (e.target.classList.contains('plp-active-filters-reset')) return;
    $container.classList.toggle('is-collapsed');
  });

  $container.appendChild(header);
  $container.appendChild(list);
  $container.appendChild(resetLink);
}

export default async function decorate(block) {
  const labels = await fetchPlaceholders();
  const storeConfig = await fetchStoreConfigPLP();

  const config = readBlockConfig(block);
  const categoryMeta = getCategoryFromUrl();
  const hasPrerenderedMarkup = block.dataset.prerendered === 'true';
  const hasServerCategoryJsonLd = isCategoryPrerendered();

  // Admin Config options for view mode and page sizes
  const gridDefaultSize = storeConfig?.grid_per_page || 12;
  const gridAllowedValues = storeConfig?.grid_per_page_values
    ? storeConfig.grid_per_page_values.split(',').map((v) => parseInt(v.trim(), 10)).filter(Boolean)
    : [12, 24, 36];

  const listDefaultSize = storeConfig?.list_per_page || 10;
  const listAllowedValues = storeConfig?.list_per_page_values
    ? storeConfig.list_per_page_values.split(',').map((v) => parseInt(v.trim(), 10)).filter(Boolean)
    : [5, 10, 15, 20, 25];

  const listModeConfig = storeConfig?.list_mode || 'grid-list';
  const defaultMode = listModeConfig.startsWith('list') ? 'list' : 'grid';

  const urlParams = new URLSearchParams(window.location.search);
  let currentMode = urlParams.get('mode') || localStorage.getItem('plp_view_mode') || defaultMode;
  if (!['grid', 'list'].includes(currentMode)) {
    currentMode = defaultMode;
  }

  let allowedPageSizes = currentMode === 'list' ? listAllowedValues : gridAllowedValues;
  let defaultPageSize = currentMode === 'list' ? listDefaultSize : gridDefaultSize;

  const rawPageSize = urlParams.get('limit') || urlParams.get('pageSize') || config.pagesize;
  const urlPageSize = parseInt(rawPageSize, 10);
  let pageSize = (urlPageSize && allowedPageSizes.includes(urlPageSize))
    ? urlPageSize
    : defaultPageSize;

  const urlCategoryPath = categoryMeta?.urlPath
    || block.dataset.categoryUrlPath
    || getCategoryFromUrl()?.urlPath;
  if (urlCategoryPath) {
    config.urlpath = urlCategoryPath;
  } else if (!config.urlpath && config.defaultcateid && isCategoryTemplate() && (IS_UE || IS_DA)) {
    const resolvedPath = await resolveUrlPathFromCategoryId(config.defaultcateid);
    if (resolvedPath) {
      config.urlpath = resolvedPath;
    }
  }

  const fragment = document.createRange().createContextualFragment(`
    <div class="search__header">
     <h1 class="plp-title"></h1>
      <div class="plp-breadcrumbs-container"></div>
    </div>
    <div class="search__wrapper">
     <div class="column-main">
       <div class="plp-toolbar">
         <div class="plp-filter-trigger-wrapper">
           <div class="search__view-facets"></div>
         </div>
         <div class="plp-toolbar-controls">
           <div class="plp-view-mode-toggle" aria-label="View Mode Toggle">
             <button type="button" class="plp-view-btn plp-view-btn--grid" data-mode="grid" aria-label="Grid View" title="Grid View">
               <span class="plp-view-icon grid-icon"></span>
             </button>
             <button type="button" class="plp-view-btn plp-view-btn--list" data-mode="list" aria-label="List View" title="List View">
               <span class="plp-view-icon list-icon"></span>
             </button>
           </div>
           <div class="plp-page-size-selector">
             <label for="plp-page-size-select" class="plp-page-size-label">Show</label>
             <select id="plp-page-size-select" class="plp-page-size-select" aria-label="Products Per Page"></select>
           </div>
         </div>
         <div class="search__product-sort"></div>
       </div>

       <!-- Applied Active Filters Section -->
       <div class="plp-active-filters-widget"></div>

       <div class="search__product-list"></div>
       <div class="search__pagination"></div>
     </div>
     <div class="sidebar-main plp-filter-drawer">
        <div class="plp-drawer-header">
          <span class="plp-drawer-title">FILTER OPTIONS</span>
          <div class="plp-drawer-actions">
            <button type="button" class="plp-reset-filters-btn" style="display: none;">Reset All</button>
            <button type="button" class="plp-close-drawer-btn" aria-label="Close Filter Drawer">&times;</button>
          </div>
        </div>
        <div class="plp-drawer-body">
          <div class="search__facets"></div>
        </div>
     </div>
     <div class="plp-filter-overlay"></div>
    </div>
  `);

  const $breadcrumbsContainer = fragment.querySelector('.plp-breadcrumbs-container');
  const $plpTitle = fragment.querySelector('.plp-title');
  const $viewFacets = fragment.querySelector('.search__view-facets');
  const $facets = fragment.querySelector('.search__facets');
  const $productSort = fragment.querySelector('.search__product-sort');
  const $productList = fragment.querySelector('.search__product-list');
  const $pagination = fragment.querySelector('.search__pagination');
  const $searchWrapper = fragment.querySelector('.search__wrapper');
  const $pageSizeSelect = fragment.querySelector('#plp-page-size-select');
  const $drawer = fragment.querySelector('.plp-filter-drawer');
  const $overlay = fragment.querySelector('.plp-filter-overlay');
  const $closeBtn = fragment.querySelector('.plp-close-drawer-btn');
  const $resetBtn = fragment.querySelector('.plp-reset-filters-btn');
  const $activeFiltersWidget = fragment.querySelector('.plp-active-filters-widget');

  const fallbackNodes = hasPrerenderedMarkup ? [...block.childNodes] : [];

  if (hasPrerenderedMarkup) {
    $searchWrapper.hidden = true;
  } else {
    block.innerHTML = '';
  }
  block.appendChild(fragment);

  // Smooth Drawer Functions
  const openFilterDrawer = () => {
    $drawer.classList.add('is-open');
    $overlay.classList.add('is-visible');
    document.body.classList.add('plp-drawer-active');
  };

  const closeFilterDrawer = () => {
    $drawer.classList.remove('is-open');
    $overlay.classList.remove('is-visible');

    // Smooth transition delay before removing scroll lock
    setTimeout(() => {
      document.body.classList.remove('plp-drawer-active');
    }, 300);
  };

  $overlay.addEventListener('click', closeFilterDrawer);
  $closeBtn.addEventListener('click', closeFilterDrawer);

  const searchState = getSearchStateFromUrl(new URL(window.location.href));
  const visibilityFilter = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };
  let userFilters = searchState.filter.filter((f) => f.attribute !== 'visibility');

  const categoryId = categoryMeta?.cateId || block.dataset.categoryId
    || getCategoryFromUrl()?.cateId || config.defaultcateid;

  let searchSucceeded = true;
  const executeSearch = async (targetPage = searchState.currentPage) => {
    const categoryFilter = categoryId
      ? { attribute: 'category_uid', eq: categoryId }
      : { attribute: 'categoryPath', eq: config.urlpath };

    const filterList = (config.urlpath || categoryId)
      ? [categoryFilter, visibilityFilter, ...userFilters]
      : [visibilityFilter, ...userFilters];

    await search({
      phrase: (config.urlpath || categoryId) ? '' : searchState.phrase,
      currentPage: targetPage,
      pageSize,
      sort: searchState?.sort?.length ? searchState.sort : [{ attribute: 'position', direction: 'DESC' }],
      filter: filterList,
    }).catch((e) => {
      searchSucceeded = false;
      console.error('Error searching for products', e);
    });
  };

  // Global Reset All Handler
  const resetAllFilters = async () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('filter');
    window.history.pushState({}, '', url.toString());

    userFilters = [];
    searchState.filter = [];

    if (window.innerWidth < 1024) {
      closeFilterDrawer();
    }

    await executeSearch(1);
  };

  $resetBtn.addEventListener('click', resetAllFilters);

  // Apply View Mode
  const applyViewMode = (mode) => {
    currentMode = mode;
    localStorage.setItem('plp_view_mode', mode);
    block.classList.remove('product-list-page--mode-grid', 'product-list-page--mode-list');
    block.classList.add(`product-list-page--mode-${mode}`);

    block.querySelectorAll('.plp-view-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  };
  applyViewMode(currentMode);

  const updatePageSizeOptions = () => {
    allowedPageSizes = currentMode === 'list' ? listAllowedValues : gridAllowedValues;
    defaultPageSize = currentMode === 'list' ? listDefaultSize : gridDefaultSize;

    if (!allowedPageSizes.includes(pageSize)) {
      pageSize = defaultPageSize;
    }

    if ($pageSizeSelect) {
      $pageSizeSelect.innerHTML = '';
      allowedPageSizes.forEach((size) => {
        const option = document.createElement('option');
        option.value = size;
        option.textContent = size;
        if (size === pageSize) option.selected = true;
        $pageSizeSelect.appendChild(option);
      });
    }
  };
  updatePageSizeOptions();

  if (config.urlpath) {
    block.dataset.urlpath = config.urlpath;
  }
  if (categoryMeta?.cateId) {
    block.dataset.categoryId = categoryMeta.cateId;
  }

  if (config.urlpath || categoryId) {
    getCategoryMetadata(categoryId, config.urlpath).then((categoryData) => {
      if (categoryData) {
        $plpTitle.textContent = categoryData.name;
        renderBreadcrumbs($breadcrumbsContainer, categoryData, labels);
        if (!document.querySelector('meta[name="title"]')?.content) {
          document.title = categoryData.name;
        }
      }
    });
  }

  const normalizedUrl = new URL(window.location.href);
  applySearchStateToUrl(normalizedUrl, searchState);
  window.history.replaceState({}, '', normalizedUrl.toString());

  await executeSearch();

  // Mode Button Click Handlers
  block.querySelectorAll('.plp-view-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const newMode = btn.dataset.mode;
      if (newMode === currentMode) return;
      applyViewMode(newMode);
      const prevPageSize = pageSize;
      updatePageSizeOptions();

      if (pageSize !== prevPageSize) {
        await executeSearch(1);
      }
    });
  });

  if ($pageSizeSelect) {
    $pageSizeSelect.addEventListener('change', async (e) => {
      const newSize = parseInt(e.target.value, 10);
      if (newSize && newSize !== pageSize) {
        pageSize = newSize;
        await executeSearch(1);
      }
    });
  }

  const getAddToCartButton = (product) => {
    if (product.typename === 'ComplexProductView') {
      const button = document.createElement('div');
      UI.render(Button, {
        children: labels.Global?.AddProductToCart,
        icon: Icon({ source: 'Cart' }),
        href: getProductLink(product.urlKey, product.sku),
        variant: 'primary',
      })(button);
      return button;
    }
    const button = document.createElement('div');
    UI.render(Button, {
      children: labels.Global?.AddProductToCart,
      icon: Icon({ source: 'Cart' }),
      onClick: () => cartApi.addProductsToCart([{ sku: product.sku, quantity: 1 }]),
      variant: 'primary',
    })(button);
    return button;
  };

  /**
 * Observes the Drop-in's selected facets list:
 * 1. Checks if any active filter chips exist.
 * 2. Adds/removes 'is-empty' class and toggles display.
 * 3. Applies the 'reset' class and changes text to 'Reset'.
 */
  function observeSelectedFacets($container) {
    const observer = new MutationObserver(() => {
      const selectedFiltersList = $container.querySelector('.product-discovery-facet-list__selected-filters');
      if (!selectedFiltersList) return;

      // Count filter chips excluding the reset button
      const buttons = Array.from(selectedFiltersList.querySelectorAll('button'));
      const filterChips = buttons.filter(
        (btn) => !btn.textContent.trim().toLowerCase().includes('clear all') && !btn.classList.contains('reset'),
      );

      // If no active filter chips exist, add 'is-empty' and hide the container
      if (filterChips.length === 0) {
        selectedFiltersList.classList.add('is-empty');
        return;
      }

      // Otherwise, show the container and remove 'is-empty'
      selectedFiltersList.classList.remove('is-empty');

      // Enhance the Clear All / Reset button
      buttons.forEach((btn) => {
        const isClearAll = btn.textContent.trim().toLowerCase().includes('clear all') || btn.classList.contains('reset');

        if (isClearAll) {
          if (!btn.classList.contains('reset-all')) {
            btn.classList.add('reset-all');
          }

          // Update button text to "Reset"
          const textSpan = btn.querySelector('span');
          if (textSpan && textSpan.textContent.trim() === 'Clear All') {
            textSpan.textContent = 'Reset';
          } else if (btn.textContent.trim() === 'Clear All') {
            btn.textContent = 'Reset';
          }
        }
      });
    });

    observer.observe($container, { childList: true, subtree: true });
  }

  await Promise.all([
    provider.render(SortBy, {})($productSort),
    provider.render(Pagination, {
      onPageChange: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    })($pagination),
    UI.render(Button, {
      children: labels.Global?.Filters || 'Filters',
      icon: Icon({ source: 'Burger' }),
      variant: 'secondary',
      onClick: openFilterDrawer,
    })($viewFacets),
    provider.render(Facets, {
      categoriesFilterType: FACET_OPTIONS.categoriesFilterType,
    })($facets).then(() => {
      initCollapsibleFacets($facets);
      observeSelectedFacets($facets);
    }),
    provider.render(SearchResults, {
      routeProduct: (product) => getProductLink(product.urlKey, product.sku),
      slots: {
        ProductImage: (ctx) => {
          const { product, defaultImageProps } = ctx;
          const imgWidth = Number(defaultImageProps?.width) || 400;
          const imgHeight = Number(defaultImageProps?.height) || 450;

          const anchorWrapper = document.createElement('a');
          anchorWrapper.href = getProductLink(product.urlKey, product.sku);
          anchorWrapper.className = 'product-discovery-product-item__image-link';

          let imgSrc = defaultImageProps?.src || '';
          if (imgSrc && isAemAssetsEnabled() && isAemAssetsUrl(imgSrc)) {
            imgSrc = generateAemAssetsOptimizedUrl(imgSrc, product.sku, {
              width: imgWidth,
              height: imgHeight,
            });
          }

          const img = document.createElement('img');
          img.src = imgSrc;
          img.alt = defaultImageProps?.alt || product.name || '';
          img.width = imgWidth;
          img.height = imgHeight;
          img.loading = defaultImageProps?.loading || 'lazy';
          img.className = 'dropin-image product-discovery-product-item__image';
          anchorWrapper.appendChild(img);

          ctx.replaceWith(anchorWrapper);
        },
        ProductActions: (ctx) => {
          const actionsWrapper = document.createElement('div');
          actionsWrapper.className = 'product-discovery-product-actions';

          const addToCartBtn = getAddToCartButton(ctx.product);
          addToCartBtn.className = 'product-discovery-product-actions__add-to-cart';

          const $wishlistToggle = document.createElement('div');
          $wishlistToggle.classList.add('product-discovery-product-actions__wishlist-toggle');
          wishlistRender.render(WishlistToggle, { product: ctx.product, variant: 'tertiary' })($wishlistToggle);

          const $compareBtnContainer = document.createElement('div');
          $compareBtnContainer.classList.add('product-discovery-product-actions__compare');

          UI.render(Button, {
            children: labels.Global?.Compare || 'Compare',
            variant: 'secondary',
            onClick: () => {
              import('../../scripts/compare-service.js').then(({ CompareService }) => {
                CompareService.addProduct({
                  sku: ctx.product.sku,
                  name: ctx.product.name,
                  image: ctx.product.images?.[0]?.url || '',
                  urlKey: ctx.product.urlKey,
                  price: ctx.product.priceRange?.minimum?.final?.amount?.value
                    || ctx.product.price?.final?.amount?.value,
                });
                events.emit('compare/update');
              });
            },
          })($compareBtnContainer);

          actionsWrapper.appendChild(addToCartBtn);
          actionsWrapper.appendChild($wishlistToggle);
          actionsWrapper.appendChild($compareBtnContainer);
          ctx.replaceWith(actionsWrapper);
        },
      },
    })($productList),
  ]);

  if (hasPrerenderedMarkup && searchSucceeded) {
    fallbackNodes.forEach((node) => node.remove());
    $searchWrapper.hidden = false;
    block.dataset.enhanced = 'true';
  }

  // Sync Search Result & Filter Updates
  events.on('search/result', (payload) => {
    const totalCount = payload.result?.totalCount || 0;
    block.classList.toggle('product-list-page--empty', totalCount === 0);

    const activeUserFilters = (payload.request.filter || []).filter(
      (f) => f.attribute !== 'visibility'
        && f.attribute !== 'category_uid'
        && f.attribute !== 'categoryPath',
    );
    userFilters = activeUserFilters;

    // Toggle drawer Reset All button visibility
    if ($resetBtn) {
      $resetBtn.style.display = activeUserFilters.length > 0 ? 'inline-block' : 'none';
    }

    // Render active filter chips below toolbar
    renderActiveFilterChips(
      $activeFiltersWidget,
      activeUserFilters,
      async (attribute, valueToRemove) => {
        userFilters = userFilters.reduce((acc, f) => {
          if (f.attribute !== attribute) {
            acc.push(f);
            return acc;
          }

          if (Array.isArray(f.in)) {
            const updatedIn = f.in.filter((v) => String(v) !== String(valueToRemove));
            if (updatedIn.length > 0) {
              acc.push({ ...f, in: updatedIn });
            }
          } else if (f.eq && String(f.eq) !== String(valueToRemove)) {
            acc.push(f);
          }
          return acc;
        }, []);

        searchState.filter = userFilters;
        const currentUrl = new URL(window.location.href);
        applySearchStateToUrl(currentUrl, { ...payload.request, filter: userFilters });
        window.history.pushState({}, '', currentUrl.toString());

        await executeSearch(1);
      },
      resetAllFilters,
    );

    // Update Filter Trigger Button Badge Count
    const filterBtn = $viewFacets.querySelector('button');
    if (activeUserFilters.length > 0) {
      filterBtn?.setAttribute('data-count', activeUserFilters.length);
    } else {
      filterBtn?.removeAttribute('data-count');
    }

    if (config.urlpath && !hasServerCategoryJsonLd) {
      setCategoryJsonLd(payload, config.urlpath);
    }
  }, { eager: true });

  events.on('search/result', (payload) => {
    const url = new URL(window.location.href);
    applySearchStateToUrl(url, payload.request);
    window.history.pushState({}, '', url.toString());
  }, { eager: false });

  return Promise.resolve();
}
