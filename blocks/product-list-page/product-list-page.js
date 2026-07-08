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
import { readBlockConfig } from '../../scripts/aem.js';
import { fetchPlaceholders, getProductLink } from '../../scripts/commerce.js';
import { getSearchStateFromUrl, applySearchStateToUrl } from './search-url.js';
import { getCategory } from './services/category.js';
import { renderBreadcrumbs } from './components/breadcrumbs.js';

// Initializers
import '../../scripts/initializers/search.js';
import '../../scripts/initializers/wishlist.js';

export default async function decorate(block) {
  const labels = await fetchPlaceholders();

  const config = readBlockConfig(block);
  const pageSize = parseInt(config.pagesize, 10) || 9;

  const fragment = document.createRange().createContextualFragment(`
    <div class="category-header">
      <div class="plp-breadcrumbs"></div>
      <div class="category-banner"></div>
      <div class="category-title-description">
        <h1 class="category-title"></h1>
        <div class="category-description"></div>
      </div>
    </div>
    <div class="search__wrapper">
      <div class="search__facets"></div>
      <div class="search__main">
        <div class="search__toolbar">
          <div class="search__view-facets"></div>
          <div class="search__result-info"></div>
          <div class="search__toolbar-actions">
            <div class="search__product-sort"></div>
            <div class="search__per-page"></div>
            <div class="search__view-modes">
              <button class="view-mode view-mode-grid active" aria-label="Grid View">Grid</button>
              <button class="view-mode view-mode-list" aria-label="List View">List</button>
            </div>
          </div>
        </div>
        <div class="search__product-list"></div>
        <div class="search__pagination"></div>
      </div>
    </div>
  `);

  const $breadcrumbs = fragment.querySelector('.plp-breadcrumbs');
  const $categoryBanner = fragment.querySelector('.category-banner');
  const $categoryTitle = fragment.querySelector('.category-title');
  const $categoryDescription = fragment.querySelector('.category-description');

  const $resultInfo = fragment.querySelector('.search__result-info');
  const $viewFacets = fragment.querySelector('.search__view-facets');
  const $facets = fragment.querySelector('.search__facets');
  const $productSort = fragment.querySelector('.search__product-sort');
  const $perPage = fragment.querySelector('.search__per-page');
  const $productList = fragment.querySelector('.search__product-list');
  const $pagination = fragment.querySelector('.search__pagination');
  const $viewModes = fragment.querySelectorAll('.view-mode');

  block.innerHTML = '';
  block.appendChild(fragment);

  // View modes
  $viewModes.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      $viewModes.forEach((b) => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      if (e.currentTarget.classList.contains('view-mode-list')) {
        $productList.classList.add('list-view');
      } else {
        $productList.classList.remove('list-view');
      }
    });
  });

  let categoryData = null;
  if (config.urlpath) {
    categoryData = await getCategory(config.urlpath);
    if (categoryData) {
      $categoryTitle.textContent = categoryData.name;
      if (categoryData.description) {
        $categoryDescription.innerHTML = categoryData.description;
      }
      if (categoryData.image) {
        const img = document.createElement('img');
        img.src = categoryData.image;
        img.alt = categoryData.name;
        $categoryBanner.appendChild(img);
      }
      renderBreadcrumbs($breadcrumbs, categoryData, labels.Global);
    }
  }

  // Add url path back to the block for enrichment, incase enrichment block is
  // executed after the plp block and block config is not available
  if (config.urlpath) {
    block.dataset.urlpath = config.urlpath;
  }

  const searchState = getSearchStateFromUrl(new URL(window.location.href));

  // Default visibility filter for all of our requests
  const visibilityFilter = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };
  const userFilters = searchState.filter.filter((f) => f.attribute !== 'visibility');

  // Normalize URL (e.g. pipe-separated filter values)
  const normalizedUrl = new URL(window.location.href);
  applySearchStateToUrl(normalizedUrl, searchState);
  window.history.replaceState({}, '', normalizedUrl.toString());

  // Request search based on the page type on block load
  if (config.urlpath) {
    // If it's a category page...
    await search({
      phrase: '', // search all products in the category
      currentPage: searchState.currentPage,
      pageSize,
      sort: searchState?.sort?.length ? searchState.sort : [{ attribute: 'position', direction: 'DESC' }],
      filter: [
        { attribute: 'categoryPath', eq: config.urlpath }, // Add category filter
        // Always add visibility filter to the request
        visibilityFilter,
        ...userFilters,
      ],
    }).catch(() => {
      console.error('Error searching for products');
    });
  } else {
    // Search page: dropin uses only the request (no URL parsing).
    await search({
      phrase: searchState.phrase,
      currentPage: searchState.currentPage,
      pageSize,
      sort: searchState.sort,
      // Always add visibility filter to the request
      filter: [visibilityFilter, ...userFilters],
    }).catch((e) => {
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
      disabled: !product.inStock,
    })(button);
    return button;
  };

  const renderPerPage = () => {
    const options = [9, 12, 24, 36];
    const select = document.createElement('select');
    select.className = 'per-page-select';
    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = `${opt} per page`;
      if (opt === pageSize) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener('change', (e) => {
      const newPageSize = parseInt(e.target.value, 10);
      const url = new URL(window.location.href);
      url.searchParams.set('page_size', newPageSize);
      window.history.pushState({}, '', url.toString());
      search({ pageSize: newPageSize }); // re-trigger search
    });
    $perPage.innerHTML = '';
    $perPage.appendChild(select);
  };

  renderPerPage();

  await Promise.all([
    // Sort By
    provider.render(SortBy, {})($productSort),

    // Pagination
    provider.render(Pagination, {
      onPageChange: () => {
        // scroll to the top of the page
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    })($pagination),

    // View Facets Button
    UI.render(Button, {
      children: labels.Global?.Filters,
      icon: Icon({ source: 'Burger' }),
      variant: 'secondary',
      onClick: () => {
        $facets.classList.toggle('search__facets--visible');
      },
    })($viewFacets),

    // Facets
    provider.render(Facets, {})($facets),
    // Product List
    provider.render(SearchResults, {
      routeProduct: (product) => getProductLink(product.urlKey, product.sku),
      slots: {
        ProductImage: (ctx) => {
          const { product, defaultImageProps } = ctx;
          const anchorWrapper = document.createElement('a');
          anchorWrapper.href = getProductLink(product.urlKey, product.sku);
          anchorWrapper.className = 'product-discovery-product-image-wrapper';

          // Render primary image
          tryRenderAemAssetsImage(ctx, {
            alias: product.sku,
            imageProps: defaultImageProps,
            wrapper: anchorWrapper,
            params: {
              width: defaultImageProps.width,
              height: defaultImageProps.height,
            },
          });
        },
        ProductActions: (ctx) => {
          const actionsWrapper = document.createElement('div');
          actionsWrapper.className = 'product-discovery-product-actions';
          // Add to Cart Button
          const addToCartBtn = getAddToCartButton(ctx.product);
          addToCartBtn.className = 'product-discovery-product-actions__add-to-cart';
          // Wishlist Button
          const $wishlistToggle = document.createElement('div');
          $wishlistToggle.classList.add('product-discovery-product-actions__wishlist-toggle');
          wishlistRender.render(WishlistToggle, {
            product: ctx.product,
            variant: 'tertiary',
          })($wishlistToggle);
          actionsWrapper.appendChild(addToCartBtn);
          actionsWrapper.appendChild($wishlistToggle);
          
          // Additional hover elements
          const compareBtn = document.createElement('button');
          compareBtn.className = 'product-discovery-product-actions__compare';
          compareBtn.innerHTML = '<span>Compare</span>';
          actionsWrapper.appendChild(compareBtn);

          ctx.replaceWith(actionsWrapper);
        },
      },
    })($productList),
  ]);

  // Listen for search results (event is fired before the block is rendered; eager: true)
  events.on('search/result', (payload) => {
    const totalCount = payload.result?.totalCount || 0;

    block.classList.toggle('product-list-page--empty', totalCount === 0);

    // Results Info
    $resultInfo.innerHTML = payload.request?.phrase
      ? `${totalCount} results found for <strong>"${payload.request.phrase}"</strong>.`
      : `${totalCount} results found.`;

    // Update the view facets button with the number of filters
    if (payload.request.filter.length > 0) {
      $viewFacets.querySelector('button').setAttribute('data-count', payload.request.filter.length);
    } else {
      $viewFacets.querySelector('button').removeAttribute('data-count');
    }
  }, { eager: true });

  // Listen for search results (event is fired after the block is rendered; eager: false)
  // URL is owned by this project; update it when search state changes.
  events.on('search/result', (payload) => {
    const url = new URL(window.location.href);
    applySearchStateToUrl(url, payload.request);
    window.history.pushState({}, '', url.toString());
  }, { eager: false });

  events.on('search/result', (payload) => {
    console.group('PLP Debug');

    console.log('Payload:', payload);
    console.log('Request:', payload.request);
    console.log('Result:', payload.result);

    if (payload.result) {
      console.log('Result Keys:', Object.keys(payload.result));
    }

    console.groupEnd();
  }, { eager: true });
}
