import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import GiftOptions from '@dropins/storefront-cart/containers/GiftOptions.js';
import { render as CartProvider } from '@dropins/storefront-cart/render.js';
import {
  CART_LINE_CONFIG_BLOCK_ATTR,
  createCartLineAttributesElement,
  createCartLineConfigurationsListElement,
  getCartLineConfigDisplaySignature,
  getCartLineUid,
  resolveCartLineForDisplay,
} from './components/commerce-mini-pdp/cart-line.js';

const cartLineDisplayRefreshByUid = new Map();
let cartLineDisplayRefreshFrame = null;

function scheduleCartLineDisplayRefresh() {
  if (cartLineDisplayRefreshFrame != null) {
    return;
  }
  cartLineDisplayRefreshFrame = requestAnimationFrame(() => {
    cartLineDisplayRefreshFrame = null;
    cartLineDisplayRefreshByUid.forEach((refresh) => refresh());
  });
}

let cartLineDisplaySyncStarted = false;

function ensureCartLineDisplaySync() {
  if (cartLineDisplaySyncStarted) {
    return;
  }
  cartLineDisplaySyncStarted = true;
  events.on('cart/data', () => {
    scheduleCartLineDisplayRefresh();
  }, { eager: false });
}

export function isGiftCardCartItem(item) {
  return item?.itemType === 'GiftCardCartItem';
}

function createCartLineGiftLoadingHandlers(ctx) {
  const uid = getCartLineUid(ctx.item);

  return {
    handleItemsLoading: (itemUid, state) => {
      const id = itemUid || uid;
      if (typeof ctx.setItemUpdating === 'function') {
        ctx.setItemUpdating(id, state);
        return;
      }
      if (typeof ctx.handleItemsLoading === 'function') {
        ctx.handleItemsLoading(state);
      }
    },
    handleItemsError: (itemUid, message) => {
      const id = itemUid || uid;
      if (typeof ctx.setItemUpdateError === 'function') {
        ctx.setItemUpdateError(id, message || '');
        return;
      }
      if (typeof ctx.handleItemsError === 'function') {
        ctx.handleItemsError(itemUid, message);
      }
    },
    onItemUpdate: ctx.onItemUpdate,
  };
}

/**
 * Swatch slot for gift wrapping designs (cart GiftOptions container).
 * @param {object} ctx Drop-in slot context
 */
export function renderGiftOptionsSwatchImage(ctx) {
  const { imageSwatchContext, defaultImageProps } = ctx;
  tryRenderAemAssetsImage(ctx, {
    alias: imageSwatchContext.label,
    imageProps: defaultImageProps,
    wrapper: document.createElement('span'),
    params: {
      width: defaultImageProps.width,
      height: defaultImageProps.height,
    },
  });
}

const TRUTHY = new Set(['true', 'yes', '1', 'on']);
const FALSY = new Set(['false', 'no', '0', 'off']);

export function parseBlockFlag(value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (TRUTHY.has(normalized)) {
    return true;
  }
  if (FALSY.has(normalized)) {
    return false;
  }
  return defaultValue;
}

export function isCartEmpty(cartData) {
  return !cartData || cartData.totalQuantity < 1;
}

/**
 * Ensures cart drop-in finished loading store config + cart before GiftOptions mount.
 * @returns {Promise<object|null>}
 */
export async function ensureCartReady() {
  await import('./initializers/cart.js');
  const { initializeCart, getCartDataFromCache } = await import(
    '@dropins/storefront-cart/api.js'
  );

  const cached = getCartDataFromCache();
  if (cached?.id) {
    return cached;
  }

  try {
    return await initializeCart();
  } catch (error) {
    console.error('Cart initialization failed before gift options:', error);
    return null;
  }
}

/**
 * Shared props for editable order-level gift options on cart / checkout.
 * @param {object} [overrides]
 */
export function buildOrderGiftOptionsProps(overrides = {}) {
  return {
    view: 'order',
    dataSource: 'cart',
    isEditable: true,
    readOnlyFormOrderView: 'primary',
    initialLoading: false,
    slots: {
      SwatchImage: renderGiftOptionsSwatchImage,
    },
    ...overrides,
  };
}

/**
 * @param {Element} mount
 * @param {object} [overrides]
 */
/**
 * Per-line gift options for cart grid / minicart footer slot.
 * @param {object} ctx
 * @param {HTMLElement} target
 */
export function renderCartLineGiftOptions(ctx, target) {
  if (!ctx?.item || isGiftCardCartItem(ctx.item)) {
    return false;
  }

  target.classList.add('cart-line-item__gift-options', 'cart-gift-options-view');

  const handlers = createCartLineGiftLoadingHandlers(ctx);

  CartProvider.render(GiftOptions, {
    item: ctx.item,
    view: 'product',
    dataSource: 'cart',
    isEditable: true,
    readOnlyFormOrderView: 'primary',
    initialLoading: false,
    ...handlers,
    slots: {
      SwatchImage: renderGiftOptionsSwatchImage,
    },
  })(target);
  return true;
}

