import * as Cart from '@dropins/storefront-cart/api.js';
import { events } from '@dropins/tools/event-bus.js';
import {
  getProductConfigurationValues,
  setProductConfigurationValues,
  setProductConfigurationValid,
} from '@dropins/storefront-pdp/api.js';
import {
  buildGroupedCartLines,
  isGroupedProduct,
} from '../grouped-product-options/grouped-product-options.js';
import {
  getCartLineEnteredOptions,
  getCartLineSelectedOptionsUIDs,
  getCartLineUid,
  waitForCartLineRemoved,
} from '../commerce-mini-pdp/cart-line.js';

const SUPPORTED_TYPES = new Set([
  'textfield',
  'textarea',
  'field',
  'date',
  'date_time',
  'time',
  'number',
]);

function findAcAttribute(attributes, id) {
  return attributes?.find(
    (item) => item.id === id || item.name === id,
  );
}

function findAcCustomizableAttribute(attributes) {
  return findAcAttribute(attributes, 'ac_customizable_options');
}

function hasAcDownloadable(attributes) {
  return Boolean(findAcAttribute(attributes, 'ac_downloadable'));
}

function hasAcGiftCard(attributes) {
  return Boolean(findAcAttribute(attributes, 'ac_giftcard'));
}

function parseAcCustomizableOptions(attributes) {
  const attr = findAcCustomizableAttribute(attributes);
  if (!attr?.value) return [];

  let data = attr.value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }

  const selectable = data?.selectable ?? [];
  return selectable
    .filter((group) => (group.renderType || 'drop_down') === 'drop_down')
    .map((group) => ({
      id: String(group.id),
      label: group.label || 'Option',
      required: group.required === '1' || group.required === true,
      values: (group.values ?? []).map((value) => ({
        id: value.id,
        label: value.label,
      })),
    }))
    .filter((group) => group.values.length > 0);
}

function hasAcCustomizableOptions(attributes) {
  return parseAcCustomizableOptions(attributes).length > 0;
}

function sortInputOptions(options = []) {
  return [...options].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
}

function getEnteredValue(enteredOptions, uid) {
  return enteredOptions.find((item) => item.uid === uid)?.value ?? '';
}

function mergeEnteredOption(enteredOptions, uid, value) {
  const list = enteredOptions ?? [];
  const index = list.findIndex((item) => item.uid === uid);
  if (index === -1) {
    return [...list, { uid, value }];
  }
  return list.map((item) => (item.uid === uid ? { ...item, value } : item));
}

function validateInputOptions(inputOptions, enteredOptions) {
  return sortInputOptions(inputOptions).every((option) => {
    if (!option.required) return true;
    const value = getEnteredValue(enteredOptions, option.id);
    return String(value ?? '').trim() !== '';
  });
}

function validateCustomGroups(customGroups, optionsUIDs) {
  const selected = new Set(optionsUIDs ?? []);
  return customGroups.every((group) => {
    if (!group.required) return true;
    return group.values.some((value) => selected.has(value.id));
  });
}

function getSelectedValueIdForGroup(group, optionsUIDs) {
  const ids = new Set(group.values.map((value) => value.id));
  return (optionsUIDs ?? []).find((uid) => ids.has(uid)) ?? '';
}

function updateGroupSelection(group, valueId, scopeOpt) {
  const groupValueIds = new Set(group.values.map((value) => value.id));
  setProductConfigurationValues((prev) => {
    const current = (prev?.optionsUIDs ?? []).filter(Boolean);
    const withoutGroup = current.filter((uid) => !groupValueIds.has(uid));
    const nextUids = valueId ? [...withoutGroup, valueId] : withoutGroup;
    return { ...prev, optionsUIDs: nextUids };
  }, scopeOpt);
}

export function resetConfigurationForSimpleProduct(productData, scope) {
  if (!productData) return;
  if (isGroupedProduct(productData)) return;
  if (productData?.options?.length || productData?.isBundle) return;
  if (hasAcCustomizableOptions(productData.attributes)) return;
  if (hasAcDownloadable(productData.attributes)) return;
  if (hasAcGiftCard(productData.attributes)) return;

  const scopeOpt = scope ? { scope } : undefined;
  setProductConfigurationValues((prev) => {
    const next = {
      ...prev,
      sku: productData.variantSku || productData.sku || prev?.sku,
    };
    if (prev?.optionsUIDs?.length) {
      delete next.optionsUIDs;
    }
    return next;
  }, scopeOpt);
}

