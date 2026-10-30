import { render as provider } from '@dropins/storefront-cart/render.js';
import MiniCart from '@dropins/storefront-cart/containers/MiniCart.js';
import { events } from '@dropins/tools/event-bus.js';

import '../../scripts/initializers/cart.js';

import { readBlockConfig } from '../../scripts/aem.js';
import {
  fetchPlaceholders,
  rootLink,
  getProductLinkFromCartItem,
} from '../../scripts/commerce.js';
import {
  mountCartLineConfigurationDetails,
  ensureCartReady,
} from '../../scripts/gift-options-ui.js';
import { appendMinicartEditAction } from '../../scripts/components/commerce-mini-pdp/commerce-mini-pdp.js';

export default async function decorate(block) {
  const {
    'start-shopping-url': startShoppingURL = '',
    'cart-url': cartURL = '',
    'checkout-url': checkoutURL = '',
    'undo-remove-item': undo = 'false',
    'enable-updating-product': enableUpdatingProduct = 'false',
  } = readBlockConfig(block);

  const placeholders = await fetchPlaceholders();

  await ensureCartReady();

  const MESSAGES = {
    ADDED: placeholders?.Global?.MiniCartAddedMessage,
    UPDATED: placeholders?.Global?.MiniCartUpdatedMessage,
  };

  const updateMessage = document.createElement('div');
  updateMessage.className = 'commerce-mini-cart__update-message';

  const shadowWrapper = document.createElement('div');
  shadowWrapper.className = 'commerce-mini-cart__message-wrapper';
  shadowWrapper.appendChild(updateMessage);

  const showMessage = (message) => {
    updateMessage.textContent = message;
    updateMessage.classList.add('commerce-mini-cart__update-message--visible');
    shadowWrapper.classList.add('commerce-mini-cart__message-wrapper--visible');
    setTimeout(() => {
      updateMessage.classList.remove(
        'commerce-mini-cart__update-message--visible',
      );
      shadowWrapper.classList.remove(
        'commerce-mini-cart__message-wrapper--visible',
      );
    }, 3000);
  };

  events.on('cart/product/added', () => showMessage(MESSAGES.ADDED), {
    eager: true,
  });
  events.on('cart/product/updated', () => showMessage(MESSAGES.UPDATED), {
    eager: true,
  });

  if (undo === 'true') {
    block.addEventListener('click', (e) => {
      const isUndoControl = e.target.closest('[class*="undo"]')
        || e.target.closest('[data-testid*="undo"]');

      if (isUndoControl) {
        e.stopPropagation();
      }
    });
  }

  block.innerHTML = '';

  const lineExtrasOptions = {
    placeholders,
    enableUpdatingProduct,
    undo,
    onUpdated: () => showMessage(MESSAGES.UPDATED),
  };

  const createProductLink = (item) => getProductLinkFromCartItem(item);
  await provider.render(MiniCart, {
    routeEmptyCartCTA: startShoppingURL ? () => rootLink(startShoppingURL) : undefined,
    routeCart: cartURL ? () => rootLink(cartURL) : undefined,
    routeCheckout: checkoutURL ? () => rootLink(checkoutURL) : undefined,
    routeProduct: createProductLink,
    undo: undo === 'true',
    enableItemRemoval: true,
    enableQuantityUpdate: { removeOnZero: true },
    slots: {
      ProductAttributes: (ctx) => {
        mountCartLineConfigurationDetails(ctx, {
          variant: 'attributes',
          className: 'dropin-cart-item__attributes',
          lineClass: 'dropin-cart-item__attribute-line',
        });
      },
      ItemRemoveAction: (ctx) => {
        appendMinicartEditAction(ctx, lineExtrasOptions);
      },
    },
  })(block);

  const productsContainer = block.querySelector('.cart-mini-cart__products');
  if (productsContainer) {
    productsContainer.insertBefore(shadowWrapper, productsContainer.firstChild);
  } else {
    block.appendChild(shadowWrapper);
  }

  return block;
}
