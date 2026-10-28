import { events } from '@dropins/tools/event-bus.js';
import {
  getProductConfigurationValues,
  setProductConfigurationValues,
  setProductConfigurationValid,
} from '@dropins/storefront-pdp/api.js';

const SUPPORTED_TYPES = new Set([
  'textfield',
  'textarea',
  'field',
  'date',
  'date_time',
  'time',
  'number',
]);

function findAcCustomizableAttribute(attributes) {
  return attributes?.find(
    (item) => item.id === 'ac_customizable_options'
      || item.name === 'ac_customizable_options',
  );
}

export function parseAcCustomizableOptions(attributes) {
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

export function hasAcCustomizableOptions(attributes) {
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
  if (!productData || productData.options?.length
    || hasAcCustomizableOptions(productData.attributes)) {
    return;
  }
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

export function buildAddToCartPayload(values, productData) {
  if (!values?.sku) {
    throw new Error('Product SKU is missing.');
  }

  const payload = {
    sku: productData?.variantSku || values.sku,
    quantity: values.quantity || 1,
  };

  const hasConfigurableOptions = Boolean(productData?.options?.length);
  const hasCustomizableOptions = hasAcCustomizableOptions(productData?.attributes);
  if (hasConfigurableOptions || hasCustomizableOptions) {
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

  const { scope } = options;
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

  const render = (product) => {
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
      form.append(createDropdownField(group, selected, (valueId) => {
        updateGroupSelection(group, valueId, scopeOpt);
        syncValidity();
      }));
    });

    inputOptions.forEach((option) => {
      form.append(createTextField(
        option,
        getEnteredValue(enteredOptions, option.id),
        (uid, value) => {
          setProductConfigurationValues((prev) => ({
            ...prev,
            enteredOptions: mergeEnteredOption(prev?.enteredOptions, uid, value),
          }), scopeOpt);
          syncValidity();
        },
      ));
    });

    container.append(form);
    syncValidity();
  };

  const dataListener = events.on('pdp/data', (product) => {
    if (product) render(product);
  }, eventScopeOpt);

  const valuesListener = events.on('pdp/values', syncValidity, eventScopeOpt);

  return () => {
    dataListener?.off();
    valuesListener?.off();
  };
}
