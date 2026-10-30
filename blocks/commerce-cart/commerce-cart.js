import { events } from '@dropins/tools/event-bus.js';
import { render as provider } from '@dropins/storefront-cart/render.js';
import * as Cart from '@dropins/storefront-cart/api.js';
import { h } from '@dropins/tools/preact.js';
import {
  InLineAlert,
  Icon,
  provider as UI,
} from '@dropins/tools/components.js';

// Dropin Containers
import { CartSummaryTable } from '@dropins/storefront-cart/containers/CartSummaryTable.js';
import OrderSummary from '@dropins/storefront-cart/containers/OrderSummary.js';
import EstimateShipping from '@dropins/storefront-cart/containers/EstimateShipping.js';
import Coupons from '@dropins/storefront-cart/containers/Coupons.js';
import GiftCards from '@dropins/storefront-cart/containers/GiftCards.js';
import GiftOptions from '@dropins/storefront-cart/containers/GiftOptions.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';
import { WishlistToggle } from '@dropins/storefront-wishlist/containers/WishlistToggle.js';
import { WishlistAlert } from '@dropins/storefront-wishlist/containers/WishlistAlert.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';

// API
import { publishShoppingCartViewEvent } from '@dropins/storefront-cart/api.js';
import {
  mountCartLineConfigurationDetails,
  buildOrderGiftOptionsProps,
  ensureCartReady,
} from '../../scripts/gift-options-ui.js';

import { createCartItemEditButton } from '../../scripts/components/commerce-mini-pdp/commerce-mini-pdp.js';

// Initializers
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/wishlist.js';

import { readBlockConfig } from '../../scripts/aem.js';
import {
  fetchPlaceholders,
  rootLink,
  getProductLinkFromCartItem,
} from '../../scripts/commerce.js';
import { getGlobalBreadcrumbsContainer, renderBreadcrumbs } from '../../scripts/breadcrumbs.js';

/**
 * Safely renders breadcrumbs without breaking the block execution if an error occurs.
 */
function safeRenderBreadcrumbs(container, categoryData, labels) {
  try {
    if (typeof renderBreadcrumbs === 'function' && container) {
      renderBreadcrumbs(container, categoryData, labels);
    }
  } catch (error) {
    console.error('Breadcrumb rendering failed on Cart page:', error);
  }
}