function resolveCartSku(values, productData) {
  if (productData?.isBundle) {
    return productData?.sku || values.sku;
  }
  return productData?.variantSku || values.sku;
}

function shouldAttachOptionsUIDs(values, productData) {
  const uids = (values.optionsUIDs ?? []).filter(Boolean);
  if (!uids.length) return false;
  if (isGroupedProduct(productData)) return false;
  if (productData?.options?.length || productData?.isBundle) return true;
  if (hasAcCustomizableOptions(productData?.attributes)) return true;
  if (hasAcDownloadable(productData?.attributes)) return true;
  return false;
}

function buildAddToCartPayload(values, productData) {
  if (!productData) {
    throw new Error('Product configuration is not loaded yet. Please wait and try again.');
  }
  if (!values?.sku) {
    throw new Error('Product SKU is missing.');
  }

  const payload = {
    sku: resolveCartSku(values, productData),
    quantity: values.quantity || 1,
  };

  if (shouldAttachOptionsUIDs(values, productData)) {
    payload.optionsUIDs = (values.optionsUIDs ?? []).filter(Boolean);
  }

  const enteredOptions = values.enteredOptions?.filter(
    (option) => option?.uid && String(option.value ?? '').trim() !== '',
  );
  if (enteredOptions?.length) {
    payload.enteredOptions = enteredOptions;
  }

  return payload;
}

export function buildCartLinesForAddToCart(values, productData, scope) {
  if (!productData) {
    throw new Error('Product configuration is not loaded yet. Please wait and try again.');
  }
  if (isGroupedProduct(productData)) {
    const lines = buildGroupedCartLines(productData, scope);
    if (!lines.length) {
      throw new Error('Please add at least one item to the group.');
    }
    return lines;
  }
  return [buildAddToCartPayload(values, productData)];
}

function normalizeOptionUidSet(uids) {
  return [...new Set((uids || []).filter(Boolean))].sort().join('|');
}

function collectVariantOptionValueIds(productData) {
  const ids = new Set();
  (productData?.options ?? []).forEach((option) => {
    (option.values ?? []).forEach((value) => {
      if (value?.id) ids.add(String(value.id));
      if (value?.uid) ids.add(String(value.uid));
    });
  });
  return ids;
}

function optionValueMatchesUid(value, uid) {
  if (!value || uid == null) return false;
  const needle = String(uid);
  return [value.id, value.uid, value.sku]
    .filter((entry) => entry != null && String(entry).trim() !== '')
    .some((entry) => String(entry) === needle);
}

function findVariantOptionValue(uid, productData) {
  const needle = String(uid);
  return (productData?.options ?? [])
    .flatMap((option) => option.values ?? [])
    .find((value) => optionValueMatchesUid(value, needle));
}

function findCustomOptionValue(uid, productData) {
  const needle = String(uid);
  return parseAcCustomizableOptions(productData?.attributes)
    .flatMap((group) => group.values ?? [])
    .find((value) => value.id === needle || String(value.id) === needle);
}

/**
 * Map a configuration value to the UID string the cart GraphQL API expects.
 * When the cart line already stores a matching UID, reuse that exact string so
 * drop-in in-place updates do not treat the line as remove-and-re-add.
 */
function resolveOptionValueApiUid(uid, productData, cartLine = null) {
  if (uid == null || uid === '') return null;
  const needle = String(uid);
  const cartUids = cartLine ? getCartLineSelectedOptionsUIDs(cartLine) : [];

  const variantValue = findVariantOptionValue(needle, productData);
  if (variantValue) {
    const cartMatch = cartUids.find((cartUid) => optionValueMatchesUid(variantValue, cartUid));
    if (cartMatch) return String(cartMatch);
    return String(variantValue.uid ?? variantValue.id ?? needle);
  }

  const customValue = findCustomOptionValue(needle, productData);
  if (customValue) {
    const cartMatch = cartUids.find(
      (cartUid) => cartUid === customValue.id || String(cartUid) === String(customValue.id),
    );
    if (cartMatch) return String(cartMatch);
    return String(customValue.id);
  }

  const cartExact = cartUids.find((cartUid) => String(cartUid) === needle);
  return cartExact ? String(cartExact) : needle;
}

