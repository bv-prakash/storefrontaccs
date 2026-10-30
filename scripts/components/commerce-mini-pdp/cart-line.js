import * as Cart from '@dropins/storefront-cart/api.js';
import { events } from '@dropins/tools/event-bus.js';
import { fetchProductData, setEndpoint } from '@dropins/storefront-pdp/api.js';
import { CS_FETCH_GRAPHQL } from '../../commerce.js';

export function toStorefrontPathSku(sku) {
  if (sku === undefined || sku === null || sku === '') {
    return null;
  }
  return String(sku)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const COMPLEX_CART_ITEM_TYPES = new Set([
  'ConfigurableCartItem',
  'BundleCartItem',
  'DownloadableCartItem',
  'GiftCardCartItem',
]);

export function getCartLineUid(item) {
  return item?.uid || item?.id || null;
}

/**
 * Merges slot / stale line data with the latest cart cache entry (by uid).
 * @param {object} item Cart line from a drop-in slot or event
 * @returns {object}
 */
export function resolveCartLineForDisplay(item) {
  const uid = getCartLineUid(item);
  const line = resolveCartLineItem(item) || item;
  if (!uid) {
    return line;
  }

  const cached = Cart.getCartDataFromCache()?.items?.find(
    (entry) => getCartLineUid(entry) === uid,
  );
  if (!cached) {
    return line;
  }

  const resolved = resolveCartLineItem(cached) || cached;
  return resolveCartLineItem({
    ...resolved,
    ...line,
    selectedOptions: {
      ...(resolved.selectedOptions || {}),
      ...(line.selectedOptions || {}),
    },
    selectedOptionsUIDs: {
      ...(resolved.selectedOptionsUIDs || {}),
      ...(line.selectedOptionsUIDs || {}),
    },
    customizableOptions: line.customizableOptions ?? resolved.customizableOptions,
    bundleOptions: line.bundleOptions ?? resolved.bundleOptions,
    productAttributes: line.productAttributes ?? resolved.productAttributes,
  }) || resolved;
}

export function resolveCartLineItem(item) {
  const uid = getCartLineUid(item);
  if (!item || !uid) return null;

  const sku = item.sku
    || item.configured_variant?.sku
    || item.configuredVariant?.sku
    || item.product?.sku;
  const topLevelSku = item.topLevelSku
    || item.product?.topLevelSku
    || item.product?.sku
    || sku;

  return {
    ...item,
    uid,
    sku,
    topLevelSku,
  };
}

export function resolveCatalogSkuFromCartLine(item) {
  const line = resolveCartLineItem(item) || item;
  if (!line) return null;

  const parentSku = line.topLevelSku || line.product?.topLevelSku;
  const lineSku = line.sku
    || line.configured_variant?.sku
    || line.product?.sku;

  if (COMPLEX_CART_ITEM_TYPES.has(line.itemType)) {
    return parentSku || lineSku || null;
  }

  return lineSku || parentSku || null;
}

function extractSkuFromProductsPath(url) {
  if (!url) return null;
  const match = String(url).match(/\/products\/[^/]+\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

export function getCatalogSkuCandidates(item) {
  const line = resolveCartLineItem(item) || item;
  if (!line) return [];

  const pathSku = extractSkuFromProductsPath(line.canonicalUrl);
  const urlKey = line.url?.urlKey || line.product?.urlKey;

  const ordered = [
    resolveCatalogSkuFromCartLine(line),
    pathSku,
    line.topLevelSku,
    line.product?.topLevelSku,
    urlKey ? toStorefrontPathSku(line.topLevelSku || line.sku) : null,
    line.sku,
    line.product?.sku,
    line.configured_variant?.sku,
    line.configuredVariant?.sku,
    toStorefrontPathSku(line.topLevelSku || line.sku),
    toStorefrontPathSku(line.sku),
  ];

  return [...new Set(
    ordered
      .filter((sku) => sku !== undefined && sku !== null && String(sku).trim() !== '')
      .map((sku) => String(sku).trim()),
  )];
}

export async function resolveCartLineForEdit(cartItem) {
  const uid = getCartLineUid(cartItem);
  if (!uid) {
    throw new Error('Cart line item is not available');
  }

  let line = resolveCartLineItem(cartItem);

  const fromCart = (cartData) => cartData?.items?.find(
    (entry) => getCartLineUid(entry) === uid,
  );

  const cached = fromCart(Cart.getCartDataFromCache());
  if (cached) {
    line = resolveCartLineItem(cached) || line;
  }

  try {
    const cartData = await Cart.getCartData();
    line = resolveCartLineItem(fromCart(cartData)) || line;
  } catch {
    // use cached / slot line
  }

  if (!line) {
    throw new Error('Cart line item is not available');
  }

  if (!getCatalogSkuCandidates(line).length) {
    throw new Error('Product data not available');
  }

  return line;
}

/** @param {object} item Cart line item @returns {string[]} */
export function getCartLineSelectedOptionsUIDs(item) {
  const line = resolveCartLineItem(item) || item;
  if (!line) return [];

  if (line.selectedOptionsUIDs && typeof line.selectedOptionsUIDs === 'object') {
    const uids = Object.values(line.selectedOptionsUIDs).filter(Boolean);
    if (uids.length) return uids;
  }

  return getCartLineCatalogOptionsUIDs(line) || [];
}

export function getCartLineCatalogOptionsUIDs(item) {
  if (!item) return undefined;

  if (item.selectedOptionsUIDs) {
    const uids = Object.values(item.selectedOptionsUIDs).filter(Boolean);
    if (uids.length) return uids;
  }

  if (item.selectedOptions && typeof item.selectedOptions === 'object') {
    const uids = Object.values(item.selectedOptions)
      .map((opt) => opt?.uid
        || opt?.valueUid
        || opt?.configurable_product_option_value_uid)
      .filter(Boolean);
    if (uids.length) return uids;
  }

  if (Array.isArray(item.bundleOptionsUIDs) && item.bundleOptionsUIDs.length) {
    return item.bundleOptionsUIDs;
  }

  if (item.bundleOptions && typeof item.bundleOptions === 'object') {
    const uids = Object.values(item.bundleOptions)
      .flatMap((opt) => (Array.isArray(opt?.values) ? opt.values : [])
        .map((val) => val?.uid)
        .filter(Boolean));
    if (uids.length) return uids;
  }

  return undefined;
}

export function getCartLineEnteredOptions(cartLine, productData) {
  const line = resolveCartLineItem(cartLine) || cartLine;
  const custom = line?.customizableOptions;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom)) {
    return [];
  }

  const inputOptions = productData?.inputOptions ?? [];
  if (!inputOptions.length) {
    return [];
  }

  const entered = [];
  inputOptions.forEach((opt) => {
    const label = opt.title;
    const value = custom[label];
    if (value != null && String(value).trim() !== '') {
      entered.push({ uid: opt.id, value: String(value) });
    }
  });
  return entered;
}

export function formatCartLineOptionDisplayValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    const text = value.value ?? value.valueLabel ?? value.label ?? value.name ?? '';
    return String(text).trim();
  }
  return String(value).trim();
}