export default async function decorate(block) {
  // Configuration
  const {
    'hide-heading': _hideHeading = 'false',
    'max-items': _maxItems,
    'hide-attributes': _hideAttributes = '',
    'enable-item-quantity-update': enableUpdateItemQuantity = 'false',
    'enable-item-remove': enableRemoveItem = 'true',
    'enable-estimate-shipping': enableEstimateShipping = 'false',
    'start-shopping-url': startShoppingURL = '',
    'checkout-url': checkoutURL = '',
    'enable-updating-product': enableUpdatingProduct = 'false',
    'undo-remove-item': undo = 'false',
  } = readBlockConfig(block);

  const placeholders = await fetchPlaceholders();

  const _cart = Cart.getCartDataFromCache();

  let currentNotification = null;

  // Layout: breadcrumbs, cart title, two-column wrapper
  const cartTitle = placeholders?.Global?.CartTitle || 'Shopping Cart';
  const fragment = document.createRange().createContextualFragment(`
    <div class="cart__breadcrumbs"></div>
    <div class="cart__notification"></div>
    <h1 class="cart__title">${cartTitle}</h1>
    <div class="cart__wrapper">
      <div class="cart__left-column">
        <div class="cart__list"></div>
      </div>
      <div class="cart__right-column">
        <div class="cart__order-summary"></div>
        <div class="cart__gift-options"></div>
      </div>
    </div>

    <div class="cart__empty-cart"></div>
  `);

  const $wrapper = fragment.querySelector('.cart__wrapper');
  const $notification = fragment.querySelector('.cart__notification');
  const $list = fragment.querySelector('.cart__list');
  const $summary = fragment.querySelector('.cart__order-summary');
  const $emptyCart = fragment.querySelector('.cart__empty-cart');
  const $giftOptions = fragment.querySelector('.cart__gift-options');
  const $rightColumn = fragment.querySelector('.cart__right-column');

  block.innerHTML = '';
  block.appendChild(fragment);

  // Render Breadcrumbs for Cart Page
  const cartBreadcrumbsData = {
    name: placeholders?.Global?.CartTitle || 'Shopping Cart',
    breadcrumbs: [],
  };
  const globalBreadcrumbsContainer = getGlobalBreadcrumbsContainer();
  safeRenderBreadcrumbs(globalBreadcrumbsContainer, cartBreadcrumbsData, placeholders);

  // Wishlist variables
  const routeToWishlist = rootLink('/wishlist');

  // Toggle Empty Cart
  function toggleEmptyCart(_state) {
    $wrapper.removeAttribute('hidden');
    $emptyCart.setAttribute('hidden', '');
  }

  async function showCartItemUpdatedNotice(cartItem) {
    const productName = cartItem.name
      || cartItem.product?.name
      || placeholders?.Global?.CartUpdatedProductName;
    const message = placeholders?.Global?.CartUpdatedProductMessage?.replace(
      '{product}',
      productName,
    );

    currentNotification?.remove();

    currentNotification = await UI.render(InLineAlert, {
      heading: message,
      type: 'success',
      variant: 'primary',
      icon: h(Icon, { source: 'CheckWithCircle' }),
      'aria-live': 'assertive',
      role: 'alert',
      onDismiss: () => {
        currentNotification?.remove();
      },
    })($notification);

    setTimeout(() => {
      currentNotification?.remove();
    }, 5000);
  }

  async function showCartItemEditError() {
    currentNotification?.remove();
    currentNotification = await UI.render(InLineAlert, {
      heading: placeholders?.Global?.ProductLoadError,
      type: 'error',
      variant: 'primary',
      icon: h(Icon, { source: 'AlertWithCircle' }),
      'aria-live': 'assertive',
      role: 'alert',
      onDismiss: () => {
        currentNotification?.remove();
      },
    })($notification);
  }

  // Render Containers
  const createProductLink = (item) => getProductLinkFromCartItem(item);
  await ensureCartReady();
  await Promise.all([
    // Cart Table (table-layout for product listing)
    provider.render(CartSummaryTable, {
      routeProduct: createProductLink,
      routeEmptyCartCTA: startShoppingURL ? () => rootLink(startShoppingURL) : undefined,
      allowQuantityUpdates: enableUpdateItemQuantity === 'true',
      allowRemoveItems: enableRemoveItem === 'true',
      undo: undo === 'true',
      slots: {
        Thumbnail: (ctx) => {
          const { item, defaultImageProps, index: _index } = ctx;
          const anchorWrapper = document.createElement('a');
          anchorWrapper.href = createProductLink(item);

          tryRenderAemAssetsImage(ctx, {
            alias: item.sku,
            imageProps: defaultImageProps,
            wrapper: anchorWrapper,

            params: {
              width: defaultImageProps.width,
              height: defaultImageProps.height,
            },
          });
        },

        Quantity: (ctx) => {
          const itemUid = ctx.item?.uid;
          const currentQty = ctx.item?.quantity || 1;
          const wrapper = document.createElement('div');
          wrapper.className = 'cart-quantity-stepper-wrapper';

          wrapper.innerHTML = `
            <div class="cart-quantity-stepper">
              <button type="button" class="cart-qty-btn decrease-quantity" data-action="dec" ${currentQty <= 1 ? 'disabled' : ''} aria-label="Decrease quantity"><span>Decrease quantity</span></button>
              <input type="number" name="quantity" aria-label="Item Quantity" class="cart-qty-input" value="${currentQty}" min="1" />
              <button type="button" class="cart-qty-btn increase-quantity" data-action="inc" aria-label="Increase quantity"><span>Increase quantity</span></button>
            </div>
          `;

          const input = wrapper.querySelector('.cart-qty-input');
          const decBtn = wrapper.querySelector('.cart-qty-btn[data-action="dec"]');
          const incBtn = wrapper.querySelector('.cart-qty-btn[data-action="inc"]');

          const updateQuantity = async (newVal) => {
            let qty = parseInt(newVal, 10);
            if (Number.isNaN(qty) || qty < 1) qty = 1;

            input.value = qty;
            if (decBtn) decBtn.disabled = qty <= 1;

            if (itemUid) {
              try {
                if (typeof ctx.setItemUpdating === 'function') {
                  ctx.setItemUpdating(itemUid, true);
                } else {
                  ctx.handleItemsLoading?.(true);
                }
                await Cart.updateProductsFromCart([{ uid: itemUid, quantity: qty }]);
              } catch (err) {
                console.error('Failed to update product quantity:', err);
              } finally {
                if (typeof ctx.setItemUpdating === 'function') {
                  ctx.setItemUpdating(itemUid, false);
                } else {
                  ctx.handleItemsLoading?.(false);
                }
              }
            }
          };

          decBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            const qty = parseInt(input.value || '1', 10);
            if (qty > 1) updateQuantity(qty - 1);
          });

          incBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            const qty = parseInt(input.value || '1', 10);
            updateQuantity(qty + 1);
          });

          input?.addEventListener('change', (e) => {
            updateQuantity(e.target.value);
          });

          ctx.replaceWith(wrapper);
        },

        Configurations: (ctx) => {
          mountCartLineConfigurationDetails(ctx, {
            variant: 'table',
            useReplace: true,
            extrasClass: 'cart-line-item-extras',
            inlineText: true,
            listClass: 'cart-cart-summary-table__item-configurations',
            itemClass: 'cart-cart-summary-table__item-configuration',
            valueClass: 'cart-cart-summary-table__item-configuration-line',
          });
        },

        Actions: (ctx) => {
          const editButton = createCartItemEditButton({
            cartItem: ctx.item,
            placeholders,
            enableUpdatingProduct,
            onUpdated: () => showCartItemUpdatedNotice(ctx.item),
            onError: showCartItemEditError,
          });
          if (editButton) {
            ctx.appendChild(editButton);
          }

          const $wishlistToggle = document.createElement('div');
          $wishlistToggle.classList.add('cart__action--wishlist-toggle');

          wishlistRender.render(WishlistToggle, {
            product: ctx.item,
            size: 'medium',
            labelToWishlist: placeholders?.Global?.CartMoveToWishlist,
            labelWishlisted: placeholders?.Global?.CartRemoveFromWishlist,
            removeProdFromCart: Cart.updateProductsFromCart,
          })($wishlistToggle);

          ctx.appendChild($wishlistToggle);
        },
      },
    })($list),

    // Order Summary
    provider.render(OrderSummary, {
      routeCheckout: checkoutURL ? () => rootLink(checkoutURL) : undefined,
      slots: {
        EstimateShipping: async (ctx) => {
          if (enableEstimateShipping === 'true') {
            const wrapper = document.createElement('div');
            await provider.render(EstimateShipping, {})(wrapper);
            ctx.replaceWith(wrapper);
          }
        },
        Coupons: (ctx) => {
          const coupons = document.createElement('div');

          provider.render(Coupons)(coupons);

          ctx.appendChild(coupons);
        },
        GiftCards: (ctx) => {
          const giftCards = document.createElement('div');

          provider.render(GiftCards)(giftCards);

          ctx.appendChild(giftCards);
        },
      },
    })($summary),

    provider.render(GiftOptions, buildOrderGiftOptionsProps())($giftOptions),
  ]);

  let cartViewEventPublished = false;
  // Events
  events.on(
    'cart/data',
    (cartData) => {
      toggleEmptyCart(isCartEmpty(cartData));

      const isEmpty = !cartData || cartData.totalQuantity < 1;
      $giftOptions.style.display = isEmpty ? 'none' : '';
      $rightColumn.style.display = isEmpty ? 'none' : '';

      if (!cartViewEventPublished) {
        cartViewEventPublished = true;
        publishShoppingCartViewEvent();
      }
    },
    { eager: true },
  );

  events.on('wishlist/alert', ({ action, item }) => {
    wishlistRender.render(WishlistAlert, {
      action,
      item,
      routeToWishlist,
    })($notification);

    setTimeout(() => {
      $notification.innerHTML = '';
    }, 5000);
  });

  return Promise.resolve();
}

function isCartEmpty(cart) {
  return cart ? cart.totalQuantity < 1 : true;
}