function canonicalizeOptionsUIDs(uids, productData, cartLine = null) {
  return [...new Set(
    (uids ?? [])
      .map((uid) => resolveOptionValueApiUid(uid, productData, cartLine))
      .filter(Boolean),
  )];
}

function optionUidSetsEquivalent(cartUids, formUids, productData, cartLine = null) {
  const cart = canonicalizeOptionsUIDs(cartUids, productData, cartLine);
  const form = canonicalizeOptionsUIDs(formUids, productData, cartLine);
  return normalizeOptionUidSet(cart) === normalizeOptionUidSet(form);
}

/** Public alias for Quick View / cart edit / cart display comparisons. */
export function areOptionUidSetsEquivalent(cartUids, formUids, productData, cartLine = null) {
  return optionUidSetsEquivalent(cartUids, formUids, productData, cartLine);
}

/**
 * Maps cart or GraphQL option UIDs to PDP configuration IDs (swatch / picker values).
 * @param {string[]} uids
 * @param {object} productData
 * @returns {string[]}
 */
export function mapOptionsUIDsForPdpConfiguration(uids, productData, cartLine = null) {
  const cartUids = cartLine ? getCartLineSelectedOptionsUIDs(cartLine) : [];

  return [...new Set(
    (uids ?? []).map((uid) => {
      const needle = String(uid);
      let variantValue = findVariantOptionValue(needle, productData);
      if (!variantValue && cartUids.length) {
        const matchedCartUid = cartUids.find(
          (cartUid) => findVariantOptionValue(String(cartUid), productData),
        );
        if (matchedCartUid) {
          variantValue = findVariantOptionValue(String(matchedCartUid), productData);
        }
      }
      if (variantValue) {
        return String(variantValue.id ?? variantValue.uid ?? needle);
      }
      const customValue = findCustomOptionValue(needle, productData);
      if (customValue?.id) return String(customValue.id);
      return needle;
    }).filter(Boolean),
  )];
}

function mergeVariantOptionUids(formUids, cartUids, productData, cartLine = null) {
  const options = productData?.options ?? [];
  if (!options.length) {
    return [];
  }

  const picked = [];
  options.forEach((option) => {
    const values = option.values ?? [];
    const pickFrom = (list) => list.find(
      (uid) => values.some((value) => optionValueMatchesUid(value, uid)),
    );
    const fromForm = pickFrom(formUids ?? []);
    const fromCart = pickFrom(cartUids ?? []);
    const chosen = fromForm ?? fromCart;
    if (chosen) {
      picked.push(resolveOptionValueApiUid(chosen, productData, cartLine));
    }
  });
  return picked.filter(Boolean);
}

function cartLineSatisfiesVariantOptions(cartLine, productData) {
  const options = productData?.options ?? [];
  if (!options.length) {
    return true;
  }
  const cartUids = getCartLineSelectedOptionsUIDs(cartLine);
  if (!cartUids.length) {
    return false;
  }
  return options.every((option) => (option.values ?? []).some(
    (value) => cartUids.some((uid) => optionValueMatchesUid(value, uid)),
  ));
}

export function filterVariantOptionsUIDs(uids, productData) {
  const all = (uids ?? []).filter(Boolean);
  const variantIds = collectVariantOptionValueIds(productData);
  if (!variantIds.size) return all;
  return all.filter((uid) => variantIds.has(String(uid)));
}

export function isVariantOptionsComplete(productData, values) {
  const options = productData?.options ?? [];
  if (!options.length) {
    return true;
  }
  const selected = new Set(filterVariantOptionsUIDs(values?.optionsUIDs, productData));
  return options.every((option) => (option.values ?? []).some(
    (value) => [value?.id, value?.uid].filter(Boolean).some((id) => selected.has(String(id))),
  ));
}

