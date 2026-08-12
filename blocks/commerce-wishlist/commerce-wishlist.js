import * as cartApi from '@dropins/storefront-cart/api.js';
import * as pdpApi from '@dropins/storefront-pdp/api.js';
import { render as wishlistRenderer } from '@dropins/storefront-wishlist/render.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import { AuthCombine } from '@dropins/storefront-auth/containers/AuthCombine.js';
import { events } from '@dropins/tools/event-bus.js';
import Wishlist from '@dropins/storefront-wishlist/containers/Wishlist.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import {
  CS_FETCH_GRAPHQL, rootLink, getProductLink, fetchPlaceholders,
} from '../../scripts/commerce.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { getGlobalBreadcrumbsContainer, renderBreadcrumbs } from '../../scripts/breadcrumbs.js';

import '../../scripts/initializers/wishlist.js';
import '../../scripts/initializers/cart.js';

// Initialize

// Inherit Fetch GraphQL Instance (Catalog Service)
pdpApi.setEndpoint(CS_FETCH_GRAPHQL);

const WISHLIST_IMAGE_DIMENSIONS = {
  width: 288,
  height: 288,
};

function safeRenderBreadcrumbs(container, data, labels) {
  try {
    if (typeof renderBreadcrumbs === 'function' && container) {
      renderBreadcrumbs(container, data, labels);
    }
  } catch (error) {
    console.error('Breadcrumb rendering failed in commerce-wishlist:', error);
  }
}

const showAuthModal = (event) => {
  if (event) {
    event.preventDefault();
  }

  const signInModal = document.createElement('div');
  signInModal.setAttribute('id', 'signin-modal');

  const signInForm = document.createElement('div');
  signInForm.setAttribute('id', 'signin-form');

  signInModal.onclick = (clickEvent) => {
    if (clickEvent.target === signInModal) {
      signInModal.remove();
    }
  };

  signInModal.appendChild(signInForm);
  document.body.appendChild(signInModal);

  // Render auth form
  authRenderer.render(AuthCombine, {
    signInFormConfig: {
      renderSignUpLink: true,
      onSuccessCallback: () => {
        window.location.reload();
      },
    },
    signUpFormConfig: {
      onSuccessCallback: () => {
        window.location.reload();
      },
    },
    resetPasswordFormConfig: {},
  })(signInForm);
};

events.on('wishlist/alert', () => {
  setTimeout(() => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }, 0);
});

export default async function decorate(block) {
  const {
    'start-shopping-url': startShoppingURL = '',
  } = readBlockConfig(block);

  const placeholders = await fetchPlaceholders();
  const pageTitle = document.querySelector('meta[name="title"]')?.content || 'Wishlist';

  if (!document.title.includes(pageTitle)) {
    document.title = pageTitle;
  }

  const globalBreadcrumbsContainer = getGlobalBreadcrumbsContainer();
  safeRenderBreadcrumbs(globalBreadcrumbsContainer, { name: 'Wishlist' }, placeholders);

  const existingTitle = block.parentElement?.querySelector('.commerce-wishlist-page-title');
  if (!existingTitle) {
    const titleEl = document.createElement('h1');
    titleEl.className = 'commerce-wishlist-page-title commerce-header-title';
    titleEl.textContent = pageTitle;
    block.parentElement?.insertBefore(titleEl, block);
  }

  await wishlistRenderer.render(Wishlist, {
    routeEmptyWishlistCTA: startShoppingURL ? () => rootLink(startShoppingURL) : undefined,
    moveProdToCart: cartApi.addProductsToCart,
    routeProdDetailPage: (product) => getProductLink(product.urlKey, product.sku),
    onLoginClick: showAuthModal,
    getProductData: pdpApi.getProductData,
    getRefinedProduct: pdpApi.getRefinedProduct,
    slots: {
      image: (ctx) => {
        const { item, defaultImageProps } = ctx;
        tryRenderAemAssetsImage(ctx, {
          alias: item.product.sku,
          imageProps: defaultImageProps,
          params: {
            width: defaultImageProps.width || WISHLIST_IMAGE_DIMENSIONS.width,
            height: defaultImageProps.height || WISHLIST_IMAGE_DIMENSIONS.height,
          },
        });
      },
    },
  })(block);
}
