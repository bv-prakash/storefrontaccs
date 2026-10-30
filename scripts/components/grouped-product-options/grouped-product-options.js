import { events } from '@dropins/tools/event-bus.js';
import {
  getProductData,
  setProductConfigurationValid,
} from '@dropins/storefront-pdp/api.js';

const quantitiesByScope = new Map();

function scopeKey(scope) {
  return scope || '__default__';
}

function getQuantitiesMap(scope) {
  const key = scopeKey(scope);
  if (!quantitiesByScope.has(key)) {
    quantitiesByScope.set(key, new Map());
  }
  return quantitiesByScope.get(key);
}

export function isGroupedProduct(productData) {
  const options = productData?.options;
  if (!options?.length) return false;
  if (options.length !== 1) return false;

  const [option] = options;
  if (option.multiple) return false;

  const items = option.items ?? [];
  if (items.length < 2) return false;

  return items.every((item) => item.product?.sku);
}

function formatPrice(amount, currency = 'USD') {
  if (amount == null || Number.isNaN(Number(amount))) return '';
  try {
    return new Intl.NumberFormat(document.documentElement.lang, {
      style: 'currency',
      currency,
    }).format(Number(amount));
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

async function loadDefaultQuantities(sku) {
  try {
    const raw = await getProductData(sku, { skipTransform: true });
    const values = raw?.options?.[0]?.values ?? [];
    const defaults = new Map();
    values.forEach((value) => {
      const childSku = value?.product?.sku;
      if (!childSku) return;
      const qty = Number(value.quantity);
      defaults.set(
        childSku,
        Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0,
      );
    });
    return defaults;
  } catch {
    return new Map();
  }
}

function createQtyControl(qty, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'pdp-grouped-products__qty';

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'pdp-grouped-products__qty-btn';
  minus.setAttribute('aria-label', 'Decrease quantity');
  minus.textContent = '−';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = '1';
  input.className = 'pdp-grouped-products__qty-input';
  input.value = String(qty);
  input.setAttribute('aria-label', 'Quantity');

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'pdp-grouped-products__qty-btn';
  plus.setAttribute('aria-label', 'Increase quantity');
  plus.textContent = '+';

  const apply = (next) => {
    const parsed = Math.max(0, Math.floor(Number(next) || 0));
    input.value = String(parsed);
    onChange(parsed);
  };

  minus.addEventListener('click', () => apply(Number(input.value) - 1));
  plus.addEventListener('click', () => apply(Number(input.value) + 1));
  input.addEventListener('change', () => apply(input.value));
  input.addEventListener('blur', () => apply(input.value));

  wrap.append(minus, input, plus);
  return wrap;
}

function syncGroupedValidity(scope, productData) {
  const scopeOpt = scope ? { scope } : undefined;
  const map = getQuantitiesMap(scope);
  const items = productData?.options?.[0]?.items ?? [];
  const hasQty = items.some((item) => (map.get(item.product?.sku) ?? 0) > 0);
  setProductConfigurationValid(() => hasQty, scopeOpt);
}

export function buildGroupedCartLines(productData, scope) {
  if (!isGroupedProduct(productData)) return [];

  const parentSku = productData.sku;
  const map = getQuantitiesMap(scope);
  const items = productData.options[0].items ?? [];

  return items
    .map((item) => {
      const quantity = map.get(item.product.sku) ?? 0;
      if (quantity <= 0) return null;
      return {
        sku: item.product.sku,
        quantity,
        parentSku,
      };
    })
    .filter(Boolean);
}

export function mountGroupedProductOptions(container, options = {}) {
  if (!container) return () => {};

  const {
    scope,
    optionsContainer,
    quantityContainer,
  } = options;
  const eventScopeOpt = scope ? { eager: true, scope } : { eager: true };

  let activeSku = null;
  let latestProductData = null;

  const toggleAuxiliaryUi = (grouped) => {
    optionsContainer?.classList.toggle('product-details__options--hidden', grouped);
    quantityContainer?.classList.toggle('product-details__quantity--hidden', grouped);
    container.classList.toggle('pdp-grouped-products--empty', !grouped);
  };

  const renderGrouped = async (productData) => {
    latestProductData = productData;

    if (!isGroupedProduct(productData)) {
      toggleAuxiliaryUi(false);
      container.replaceChildren();
      return;
    }

    toggleAuxiliaryUi(true);

    const items = productData.options[0].items ?? [];
    const map = getQuantitiesMap(scope);

    if (activeSku !== productData.sku) {
      activeSku = productData.sku;
      map.clear();
      items.forEach((item) => map.set(item.product.sku, 0));
      const defaults = await loadDefaultQuantities(productData.sku);
      defaults.forEach((qty, childSku) => map.set(childSku, qty));
    }

    container.replaceChildren();

    const heading = document.createElement('p');
    heading.className = 'pdp-grouped-products__heading';
    heading.textContent = productData.options[0].label || 'Items in this set';

    const list = document.createElement('ul');
    list.className = 'pdp-grouped-products__list';

    items.forEach((item) => {
      const child = item.product;
      const row = document.createElement('li');
      row.className = 'pdp-grouped-products__row';

      const info = document.createElement('div');
      info.className = 'pdp-grouped-products__info';

      const name = document.createElement('span');
      name.className = 'pdp-grouped-products__name';
      name.textContent = child.name || item.label || child.sku;

      info.append(name);

      const priceValue = child.price?.final?.amount?.value
        ?? child.price?.regular?.amount?.value;
      const currency = child.price?.final?.amount?.currency
        ?? child.price?.regular?.amount?.currency
        ?? 'USD';
      if (priceValue != null) {
        const price = document.createElement('span');
        price.className = 'pdp-grouped-products__price';
        price.textContent = formatPrice(priceValue, currency);
        info.append(price);
      }

      const qty = map.get(child.sku) ?? 0;
      const qtyControl = createQtyControl(qty, (next) => {
        map.set(child.sku, next);
        syncGroupedValidity(scope, productData);
      });

      row.append(info, qtyControl);
      list.append(row);
    });

    container.append(heading, list);
    syncGroupedValidity(scope, productData);
  };

  const dataListener = events.on('pdp/data', (productData) => {
    if (productData) renderGrouped(productData);
  }, eventScopeOpt);

  const validListener = events.on('pdp/valid', () => {
    if (latestProductData && isGroupedProduct(latestProductData)) {
      syncGroupedValidity(scope, latestProductData);
    }
  }, eventScopeOpt);

  return () => {
    dataListener?.off();
    validListener?.off();
    quantitiesByScope.delete(scopeKey(scope));
  };
}