function isLikelyOpaqueUid(value) {
  const text = String(value ?? '').trim();
  if (!text || text.includes(' ')) return false;
  return /^[A-Za-z0-9+/=_-]{14,}$/.test(text);
}

function pushCartLineOptionRow(rows, label, value) {
  const cleanLabel = String(label ?? '').trim();
  const display = formatCartLineOptionDisplayValue(value);
  if (!cleanLabel || !display || isLikelyOpaqueUid(display)) return;
  if (rows.some((row) => row.label === cleanLabel)) return;
  rows.push({ label: cleanLabel, value: display });
}

export const CART_LINE_CONFIG_BLOCK_ATTR = 'data-accs-cart-line-config';

/** @param {object} line Resolved cart line item @returns {Record<string, unknown>} */
export function getCartLineConfigurationMap(line) {
  const item = resolveCartLineItem(line) || line;
  if (!item) return {};

  const map = {
    ...(item.bundleOptions && typeof item.bundleOptions === 'object'
      ? item.bundleOptions
      : {}),
    ...(item.selectedOptions && typeof item.selectedOptions === 'object'
      ? item.selectedOptions
      : {}),
  };

  const custom = item.customizableOptions;
  if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
    Object.assign(map, custom);
  }

  if (item.recipient) {
    map.To = item.recipientEmail
      ? `${item.recipient} (${item.recipientEmail})`
      : item.recipient;
  }
  if (item.sender) {
    map.From = item.senderEmail
      ? `${item.sender} (${item.senderEmail})`
      : item.sender;
  }
  if (item.message) {
    map.Message = item.message;
  }

  const { links } = item;
  if (links && typeof links === 'object' && links.result) {
    map.Links = links.result;
  }

  return map;
}