/**
 * Builds variant / option rows + optional gift options for a cart line slot.
 * @param {object} ctx Drop-in slot context
 * @param {object} [options]
 * @returns {HTMLElement|null}
 */
export function buildCartLineConfigurationBlock(ctx, options = {}) {
  const {
    listClass,
    itemClass,
    labelClass,
    valueClass,
    blockClass = 'cart-line-item-configuration-block',
    extrasClass = 'cart-line-item-extras',
    includeGiftOptions = true,
  } = options;

  const lineItem = resolveCartLineForDisplay(ctx.item);

  const block = document.createElement('div');
  block.className = blockClass;
  block.setAttribute(CART_LINE_CONFIG_BLOCK_ATTR, '');

  const list = createCartLineConfigurationsListElement(lineItem, {
    listClass,
    itemClass,
    labelClass,
    valueClass,
    inlineText: options.inlineText,
  });
  if (list) {
    block.appendChild(list);
  }

  if (includeGiftOptions) {
    const extra = document.createElement('div');
    extra.className = extrasClass;

    if (isGiftCardCartItem(ctx.item)) {
      extra.classList.add('cart-line-item-extras--gift-card');
    }

    const giftMount = document.createElement('div');
    if (renderCartLineGiftOptions(ctx, giftMount)) {
      extra.appendChild(giftMount);
      block.appendChild(extra);
    }
  }

  return block.childElementCount ? block : null;
}

/**
 * Appends gift-only extras under a cart / minicart line slot.
 * @param {object} ctx
 * @param {object} [options]
 */
export function appendCartLineGiftExtras(ctx, options = {}) {
  const { wrapperClass = 'minicart-item-extra' } = options;

  const extra = document.createElement('div');
  extra.className = wrapperClass;

  if (isGiftCardCartItem(ctx.item)) {
    extra.classList.add('cart-line-item-extras--gift-card');
  }

  const giftMount = document.createElement('div');
  if (renderCartLineGiftOptions(ctx, giftMount)) {
    extra.appendChild(giftMount);
  }

  if (extra.childElementCount > 0) {
    ctx.appendChild(extra);
    return true;
  }
  return false;
}

/** @param {object} ctx Drop-in slot context @param {object} [options] */
export function mountCartLineConfigurationDetails(ctx, options = {}) {
  ensureCartLineDisplaySync();

  const {
    variant = 'table',
    useReplace = true,
    ...blockOptions
  } = options;

  let mountedNode = null;
  let lastSignature = '';
  let activeCtxRef = ctx;

  const clearMountedNode = () => {
    if (mountedNode?.isConnected) {
      mountedNode.remove();
    }
    mountedNode = null;
    lastSignature = '';
  };

  const mount = (nextCtx = activeCtxRef) => {
    if (nextCtx) {
      activeCtxRef = nextCtx;
    }
    const lineItem = resolveCartLineForDisplay(activeCtxRef.item);
    const lineUid = getCartLineUid(lineItem);
    const signature = getCartLineConfigDisplaySignature(lineItem);

    if (!signature) {
      if (lineUid) {
        cartLineDisplayRefreshByUid.delete(lineUid);
      }
      clearMountedNode();
      return false;
    }

    if (signature === lastSignature && mountedNode?.isConnected) {
      return true;
    }

    const node = variant === 'attributes'
      ? createCartLineAttributesElement(lineItem, blockOptions)
      : buildCartLineConfigurationBlock({ ...activeCtxRef, item: lineItem }, blockOptions);

    if (!node) {
      if (lineUid) {
        cartLineDisplayRefreshByUid.delete(lineUid);
      }
      clearMountedNode();
      return false;
    }

    if (lineUid) {
      node.dataset.accsCartLineUid = lineUid;
    }

    if (mountedNode && mountedNode !== node && mountedNode.isConnected) {
      mountedNode.remove();
    }

    if (useReplace && typeof activeCtxRef.replaceWith === 'function') {
      activeCtxRef.replaceWith(node);
      mountedNode = node;
      lastSignature = signature;
      return true;
    }

    if (typeof activeCtxRef.prependChild === 'function') {
      activeCtxRef.prependChild(node);
      mountedNode = node;
      lastSignature = signature;
      return true;
    }

    return false;
  };

  mount(ctx);

  const lineUid = getCartLineUid(resolveCartLineForDisplay(ctx.item));
  if (lineUid) {
    cartLineDisplayRefreshByUid.set(lineUid, () => {
      mount(activeCtxRef);
    });
  }

  if (typeof ctx.onRender === 'function') {
    ctx.onRender((next) => {
      mount(next);
    });
  }

  return true;
}

export function bindCartGiftOptionsVisibility(mount, overrides = {}) {
  const { hideWhenEmpty = true } = overrides;

  if (!hideWhenEmpty) {
    return;
  }

  events.on(
    'cart/data',
    (cartData) => {
      mount.toggleAttribute('hidden', isCartEmpty(cartData));
    },
    { eager: true },
  );
}