function isVariantSelectionSatisfied(productData, values, cartLine) {
  if (isVariantOptionsComplete(productData, values)) {
    return true;
  }
  if (!cartLine || !cartLineSatisfiesVariantOptions(cartLine, productData)) {
    return false;
  }

  const nextVariantUids = filterVariantOptionsUIDs(values?.optionsUIDs, productData);
  if (!nextVariantUids.length) {
    return true;
  }

  const cartAllUids = getCartLineSelectedOptionsUIDs(cartLine);
  const cartVariantUids = filterVariantOptionsUIDs(cartAllUids, productData);
  const cartUids = cartVariantUids.length ? cartVariantUids : cartAllUids;

  return optionUidSetsEquivalent(nextVariantUids, cartUids, productData, cartLine);
}

export function isCartEditConfigurationReady(productData, values, cartLine = null) {
  if (!productData) {
    return false;
  }
  if (!isVariantSelectionSatisfied(productData, values, cartLine)) {
    return false;
  }

  const inputOptions = sortInputOptions(productData?.inputOptions ?? []).filter(
    (option) => SUPPORTED_TYPES.has((option.type || 'textfield').toLowerCase())
      || option.type == null,
  );
  if (inputOptions.length) {
    let entered = values?.enteredOptions ?? [];
    if (!entered.length && cartLine) {
      entered = getCartLineEnteredOptions(cartLine, productData);
    }
    if (!validateInputOptions(inputOptions, entered)) {
      return false;
    }
  }

  const customGroups = parseAcCustomizableOptions(productData?.attributes);
  if (customGroups.length) {
    const formUids = (values?.optionsUIDs ?? []).filter(Boolean);
    const cartUids = cartLine ? getCartLineSelectedOptionsUIDs(cartLine) : [];
    const optionUids = formUids.length
      ? [...formUids, ...cartUids.filter((uid) => !formUids.includes(uid))]
      : cartUids;
    if (!validateCustomGroups(customGroups, optionUids)) {
      return false;
    }
  }

  return true;
}

export function getCartLineCustomizableOptionsUIDs(cartLine, productData) {
  const groups = parseAcCustomizableOptions(productData?.attributes);
  const custom = cartLine?.customizableOptions;
  if (!groups.length || !custom || typeof custom !== 'object') {
    return [];
  }

  const uids = [];
  groups.forEach((group) => {
    const raw = custom[group.label] ?? custom[group.id];
    if (raw == null || String(raw).trim() === '') return;
    const needle = String(raw).trim();
    const match = group.values.find(
      (value) => value.id === needle
        || value.label === needle
        || String(value.label).toLowerCase() === needle.toLowerCase(),
    );
    if (match?.id) uids.push(match.id);
  });
  return uids;
}

function normalizeEnteredOptions(entered) {
  return (entered ?? [])
    .filter((entry) => entry?.uid && String(entry.value ?? '').trim() !== '')
    .map((entry) => `${entry.uid}:${String(entry.value).trim()}`)
    .sort()
    .join('|');
}

function mergeCartEditConfigurationValues(values, cartLine, productData) {
  const base = { ...(values ?? {}) };
  const cartOptionUids = getCartLineSelectedOptionsUIDs(cartLine);
  const formUids = (base.optionsUIDs ?? []).filter(Boolean);
  const variantIds = collectVariantOptionValueIds(productData);

  if (cartOptionUids.length || formUids.length) {
    const formVariant = filterVariantOptionsUIDs(formUids, productData);
    const formExtra = formUids.filter((uid) => !variantIds.has(String(uid)));
    const cartExtra = cartOptionUids.filter((uid) => !variantIds.has(String(uid)));

    let nextVariant = mergeVariantOptionUids(formUids, cartOptionUids, productData, cartLine);
    if (isVariantOptionsComplete(productData, { optionsUIDs: formVariant })) {
      nextVariant = canonicalizeOptionsUIDs(formVariant, productData, cartLine);
    }

    const nextExtra = formExtra.length
      ? canonicalizeOptionsUIDs(formExtra, productData, cartLine)
      : canonicalizeOptionsUIDs(cartExtra, productData, cartLine);

    const merged = [...nextVariant, ...new Set(nextExtra)];
    base.optionsUIDs = merged.length ? merged : undefined;
  }

  base.sku = base.sku
    || productData?.variantSku
    || productData?.sku
    || cartLine?.sku;
  base.quantity = base.quantity ?? cartLine?.quantity ?? 1;

  if (!base.enteredOptions?.length) {
    const fromCart = getCartLineEnteredOptions(cartLine, productData);
    if (fromCart.length) {
      base.enteredOptions = fromCart;
    }
  }

  return base;
}

