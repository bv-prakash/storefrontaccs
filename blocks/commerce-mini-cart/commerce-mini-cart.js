import { render as provider } from '@dropins/storefront-cart/render.js';
import MiniCart from '@dropins/storefront-cart/containers/MiniCart.js';
import { events } from '@dropins/tools/event-bus.js';

import '../../scripts/initializers/cart.js';

import { readBlockConfig } from '../../scripts/aem.js';
import { fetchPlaceholders, rootLink, getProductLink } from '../../scripts/commerce.js';

// Debounce helper to prevent spamming API requests during rapid clicks
function debounce(func, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

// Lazy-loaded and debounced API call for quantity updates
const updateCartQuantity = debounce(async (itemUid, newQuantity, showMessage, MESSAGES) => {
  try {
    const { updateProductsFromCart } = await import('@dropins/storefront-cart/api.js');
    await updateProductsFromCart([{ uid: itemUid, quantity: newQuantity }]);
    if (showMessage && MESSAGES?.UPDATED) {
      showMessage(MESSAGES.UPDATED);
    }
  } catch (error) {
    console.error('Failed to update product quantity:', error);
  }
}, 300);

export default async function decorate(block) {
  const {
    'start-shopping-url': startShoppingURL = '',
    'cart-url': cartURL = '',
    'checkout-url': checkoutURL = '',
    'undo-remove-item': undo = 'false',
  } = readBlockConfig(block);

  // Get translations for custom messages
  const placeholders = await fetchPlaceholders();

  const MESSAGES = {
    ADDED: placeholders?.Global?.MiniCartAddedMessage,
    UPDATED: placeholders?.Global?.MiniCartUpdatedMessage,
  };

  // Create a container for the update message
  const updateMessage = document.createElement('div');
  updateMessage.className = 'commerce-mini-cart__update-message';

  // Create shadow wrapper
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

  // Add event listeners for cart updates
  events.on('cart/product/added', () => showMessage(MESSAGES.ADDED), {
    eager: true,
  });
  events.on('cart/product/updated', () => showMessage(MESSAGES.UPDATED), {
    eager: true,
  });

  // Single Delegated Click Listener for + / - Quantity Stepper
  block.addEventListener('click', (e) => {
    const btn = e.target.closest('.minicart-qty-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const itemEl = btn.closest('.dropin-cart-item');
    if (!itemEl) return;

    // Extract item UID from testid (e.g., cart-list-item-entry-Mjg2)
    const entryTestId = itemEl.getAttribute('data-testid') || '';
    const itemUid = entryTestId.replace('cart-list-item-entry-', '');
    if (!itemUid) return;

    const qtyValEl = itemEl.querySelector('.minicart-qty-val');
    let currentQty = parseInt(qtyValEl?.textContent || '1', 10);

    const action = btn.getAttribute('data-action');
    if (action === 'dec') {
      if (currentQty <= 1) return;
      currentQty -= 1;
    } else if (action === 'inc') {
      currentQty += 1;
    }

    // Instant UI Update to prevent perceived lag
    if (qtyValEl) qtyValEl.textContent = currentQty;

    const decBtn = itemEl.querySelector('.minicart-qty-btn[data-action="dec"]');
    if (decBtn) decBtn.disabled = currentQty <= 1;

    // Trigger debounced network update
    updateCartQuantity(itemUid, currentQty, showMessage, MESSAGES);
  });

  // Prevent mini cart from closing when undo is enabled
  if (undo === 'true') {
    block.addEventListener('click', (e) => {
      const isRemoveButton = e.target.closest('[class*="remove"]')
        || e.target.closest('[data-testid*="remove"]')
        || e.target.closest('[class*="undo"]')
        || e.target.closest('[data-testid*="undo"]');

      if (isRemoveButton) {
        e.stopPropagation();
      }
    });
  }

  block.innerHTML = '';

  // Render MiniCart
  const createProductLink = (product) => getProductLink(product.url.urlKey, product.topLevelSku);
  await provider.render(MiniCart, {
    routeEmptyCartCTA: startShoppingURL ? () => rootLink(startShoppingURL) : undefined,
    routeCart: cartURL ? () => rootLink(cartURL) : undefined,
    routeCheckout: checkoutURL ? () => rootLink(checkoutURL) : undefined,
    routeProduct: createProductLink,
    undo: undo === 'true',
  })(block);

  // Find the products container and add the message div at the top
  const productsContainer = block.querySelector('.cart-mini-cart__products');
  if (productsContainer) {
    productsContainer.insertBefore(shadowWrapper, productsContainer.firstChild);
  } else {
    console.info('Products container not found, appending message to block');
    block.appendChild(shadowWrapper);
  }

  return block;
}