function appendFallbackOptionRows(rows, line) {
  const custom = line.customizableOptions;

  if (line.selectedOptionsUIDs && typeof line.selectedOptionsUIDs === 'object') {
    Object.entries(line.selectedOptionsUIDs).forEach(([label, uid]) => {
      if (!label || uid == null) return;
      if (rows.some((row) => row.label === label)) return;
      const fromSelected = formatCartLineOptionDisplayValue(line.selectedOptions?.[label]);
      if (fromSelected && !isLikelyOpaqueUid(fromSelected)) {
        pushCartLineOptionRow(rows, label, fromSelected);
        return;
      }
      const fromUidMap = formatCartLineOptionDisplayValue(
        typeof uid === 'object' ? uid : line.selectedOptions?.[String(uid)],
      );
      if (fromUidMap && !isLikelyOpaqueUid(fromUidMap)) {
        pushCartLineOptionRow(rows, label, fromUidMap);
      }
    });
  }

  if (Array.isArray(line.productAttributes)) {
    line.productAttributes.forEach((attr) => {
      pushCartLineOptionRow(rows, attr?.label || attr?.name, attr?.value);
    });
  }

  const configurableOptions = line.configurableOptions
    || line.product?.configurableOptions;
  if (Array.isArray(configurableOptions)) {
    configurableOptions.forEach((entry) => {
      pushCartLineOptionRow(
        rows,
        entry?.optionLabel || entry?.label,
        entry?.valueLabel || entry?.value,
      );
    });
  }

  if (Array.isArray(custom)) {
    custom.forEach((entry) => {
      pushCartLineOptionRow(
        rows,
        entry?.optionLabel || entry?.label,
        entry?.valueLabel || entry?.value,
      );
    });
  }
}

export function getCartLineSelectionSummary(cartLine) {
  const line = resolveCartLineItem(cartLine) || cartLine;
  if (!line) return { name: '', rows: [] };

  const rows = [];

  Object.entries(getCartLineConfigurationMap(line)).forEach(([label, value]) => {
    pushCartLineOptionRow(rows, label, value);
  });

  appendFallbackOptionRows(rows, line);

  return {
    name: line.name || line.product?.name || '',
    sku: line.sku || line.topLevelSku,
    rows,
  };
}

/** Stable key for cart/minicart config DOM — skip replace when unchanged. */
export function getCartLineConfigDisplaySignature(cartLine) {
  const { rows } = getCartLineSelectionSummary(cartLine);
  if (!rows.length) return '';
  return rows.map(({ label, value }) => `${label}\u0000${value}`).join('\u0001');
}

/**
 * Renders selected variant / bundle / customizable options for cart and minicart.
 * @param {object} cartLine Cart line item
 * @param {object} [options] CSS class overrides
 * @returns {HTMLUListElement|null}
 */
export function createCartLineConfigurationsListElement(cartLine, options = {}) {
  const { rows } = getCartLineSelectionSummary(cartLine);
  if (!rows.length) return null;

  const {
    listClass = 'cart-cart-summary-table__item-configurations',
    itemClass = 'cart-cart-summary-table__item-configuration',
    labelClass = 'cart-cart-summary-table__item-configuration-label',
    valueClass = 'cart-cart-summary-table__item-configuration-value',
    inlineText = false,
  } = options;

  const list = document.createElement('ul');
  list.className = listClass;
  list.dataset.testid = 'cart-line-configurations';
  list.setAttribute(CART_LINE_CONFIG_BLOCK_ATTR, '');

  rows.forEach(({ label, value }) => {
    const item = document.createElement('li');
    item.className = itemClass;

    if (inlineText) {
      const line = document.createElement('span');
      line.className = valueClass || 'cart-line-option-inline';
      line.textContent = `${label}: ${value}`;
      item.append(line);
    } else {
      const labelEl = document.createElement('span');
      labelEl.className = labelClass;
      labelEl.textContent = `${label}:`;

      const valueEl = document.createElement('span');
      valueEl.className = valueClass;
      valueEl.textContent = value;

      item.append(labelEl, valueEl);
    }

    list.appendChild(item);
  });

  return list;
}