export function buildCartLineUpdatePayload(cartLine, values, productData) {
  if (!productData) {
    throw new Error('Product configuration is not loaded yet. Please wait and try again.');
  }

  const uid = getCartLineUid(cartLine);
  if (!uid) {
    throw new Error('Cart line item is not available');
  }

  const mergedValues = mergeCartEditConfigurationValues(values, cartLine, productData);
  const quantity = mergedValues.quantity ?? cartLine.quantity ?? 1;

  const cartOptionUids = getCartLineSelectedOptionsUIDs(cartLine);
  const formOptionUids = (mergedValues.optionsUIDs ?? []).filter(Boolean);
  const cartEntered = getCartLineEnteredOptions(cartLine, productData);
  const rawFormEntered = (values?.enteredOptions ?? []).filter(
    (entry) => entry?.uid && String(entry.value ?? '').trim() !== '',
  );

  const optionsChanged = (cartOptionUids.length || formOptionUids.length)
    ? !optionUidSetsEquivalent(cartOptionUids, formOptionUids, productData, cartLine)
    : false;
  const enteredChanged = rawFormEntered.length > 0
    && normalizeEnteredOptions(cartEntered) !== normalizeEnteredOptions(rawFormEntered);

  if (!optionsChanged && !enteredChanged) {
    return { uid, quantity };
  }

  mergedValues.quantity = quantity;
  mergedValues.sku = mergedValues.sku
    || productData?.variantSku
    || productData?.sku
    || cartLine?.sku;
  mergedValues.optionsUIDs = canonicalizeOptionsUIDs(
    mergedValues.optionsUIDs ?? formOptionUids,
    productData,
    cartLine,
  );

  return {
    ...buildAddToCartPayload(mergedValues, productData),
    uid,
  };
}

export function isCartLineReconfigureUpdate(updateData) {
  if (!updateData) return false;
  return Boolean(updateData.optionsUIDs?.length)
    || Boolean(updateData.enteredOptions?.length);
}

/**
 * Reconfigure: remove the old line first, then add the new configuration (Quick View payload).
 * Avoids cart/minicart briefly showing old and new lines at the same time.
 * @param {object} updateData Output of buildCartLineUpdatePayload
 * @returns {Promise<object|null>}
 */
export async function executeCartLineUpdate(updateData) {
  const lineUid = updateData?.uid;
  if (!lineUid) {
    throw new Error('Cart line item is not available');
  }

  if (!isCartLineReconfigureUpdate(updateData)) {
    return Cart.updateProductsFromCart([{
      uid: lineUid,
      quantity: updateData.quantity ?? 1,
    }]);
  }

  const { uid: _removedLineUid, ...addPayload } = updateData;

  await Cart.updateProductsFromCart([{ uid: lineUid, quantity: 0 }]);
  await waitForCartLineRemoved(lineUid);

  const addedCart = await Cart.addProductsToCart([addPayload]);
  if (!addedCart) {
    throw new Error('Unable to add the updated product configuration to your cart.');
  }

  return addedCart;
}

function createTextField(option, value, onChange) {
  const label = document.createElement('span');
  label.textContent = option.required ? `${option.title} *` : option.title;

  let control;
  const type = (option.type || 'textfield').toLowerCase();

  if (type === 'textarea') {
    control = document.createElement('textarea');
    control.rows = 4;
  } else {
    control = document.createElement('input');
    if (type === 'date') {
      control.type = 'date';
    } else if (type === 'time') {
      control.type = 'time';
    } else if (type === 'date_time') {
      control.type = 'datetime-local';
    } else if (type === 'number' || option.range) {
      control.type = 'number';
      if (option.range?.from != null) control.min = String(option.range.from);
      if (option.range?.to != null) control.max = String(option.range.to);
    } else {
      control.type = 'text';
    }
  }

  control.className = 'product-input-options__control';
  control.value = value;
  control.required = Boolean(option.required);
  control.addEventListener('input', () => onChange(option.id, control.value));
  control.addEventListener('change', () => onChange(option.id, control.value));

  const field = document.createElement('label');
  field.className = 'product-input-options__field';
  field.append(label, control);
  return field;
}

