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
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
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
 * Builds ItemList + BreadcrumbList JSON-LD from PLP search results when the
 * server-rendered category overlay did not provide schema.
 * @param {object} payload search/result event payload
 * @param {string} categoryPath catalog urlPath
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

  // Prefer category name in the document title when server metadata did not set one
  if (!isCategoryPrerendered() && !document.querySelector('meta[name="title"]')?.content) {
    document.title = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
  }
}

/**
 * Resolves catalog urlPath for template preview in DA/UE when only defaultCateId is authored.
 * @param {string} categoryId Catalog category ID from block config
 * @returns {Promise<string|null>} Category urlPath or null
 */
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

/**
 * Derives category name and breadcrumbs from the URL path segments when no
 * category ID is available — no API call needed.
 * e.g. "office/pens" → { name: "Pens",
 *   breadcrumbs: [{ name: "Office", path: "/categories/office" }] }
 */
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

/**
 * Fetches category name and ancestor chain using the Catalog Service GraphQL
 * (same mesh used by the navbar block) when a categoryId is known.
 *
 * @param {string|null} categoryId  Catalog category UID
 * @param {string|null} urlPath     Category urlPath fallback (e.g. "office/pens")
 * @returns {Promise<{name:string, breadcrumbs: Array}|null>}
 */
async function getCategoryMetadata(categoryId, urlPath) {
  // When we have no ID, derive everything from the URL — avoids any API call
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
      // Graceful fallback: derive from urlPath
      return getCategoryMetadataFromUrl(urlPath);
    }

    // Build breadcrumbs by walking up the parentId chain
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
    console.warn('Failed to fetch category metadata via Catalog Service, falling back to URL parsing', e);
    return getCategoryMetadataFromUrl(urlPath);
  }
}

/**
 * Transforms each `div.product-discovery-facet` group rendered by the
 * Facets dropin into a collapsible accordion panel.
 *
 * @param {HTMLElement} $facets  The facets container element
 * @returns {MutationObserver}   The active observer (call .disconnect() if needed)
 */
function initCollapsibleFacets($facets) {
  const processedGroups = new WeakSet();

  function makeFacetGroupCollapsible(group) {
    if (processedGroups.has(group)) return;

    // The title element is always span.product-discovery-facet__header
    const headerEl = group.querySelector('.product-discovery-facet__header');
    if (!headerEl) return;

    processedGroups.add(group);
    group.classList.add('plp-facet-group');

    // Style the header span as the toggle trigger
    headerEl.classList.add('plp-facet-toggle');
    headerEl.setAttribute('role', 'button');
    headerEl.setAttribute('tabindex', '0');

    // Set initial state based on FACET_OPTIONS option setting
    if (FACET_OPTIONS.defaultCollapsed) {
      group.classList.add('plp-facet-group--collapsed');
      headerEl.setAttribute('aria-expanded', 'false');
    } else {
      headerEl.setAttribute('aria-expanded', 'true');
    }

    // Append chevron icon inside the header
    if (!headerEl.querySelector('.plp-facet-chevron')) {
      const chevron = document.createElement('span');
      chevron.className = 'plp-facet-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      headerEl.appendChild(chevron);
    }

    // Collect every sibling AFTER the header and wrap in a content div
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'plp-facet-content';
    // headerEl.nextSibling loop so we don't touch the header itself
    let node = headerEl.nextElementSibling;
    while (node) {
      const next = node.nextElementSibling;
      contentWrapper.appendChild(node);
      node = next;
    }
    group.appendChild(contentWrapper);

    // Toggle collapse on click / keyboard
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
    // Target each rendered facet group by the exact dropin class name
    $facets
      .querySelectorAll('.product-discovery-facet')
      .forEach(makeFacetGroupCollapsible);
  }

  // Run once for any groups already in the DOM
  decorateRenderedFacets();

  // Keep watching for async dropin renders
  const observer = new MutationObserver(decorateRenderedFacets);
  observer.observe($facets, { childList: true, subtree: true });

  return observer;
}