/**
 * Minicart / list layout: div.dropin-cart-item__attributes > span (drop-in shape).
 * @param {object} cartLine
 * @param {object} [options]
 * @returns {HTMLDivElement|null}
 */
export function createCartLineAttributesElement(cartLine, options = {}) {
  const { rows } = getCartLineSelectionSummary(cartLine);
  if (!rows.length) return null;

  const {
    className = 'dropin-cart-item__attributes',
    lineClass = 'dropin-cart-item__attribute-line',
  } = options;

  const root = document.createElement('div');
  root.className = className;
  root.setAttribute(CART_LINE_CONFIG_BLOCK_ATTR, '');

  rows.forEach(({ label, value }) => {
    const span = document.createElement('span');
    span.className = lineClass;
    span.textContent = `${label}: ${value}`;
    root.appendChild(span);
  });

  return root;
}

export function getCartLineConfigurationSnapshot(cartLine, productData) {
  const line = resolveCartLineItem(cartLine) || cartLine;
  return {
    quantity: line?.quantity || 1,
    optionsUIDs: getCartLineSelectedOptionsUIDs(line),
    enteredOptions: getCartLineEnteredOptions(line, productData),
    sku: line?.sku || line?.topLevelSku,
  };
}

function itemHasCustomOptions(item) {
  if (!item?.customizableOptions) return false;
  return Object.keys(item.customizableOptions).length > 0;
}

function itemHasGiftOptions(item) {
  if (!item) return false;
  if (item.giftWrappingAvailable) return true;
  if (item.giftMessageAvailable !== false) return true;
  if (item.productGiftWrapping?.length) return true;
  return !!(item.giftMessage?.message || item.giftMessage?.recipientName);
}

export function shouldOfferCartItemEdit(item, enableUpdatingProduct = 'false') {
  if (!getCartLineUid(item)) return false;

  if (COMPLEX_CART_ITEM_TYPES.has(item.itemType)) {
    return true;
  }

  if (itemHasCustomOptions(item)) {
    return true;
  }

  if (itemHasGiftOptions(item)) {
    return true;
  }

  if (item.bundleOptions || item.selectedOptions) {
    return true;
  }

  if (item.selectedOptionsUIDs && Object.keys(item.selectedOptionsUIDs).length > 0) {
    return true;
  }

  if (enableUpdatingProduct === 'true') {
    return true;
  }

  return item.itemType !== 'SimpleCartItem';
}

function productResponseHasSku(product) {
  return !!(product?.sku || product?.variantSku);
}

async function fetchCatalogProductBySku(catalogSku, itemType) {
  if (!catalogSku) {
    return null;
  }

  setEndpoint(CS_FETCH_GRAPHQL);

  const isBundle = itemType === 'BundleCartItem';
  const product = await fetchProductData(catalogSku, {
    skipTransform: true,
    isBundle,
  });

  return productResponseHasSku(product) ? product : null;
}