function createDropdownField(group, selectedValueId, onChange) {
  const label = document.createElement('span');
  label.textContent = group.required ? `${group.label} *` : group.label;

  const select = document.createElement('select');
  select.className = 'product-input-options__control product-input-options__select';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose an option';
  select.append(placeholder);

  group.values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value.id;
    option.textContent = value.label;
    select.append(option);
  });

  select.value = selectedValueId;

  select.addEventListener('change', () => {
    onChange(select.value);
  });

  const field = document.createElement('label');
  field.className = 'product-input-options__field';
  field.append(label, select);
  return field;
}

export function mountProductInputOptions(container, options = {}) {
  if (!container) return () => {};

  const { scope, onUserChange } = options;
  const scopeOpt = scope ? { scope } : undefined;
  const eventScopeOpt = scope ? { eager: true, scope } : { eager: true };

  let inputOptions = [];
  let customGroups = [];

  const syncValidity = () => {
    if (!inputOptions.length && !customGroups.length) return;

    const { enteredOptions = [], optionsUIDs = [] } = getProductConfigurationValues(scopeOpt) ?? {};
    const inputOk = !inputOptions.length
      || validateInputOptions(inputOptions, enteredOptions);
    const customOk = !customGroups.length
      || validateCustomGroups(customGroups, optionsUIDs);

    setProductConfigurationValid(() => inputOk && customOk, scopeOpt);
  };

  let lastProduct = null;

  const syncControlsFromValues = () => {
    if (!lastProduct || !container.querySelector('.product-input-options__form')) {
      return;
    }
    const { enteredOptions = [], optionsUIDs = [] } = getProductConfigurationValues(scopeOpt) ?? {};

    customGroups.forEach((group) => {
      const select = container.querySelector(
        `[data-custom-option-id="${CSS.escape(String(group.id))}"]`,
      );
      if (select) {
        select.value = getSelectedValueIdForGroup(group, optionsUIDs) || '';
      }
    });

    inputOptions.forEach((option) => {
      const control = container.querySelector(
        `[data-input-option-id="${CSS.escape(String(option.id))}"]`,
      );
      if (control) {
        control.value = getEnteredValue(enteredOptions, option.id);
      }
    });
    syncValidity();
  };

  const render = (product) => {
    lastProduct = product;
    inputOptions = sortInputOptions(product?.inputOptions ?? []).filter(
      (option) => SUPPORTED_TYPES.has((option.type || 'textfield').toLowerCase())
        || option.type == null,
    );
    customGroups = parseAcCustomizableOptions(product?.attributes);

    const hasFields = inputOptions.length > 0 || customGroups.length > 0;
    container.replaceChildren();
    container.classList.toggle('product-input-options--empty', !hasFields);

    if (!hasFields) {
      return;
    }

    const form = document.createElement('div');
    form.className = 'product-input-options__form';

    const { enteredOptions = [], optionsUIDs = [] } = getProductConfigurationValues(scopeOpt) ?? {};

    customGroups.forEach((group) => {
      const selected = getSelectedValueIdForGroup(group, optionsUIDs);
      const field = createDropdownField(group, selected, (valueId) => {
        onUserChange?.();
        updateGroupSelection(group, valueId, scopeOpt);
        syncValidity();
      });
      field.querySelector('select')?.setAttribute('data-custom-option-id', String(group.id));
      form.append(field);
    });

    inputOptions.forEach((option) => {
      const field = createTextField(
        option,
        getEnteredValue(enteredOptions, option.id),
        (uid, value) => {
          onUserChange?.();
          setProductConfigurationValues((prev) => ({
            ...prev,
            enteredOptions: mergeEnteredOption(prev?.enteredOptions, uid, value),
          }), scopeOpt);
          syncValidity();
        },
      );
      field.querySelector('.product-input-options__control')?.setAttribute(
        'data-input-option-id',
        String(option.id),
      );
      form.append(field);
    });

    container.append(form);
    syncValidity();
  };

  const dataListener = events.on('pdp/data', (product) => {
    if (product) render(product);
  }, eventScopeOpt);

  const valuesListener = events.on('pdp/values', () => {
    syncControlsFromValues();
    syncValidity();
  }, eventScopeOpt);

  return () => {
    dataListener?.off();
    valuesListener?.off();
  };
}
