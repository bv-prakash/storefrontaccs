import {
  canShowCurrencySwitcher,
  fetchCurrencyInfo,
  formatCurrencyLabel,
  getCurrencySignForSwitcher,
  switchDisplayCurrency,
} from '../../scripts/currency.js';

let globalDismissHandlersBound = false;

function setDropdownOpen(wrapper, trigger, isOpen) {
  wrapper.classList.toggle('currency-switcher-open', isOpen);
  trigger?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function bindGlobalDismissHandlers() {
  if (globalDismissHandlersBound) return;
  globalDismissHandlersBound = true;

  document.addEventListener('click', ({ target }) => {
    const node = /** @type {Node} */ (target);
    document.querySelectorAll('.currency-switcher-dropdown.currency-switcher-open').forEach((dropdown) => {
      if (!dropdown.contains(node)) {
        setDropdownOpen(
          /** @type {HTMLElement} */ (dropdown),
          dropdown.querySelector('.currency-switcher-trigger'),
          false,
        );
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = document.querySelector('.currency-switcher-dropdown.currency-switcher-open');
    if (!open) return;
    const trigger = open.querySelector('.currency-switcher-trigger');
    setDropdownOpen(/** @type {HTMLElement} */ (open), trigger, false);
    trigger?.focus();
  });
}

function renderSingleCurrency(block, currencyInfo) {
  const { selectedCurrency, symbolByCode, storeLocale } = currencyInfo;
  block.classList.add('currency-switcher-single');
  block.dataset.currencyState = 'single';

  const label = document.createElement('span');
  label.className = 'currency-switcher-single-label';
  label.textContent = formatCurrencyLabel(selectedCurrency, storeLocale, symbolByCode);
  label.setAttribute('aria-label', `Store currency ${selectedCurrency}`);
  block.append(label);
}

function createOption(
  code,
  selectedCurrency,
  available,
  defaultCode,
  symbolByCode,
  storeLocale,
  wrapper,
) {
  const item = document.createElement('li');
  item.className = 'currency-switcher-option';
  item.setAttribute('role', 'option');
  item.setAttribute('tabindex', '0');
  item.dataset.currencyCode = code;
  item.setAttribute('aria-selected', code === selectedCurrency ? 'true' : 'false');
  if (code === selectedCurrency) {
    item.classList.add('currency-switcher-option-active');
  }

  const sign = getCurrencySignForSwitcher(code, storeLocale, symbolByCode);
  const symbol = document.createElement('span');
  symbol.className = 'currency-switcher-option-symbol';
  symbol.textContent = sign;
  symbol.setAttribute('aria-hidden', 'true');
  if (sign.toUpperCase() === code.toUpperCase()) {
    item.classList.add('currency-switcher-option-iso-sign');
  }

  const codeEl = document.createElement('span');
  codeEl.className = 'currency-switcher-option-code';
  codeEl.textContent = code;

  item.setAttribute('aria-label', formatCurrencyLabel(code, storeLocale, symbolByCode));
  item.append(symbol, codeEl);

  const select = () => {
    if (code !== selectedCurrency) {
      switchDisplayCurrency(code, available, defaultCode);
    } else {
      setDropdownOpen(wrapper, wrapper.querySelector('.currency-switcher-trigger'), false);
    }
  };

  item.addEventListener('click', (event) => {
    event.stopPropagation();
    select();
  });

  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  });

  return item;
}

function buildCurrencyDropdown(wrapper, currencyInfo) {
  const {
    available_currency_codes: available,
    default_display_currency_code: defaultCode,
    selectedCurrency,
    symbolByCode,
    storeLocale,
  } = currencyInfo;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'currency-switcher-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', 'Select currency');

  const triggerLabel = document.createElement('span');
  triggerLabel.className = 'currency-switcher-trigger-label';
  triggerLabel.textContent = formatCurrencyLabel(selectedCurrency, storeLocale, symbolByCode);
  trigger.append(triggerLabel);

  const menu = document.createElement('ul');
  menu.className = 'currency-switcher-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Available currencies');
  available.forEach((code) => {
    menu.append(createOption(
      code,
      selectedCurrency,
      available,
      defaultCode,
      symbolByCode,
      storeLocale,
      wrapper,
    ));
  });

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    setDropdownOpen(wrapper, trigger, !wrapper.classList.contains('currency-switcher-open'));
  });

  wrapper.addEventListener('focusout', (event) => {
    const related = /** @type {HTMLElement|null} */ (event.relatedTarget);
    if (related && wrapper.contains(related)) return;
    setDropdownOpen(wrapper, trigger, false);
  });

  wrapper.append(trigger, menu);
  bindGlobalDismissHandlers();
}

export default async function decorate(block) {
  if (block.dataset.currencySwitcherDecorated === 'true') return;
  block.dataset.currencySwitcherDecorated = 'true';

  block.textContent = '';
  block.classList.add('currency-switcher-ready');

  const currencyInfo = await fetchCurrencyInfo();
  if (!currencyInfo?.available_currency_codes?.length) {
    block.dataset.currencyState = 'unavailable';
    block.classList.add('currency-switcher-empty');
    return;
  }

  if (!canShowCurrencySwitcher(currencyInfo)) {
    renderSingleCurrency(block, currencyInfo);
    return;
  }

  block.dataset.currencyState = 'switcher';
  const wrapper = document.createElement('div');
  wrapper.className = 'currency-switcher-dropdown';
  buildCurrencyDropdown(wrapper, currencyInfo);
  block.append(wrapper);
}