async function resolveCatalogSkuViaLiveSearch(seedSku, urlKey) {
  if (!seedSku) {
    return null;
  }

  try {
    await import('../../initializers/search.js');
    const { search, setEndpoint: setSearchEndpoint } = await import('@dropins/storefront-product-discovery/api.js');
    setSearchEndpoint(CS_FETCH_GRAPHQL);

    const phrases = [...new Set([seedSku, urlKey].filter(Boolean))];

    for (let i = 0; i < phrases.length; i += 1) {
      const phrase = phrases[i];
      // eslint-disable-next-line no-await-in-loop
      const result = await search({
        phrase,
        pageSize: 8,
        currentPage: 1,
        filter: [{ attribute: 'visibility', in: ['Catalog', 'Search', 'Catalog, Search'] }],
      });

      const items = result?.items || [];
      const exact = items.find(
        (p) => p.sku && p.sku.toLowerCase() === String(seedSku).toLowerCase(),
      );
      if (exact?.sku) {
        return exact.sku;
      }
      if (items[0]?.sku) {
        return items[0].sku;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function fetchCatalogProductForCartEdit(cartLineItem) {
  const candidates = getCatalogSkuCandidates(cartLineItem);
  const itemType = cartLineItem?.itemType;

  for (let i = 0; i < candidates.length; i += 1) {
    const catalogSku = candidates[i];
    // eslint-disable-next-line no-await-in-loop
    const product = await fetchCatalogProductBySku(catalogSku, itemType);
    if (product) {
      return { product, catalogSku: product.sku || catalogSku };
    }
  }

  const searchSku = await resolveCatalogSkuViaLiveSearch(
    candidates[0],
    cartLineItem?.url?.urlKey,
  );
  if (searchSku) {
    const product = await fetchCatalogProductBySku(searchSku, itemType);
    if (product) {
      return { product, catalogSku: product.sku || searchSku };
    }
  }

  return null;
}

export function cartHasLineItems(cartData) {
  if (!cartData) return false;
  if (Array.isArray(cartData.items) && cartData.items.length > 0) {
    return true;
  }
  return (cartData.totalQuantity ?? 0) > 0;
}

/**
 * Drop-in update responses can be sparse; cart/data and getCartData hold the truth.
 * @param {object|null} initialCart First value from updateProductsFromCart
 * @returns {Promise<object|null>}
 */
function cartLineUidIsGone(cartData, lineUid) {
  if (!lineUid) return true;
  if (!cartData?.items?.length) return true;
  return !cartData.items.some((item) => getCartLineUid(item) === lineUid);
}

function isCartReadyAfterUpdate(cartData, { removedUid } = {}) {
  if (!cartHasLineItems(cartData)) return false;
  if (!cartLineUidIsGone(cartData, removedUid)) return false;
  return true;
}

/**
 * Waits until a cart line uid no longer appears (after quantity 0 remove).
 * @param {string} lineUid
 * @param {number} [timeoutMs]
 * @returns {Promise<object|null>}
 */
export async function waitForCartLineRemoved(lineUid, timeoutMs = 5000) {
  if (!lineUid) {
    return Cart.getCartDataFromCache();
  }

  const cached = Cart.getCartDataFromCache();
  if (cartLineUidIsGone(cached, lineUid)) {
    return cached;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription;
    let timer;

    const finish = (data) => {
      if (settled) return;
      settled = true;
      subscription?.off?.();
      clearTimeout(timer);
      resolve(data || Cart.getCartDataFromCache());
    };

    subscription = events.on('cart/data', (data) => {
      if (cartLineUidIsGone(data, lineUid)) {
        finish(data);
      }
    }, { eager: true });

    timer = setTimeout(async () => {
      try {
        const fresh = await Cart.getCartData();
        if (cartLineUidIsGone(fresh, lineUid)) {
          finish(fresh);
        } else {
          reject(new Error('Cart line was not removed in time'));
        }
      } catch (error) {
        reject(error);
      }
    }, timeoutMs);
  });
}

/**
 * Drop-in update responses can be sparse; cart/data and getCartData hold the truth.
 * @param {object|null} initialCart First value from updateProductsFromCart
 * @param {object} [options]
 * @param {string} [options.removedUid] Original line uid that must disappear (reconfigure)
 * @returns {Promise<object|null>}
 */
export async function waitForCartRefreshAfterUpdate(initialCart = null, options = {}) {
  const { removedUid } = options;

  if (isCartReadyAfterUpdate(initialCart, { removedUid })) {
    return initialCart;
  }

  const cached = Cart.getCartDataFromCache();
  if (isCartReadyAfterUpdate(cached, { removedUid })) {
    return cached;
  }

  return new Promise((resolve) => {
    let settled = false;
    let subscription;
    let timer;

    const finish = (data) => {
      if (settled) return;
      settled = true;
      subscription?.off?.();
      clearTimeout(timer);
      resolve(data || Cart.getCartDataFromCache() || initialCart);
    };

    subscription = events.on('cart/data', (data) => {
      if (isCartReadyAfterUpdate(data, { removedUid })) {
        finish(data);
      }
    }, { eager: true });

    timer = setTimeout(async () => {
      try {
        finish(await Cart.getCartData());
      } catch {
        finish(Cart.getCartDataFromCache() || initialCart);
      }
    }, 1500);
  });
}