export default async function decorate(block) {
  const labels = await fetchPlaceholders();

  const config = readBlockConfig(block);
  const pageSize = parseInt(config.pagesize, 10) || 9;
  const categoryMeta = getCategoryFromUrl();
  const hasPrerenderedMarkup = block.dataset.prerendered === 'true';
  const hasServerCategoryJsonLd = isCategoryPrerendered();

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
      <div class="search__product-sort"></div>
        <div class="search__product-list"></div>
        <div class="search__pagination"></div>
     </div>
     <div class="sidebar-main">
        <div class="block-subtitle">FILTER OPTIONS</div>
        <div class="search__view-facets"></div>
        <div class="search__facets"></div>
     </div>
      
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
  const fallbackNodes = hasPrerenderedMarkup ? [...block.childNodes] : [];

  if (hasPrerenderedMarkup) {
    $searchWrapper.hidden = true;
  } else {
    block.innerHTML = '';
  }
  block.appendChild(fragment);

  if (config.urlpath) {
    block.dataset.urlpath = config.urlpath;
  }
  if (categoryMeta?.cateId) {
    block.dataset.categoryId = categoryMeta.cateId;
  }

  const categoryId = categoryMeta?.cateId || block.dataset.categoryId
    || getCategoryFromUrl()?.cateId || config.defaultcateid;

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

  const searchState = getSearchStateFromUrl(new URL(window.location.href));

  const visibilityFilter = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };
  const userFilters = searchState.filter.filter((f) => f.attribute !== 'visibility');

  const normalizedUrl = new URL(window.location.href);
  applySearchStateToUrl(normalizedUrl, searchState);
  window.history.replaceState({}, '', normalizedUrl.toString());

  let searchSucceeded = true;
  if (config.urlpath || categoryId) {
    const categoryFilter = categoryId
      ? { attribute: 'category_uid', eq: categoryId }
      : { attribute: 'categoryPath', eq: config.urlpath };

    await search({
      phrase: '',
      currentPage: searchState.currentPage,
      pageSize,
      sort: searchState?.sort?.length ? searchState.sort : [{ attribute: 'position', direction: 'DESC' }],
      filter: [
        categoryFilter,
        visibilityFilter,
        ...userFilters,
      ],
    }).catch(() => {
      searchSucceeded = false;
      console.error('Error searching for products');
    });
  } else {
    await search({
      phrase: searchState.phrase,
      currentPage: searchState.currentPage,
      pageSize,
      sort: searchState.sort,
      filter: [visibilityFilter, ...userFilters],
    }).catch((e) => {
      searchSucceeded = false;
      console.error('Error searching for products', e);
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

  await Promise.all([
    provider.render(SortBy, {})($productSort),
    provider.render(Pagination, {
      onPageChange: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    })($pagination),
    UI.render(Button, {
      children: labels.Global?.Filters,
      icon: Icon({ source: 'Burger' }),
      variant: 'secondary',
      onClick: () => $facets.classList.toggle('search__facets--visible'),
    })($viewFacets),
    // Render Facets passing the filter display config option to retain the Category block layout
    provider.render(Facets, {
      categoriesFilterType: FACET_OPTIONS.categoriesFilterType,
    })($facets).then(() => {
      initCollapsibleFacets($facets);
    }),
    provider.render(SearchResults, {
      routeProduct: (product) => getProductLink(product.urlKey, product.sku),
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
        ProductActions: (ctx) => {
          const actionsWrapper = document.createElement('div');
          actionsWrapper.className = 'product-discovery-product-actions';

          const addToCartBtn = getAddToCartButton(ctx.product);
          addToCartBtn.className = 'product-discovery-product-actions__add-to-cart';

          const $wishlistToggle = document.createElement('div');
          $wishlistToggle.classList.add('product-discovery-product-actions__wishlist-toggle');
          wishlistRender.render(WishlistToggle, { product: ctx.product, variant: 'tertiary' })($wishlistToggle);

          // Custom Compare Button Appending Configuration Sequence
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

  events.on('search/result', (payload) => {
    const totalCount = payload.result?.totalCount || 0;
    block.classList.toggle('product-list-page--empty', totalCount === 0);

    if (payload.request.filter.length > 0) {
      $viewFacets.querySelector('button').setAttribute('data-count', payload.request.filter.length);
    } else {
      $viewFacets.querySelector('button').removeAttribute('data-count');
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
