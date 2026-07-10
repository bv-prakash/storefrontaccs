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

// --- Helper Functions -------------------------------------------------
function secureBannerPlacement(bannerEl, grid, targetIndex) {
  if (!bannerEl || !grid) return;

  const items = [...grid.children].filter(
    (el) => el !== bannerEl && !el.classList.contains('plp-banner-skeleton'),
  );

  // Absolute guard check: If grid doesn't have enough elements to fulfill the target position,
  // append it to the end instead of breaking or jumping layout scopes mid-render.
  if (items.length === 0) return;

  const resolvedIndex = Math.min(targetIndex, items.length - 1);
  const targetElement = items[resolvedIndex];

  if (targetElement && targetElement.nextSibling !== bannerEl) {
    bannerEl.classList.remove('plp-inline-banner--hidden');
    bannerEl.classList.add('plp-inline-banner');
    targetElement.after(bannerEl);
  }
}
// -----------------------------------------------------------------------

export default async function decorate(block) {
  // Capture banner immediately from the DOM before any asynchronous processes or wipes
  const rawBanner = block.querySelector('.plp-banner') || document.querySelector('.plp-banner');
  const bannerClone = rawBanner ? rawBanner.cloneNode(true) : null;

  if (rawBanner) {
    rawBanner.remove();
  }

  if (bannerClone) {
    bannerClone.classList.add('plp-inline-banner--hidden');
  }

  const labels = await fetchPlaceholders();
  const config = readBlockConfig(block);
  const pageSize = parseInt(config.pagesize, 10) || 9;

  const bannerAfterIndex = (parseInt(config.bannerposition, 10) || 4) - 1;
  const bannerFirstPageOnly = (config.bannerscope || 'first-page') === 'first-page';
  let showBannerCurrentState = true;

  const fragment = document.createRange().createContextualFragment(`
    <div class="category-header">
      <div class="plp-breadcrumbs"></div>
    </div>
    <div class="search__wrapper">
      <div class="search__result-info"></div>
      <div class="search__view-facets"></div>
      <div class="search__facets"></div>
      <div class="search__product-sort"></div>
      <div class="search__product-list">
         <div class="plp-banner-skeleton"></div>
      </div>
      <div class="search__pagination"></div>
    </div>
  `);

  const $breadcrumbs = fragment.querySelector('.plp-breadcrumbs');
  const $resultInfo = fragment.querySelector('.search__result-info');
  const $viewFacets = fragment.querySelector('.search__view-facets');
  const $facets = fragment.querySelector('.search__facets');
  const $productSort = fragment.querySelector('.search__product-sort');
  const $productList = fragment.querySelector('.search__product-list');
  const $pagination = fragment.querySelector('.search__pagination');

  block.innerHTML = '';
  block.appendChild(fragment);

  if (config.urlpath) {
    block.dataset.urlpath = config.urlpath;
  }

  // --- MutationObserver: Locked Engine Sync ---
  let activeBannerInstance = bannerClone ? bannerClone.cloneNode(true) : null;

  const gridObserver = new MutationObserver(() => {
    if (!bannerClone || !showBannerCurrentState) return;
    const grid = $productList.querySelector('.product-discovery-product-list__grid');
    if (grid) {
      if (!activeBannerInstance || !document.body.contains(activeBannerInstance)) {
        activeBannerInstance = bannerClone.cloneNode(true);
      }
      secureBannerPlacement(activeBannerInstance, grid, bannerAfterIndex);
    }
  });

  gridObserver.observe($productList, { childList: true, subtree: true });

  const searchState = getSearchStateFromUrl(new URL(window.location.href));
  const visibilityFilter = { attribute: 'visibility', in: ['Search', 'Catalog, Search'] };
  const userFilters = searchState.filter.filter((f) => f.attribute !== 'visibility');

  const normalizedUrl = new URL(window.location.href);
  applySearchStateToUrl(normalizedUrl, searchState);
  window.history.replaceState({}, '', normalizedUrl.toString());

  if (config.urlpath) {
    const categoryData = await getCategory(config.urlpath);
    if (categoryData && $breadcrumbs) {
      renderBreadcrumbs($breadcrumbs, categoryData, labels.Global);
    }

    await search({
      phrase: '',
      currentPage: searchState.currentPage,
      pageSize,
      sort: searchState?.sort?.length ? searchState.sort : [{ attribute: 'position', direction: 'DESC' }],
      filter: [
        { attribute: 'categoryPath', eq: config.urlpath },
        visibilityFilter,
        ...userFilters,
      ],
    }).catch(() => {
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

  await Promise.all([
    provider.render(SortBy, {})($productSort),

    provider.render(Pagination, {
      onPageChange: () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    })($pagination),

    UI.render(Button, {
      children: labels.Global?.Filters,
      icon: Icon({ source: 'Burger' }),
      variant: 'secondary',
      onClick: () => {
        if ($facets) $facets.classList.toggle('search__facets--visible');
      },
    })($viewFacets),

    provider.render(Facets, {})($facets),

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
            params: {
              width: defaultImageProps.width,
              height: defaultImageProps.height,
            },
          });
        },
        ProductActions: (ctx) => {
          const actionsWrapper = document.createElement('div');
          actionsWrapper.className = 'product-discovery-product-actions';
          const addToCartBtn = getAddToCartButton(ctx.product);
          addToCartBtn.className = 'product-discovery-product-actions__add-to-cart';
          const $wishlistToggle = document.createElement('div');
          $wishlistToggle.classList.add('product-discovery-product-actions__wishlist-toggle');
          wishlistRender.render(WishlistToggle, {
            product: ctx.product,
            variant: 'tertiary',
          })($wishlistToggle);
          actionsWrapper.appendChild(addToCartBtn);
          actionsWrapper.appendChild($wishlistToggle);
          ctx.replaceWith(actionsWrapper);
        },
      },
    })($productList),
  ]);

  events.on('search/result', (payload) => {
    const totalCount = payload.result?.totalCount || 0;

    if (block) {
      block.classList.toggle('product-list-page--empty', totalCount === 0);
    }

    if ($resultInfo) {
      $resultInfo.innerHTML = payload.request?.phrase
        ? `${totalCount} results found for <strong>"${payload.request.phrase}"</strong>.`
        : `${totalCount} results found.`;
    }

    if ($viewFacets) {
      const button = $viewFacets.querySelector('button');
      if (button) {
        if (payload.request?.filter?.length > 0) {
          button.setAttribute('data-count', payload.request.filter.length);
        } else {
          button.removeAttribute('data-count');
        }
      }
    }

    showBannerCurrentState = (!bannerFirstPageOnly || (payload.request?.currentPage || 1) === 1)
     && totalCount > 0;

    if (showBannerCurrentState) {
      const grid = $productList.querySelector('.product-discovery-product-list__grid');
      if (grid) {
        // Clear skeleton loader immediately upon receiving data payload
        const existingSkeleton = grid.querySelector('.plp-banner-skeleton');
        if (existingSkeleton) existingSkeleton.remove();

        if (!activeBannerInstance || !document.body.contains(activeBannerInstance)) {
          activeBannerInstance = bannerClone.cloneNode(true);
        }
        secureBannerPlacement(activeBannerInstance, grid, bannerAfterIndex);
      }
    } else {
      if (activeBannerInstance) activeBannerInstance.remove();
      const fallbackSkeleton = $productList.querySelector('.plp-banner-skeleton');
      if (fallbackSkeleton) fallbackSkeleton.remove();
    }
  }, { eager: true });

  events.on('search/result', (payload) => {
    const url = new URL(window.location.href);
    applySearchStateToUrl(url, payload.request);
    window.history.pushState({}, '', url.toString());
  }, { eager: false });
}
