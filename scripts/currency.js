import { getCookie } from '@dropins/tools/lib.js';
import { getHeaders, getRootPath, getListOfRootPaths } from '@dropins/tools/lib/aem/configs.js';
import {
  CORE_FETCH_GRAPHQL,
  CS_FETCH_GRAPHQL,
  getCommerceStoreScopeKey,
} from './commerce.js';

export const DISPLAY_CURRENCY_COOKIE = 'currency';

const MIN_SWITCHER_CURRENCIES = 2;
const STORAGE_PREFIX = 'dropin_display_currency__';
const CURRENCY_INFO_CACHE_VERSION = 10;

export function getActiveCurrencySessionStorageKey() {
  return `commerce_active_display_currency__${getCommerceStoreScopeKey()}`;
}

export function getCurrencyInfoSessionStorageKey() {
  return `commerce_currency_info_v${CURRENCY_INFO_CACHE_VERSION}__${getCommerceStoreScopeKey()}`;
}

const CURRENCY_QUERY = `
  query CurrencySwitcher {
    storeConfig {
      locale
    }
    currency {
      base_currency_code
      base_currency_symbol
      default_display_currency_code
      default_display_currency_symbol
      available_currency_codes
      exchange_rates {
        currency_to
        rate
      }
    }
  }
`;

let activeCurrencyContext = null;
let catalogConversionHookRegistered = false;
let currencyInfoPromise = null;
let currencyFetchScope = null;

export function getCurrencyStorageKey() {
  return `${STORAGE_PREFIX}${getCommerceStoreScopeKey()}`;
}

function getCurrencyCookiePath() {
  const root = getRootPath();
  if (!root || root === '/') return '/';
  const normalized = root.replace(/\/+$/, '');
  return normalized || '/';
}

function isMultistoreSite() {
  try {
    return getListOfRootPaths().length > 1;
  } catch {
    return false;
  }
}

export function getStoredDisplayCurrency() {
  try {
    const fromSession = sessionStorage.getItem(getActiveCurrencySessionStorageKey());
    if (fromSession) return fromSession;
  } catch {
    /* empty */
  }

  try {
    const fromLocal = localStorage.getItem(getCurrencyStorageKey());
    if (fromLocal) return fromLocal;
  } catch {
    /* empty */
  }

  if (!isMultistoreSite()) {
    const fromCookie = getCookie(DISPLAY_CURRENCY_COOKIE);
    if (fromCookie) {
      try {
        return decodeURIComponent(fromCookie);
      } catch {
        return fromCookie;
      }
    }
  }

  return null;
}

export function getActiveDisplayCurrency() {
  return activeCurrencyContext?.selectedCurrency
    ?? getStoredDisplayCurrency()
    ?? null;
}

export function setStoredDisplayCurrency(code) {
  const maxAge = 60 * 60 * 24 * 365;
  const cookiePath = getCurrencyCookiePath();
  document.cookie = `${DISPLAY_CURRENCY_COOKIE}=${encodeURIComponent(code)}; path=${cookiePath}; max-age=${maxAge}; SameSite=Lax`;
  try {
    localStorage.setItem(getCurrencyStorageKey(), code);
    sessionStorage.setItem(getActiveCurrencySessionStorageKey(), code);
  } catch {
    /* empty */
  }
}

function toCurrencyCodeKey(code) {
  return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function commerceLocaleToBcp47(locale) {
  if (!locale || typeof locale !== 'string') return undefined;
  return locale.trim().replace(/_/g, '-');
}

function isDistinctSymbol(symbol, code) {
  const key = toCurrencyCodeKey(code);
  const value = symbol?.trim();
  if (!value || !key) return false;
  if (value.toUpperCase() === key) return false;
  if (value === '$' && key !== 'USD') return false;
  return true;
}

function getLocaleCandidates(storeLocale) {
  const candidates = [];
  if (storeLocale) {
    candidates.push(storeLocale);
    try {
      const maximized = new Intl.Locale(storeLocale).maximize().toString();
      if (maximized) candidates.push(maximized);
    } catch {
      /* empty */
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      candidates.push(navigator.language.replace(/_/g, '-'));
    }
  } catch {
    /* empty */
  }
  candidates.push(undefined);
  const seen = new Set();
  return candidates.filter((loc) => {
    const token = loc ?? '__default__';
    if (seen.has(token)) return false;
    seen.add(token);
    return true;
  });
}

function intlCurrencyPart(key, loc, currencyDisplay) {
  try {
    const parts = new Intl.NumberFormat(loc || undefined, {
      style: 'currency',
      currency: key,
      currencyDisplay,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value?.trim() || '';
  } catch {
    return '';
  }
}

function resolveDistinctSymbol(code, storeLocale) {
  const key = toCurrencyCodeKey(code);
  if (!key) return '';

  const locales = getLocaleCandidates(storeLocale);
  for (let i = 0; i < locales.length; i += 1) {
    const loc = locales[i];
    for (let d = 0; d < 2; d += 1) {
      const display = d === 0 ? 'symbol' : 'narrowSymbol';
      const value = intlCurrencyPart(key, loc, display);
      if (isDistinctSymbol(value, key)) {
        return value;
      }
    }
  }
  return '';
}

function mergeGraphQlSymbols(map, currency) {
  const base = toCurrencyCodeKey(currency?.base_currency_code);
  const def = toCurrencyCodeKey(currency?.default_display_currency_code);
  const baseSymbol = currency?.base_currency_symbol?.trim();
  const defSymbol = currency?.default_display_currency_symbol?.trim();
  if (base && baseSymbol) map[base] = baseSymbol;
  if (def && defSymbol) map[def] = defSymbol;

  [currency?.available_currencies, currency?.currencies].forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry) => {
      const code = toCurrencyCodeKey(entry?.code);
      const symbol = entry?.symbol?.trim();
      if (code && symbol) map[code] = symbol;
    });
  });
}

function buildSymbolByCode(currency, storeLocale) {
  const map = {};
  mergeGraphQlSymbols(map, currency);
  normalizeAvailableCodes(currency?.available_currency_codes).forEach((code) => {
    const existing = map[code]?.trim();
    if (existing && isDistinctSymbol(existing, code)) return;
    const distinct = resolveDistinctSymbol(code, storeLocale);
    map[code] = distinct || existing || code;
  });
  return map;
}

export function getCurrencySignForSwitcher(code, storeLocale, symbolByCode) {
  const key = toCurrencyCodeKey(code);
  if (!key) return '';
  const locale = storeLocale || activeCurrencyContext?.storeLocale;
  const fromMap = symbolByCode?.[key]?.trim();
  if (fromMap && isDistinctSymbol(fromMap, key)) return fromMap;
  const distinct = resolveDistinctSymbol(key, locale);
  if (distinct) return distinct;
  return fromMap || key;
}

export function formatCurrencyLabel(code, storeLocale, symbolByCode) {
  const key = toCurrencyCodeKey(code);
  if (!key) return '';
  const sign = getCurrencySignForSwitcher(key, storeLocale, symbolByCode);
  return sign.toUpperCase() === key ? key : `${sign} ${key}`;
}

export function canShowCurrencySwitcher(info) {
  return (info?.available_currency_codes?.length ?? 0) >= MIN_SWITCHER_CURRENCIES;
}

function buildExchangeRateMap(exchangeRates, baseCode) {
  const rates = { [baseCode]: 1 };
  (exchangeRates || []).forEach(({ currency_to: code, rate }) => {
    if (code && typeof rate === 'number' && rate > 0) {
      rates[code] = rate;
    }
  });
  return rates;
}

function normalizeAvailableCodes(codes) {
  const seen = new Set();
  return (codes || [])
    .map((code) => (typeof code === 'string' ? code.trim().toUpperCase() : ''))
    .filter((code) => {
      if (!code || seen.has(code)) return false;
      seen.add(code);
      return true;
    });
}

function resolveStoreLocale(info) {
  if (info?.storeLocale) return info.storeLocale;
  try {
    const cached = sessionStorage.getItem('storeConfig');
    if (cached) {
      const { locale } = JSON.parse(cached);
      return commerceLocaleToBcp47(locale);
    }
  } catch {
    /* empty */
  }
  return undefined;
}

function normalizeCurrencyInfo(info) {
  const availableCodes = normalizeAvailableCodes(info?.available_currency_codes);
  if (!availableCodes.length || !info?.base_currency_code) {
    return null;
  }

  const exchangeRateMap = info.exchangeRateMap
    && typeof info.exchangeRateMap === 'object'
    ? info.exchangeRateMap
    : buildExchangeRateMap(info.exchange_rates, info.base_currency_code);

  const selectedCurrency = info.selectedCurrency
    || getStoredDisplayCurrency()
    || info.default_display_currency_code;

  const storeLocale = resolveStoreLocale(info) || info.storeLocale;

  return {
    ...info,
    available_currency_codes: availableCodes,
    exchangeRateMap,
    selectedCurrency,
    storeLocale,
    symbolByCode: buildSymbolByCode(info, storeLocale),
  };
}

function shouldRelabelCatalogPrices(ctx) {
  const displayCode = toCurrencyCodeKey(ctx?.selectedCurrency);
  const baseCode = toCurrencyCodeKey(ctx?.base_currency_code);
  return Boolean(displayCode && baseCode && displayCode !== baseCode);
}

function shouldConvertCatalogPrices(ctx) {
  const displayCode = ctx?.selectedCurrency;
  const baseCode = ctx?.base_currency_code;
  if (!displayCode || displayCode === baseCode) return false;
  return Boolean(ctx?.exchangeRateMap?.[displayCode]);
}

export function convertCurrencyAmount(amount, fromCode, toCode, baseCode, rates) {
  if (fromCode === toCode || amount === null || amount === undefined || !rates) return amount;
  const fromRate = rates[fromCode];
  const toRate = rates[toCode];
  if (!fromRate || !toRate) return amount;

  const amountInBase = fromCode === baseCode ? amount : amount / fromRate;
  const converted = toCode === baseCode ? amountInBase : amountInBase * toRate;
  return Math.round(converted * 100) / 100;
}

export function applyContentCurrencyHeader(code, defaultCode) {
  const shouldSend = Boolean(code && (!defaultCode || code !== defaultCode));
  const apply = (prev) => {
    const next = { ...prev };
    if (shouldSend && code) {
      next['Content-Currency'] = code;
    } else {
      delete next['Content-Currency'];
    }
    return next;
  };
  CORE_FETCH_GRAPHQL.setFetchGraphQlHeaders(apply);
  CS_FETCH_GRAPHQL.setFetchGraphQlHeaders(apply);
}

function isValidCurrencyCache(info) {
  return Boolean(info?.available_currency_codes?.length && info.base_currency_code);
}

async function withStoreViewCoreHeaders(request) {
  const csHeaders = getHeaders('cs') || {};
  const headerKeys = Object.keys(csHeaders);
  headerKeys.forEach((key) => {
    CORE_FETCH_GRAPHQL.setFetchGraphQlHeader(key, csHeaders[key]);
  });
  try {
    return await request();
  } finally {
    headerKeys.forEach((key) => {
      CORE_FETCH_GRAPHQL.removeFetchGraphQlHeader(key);
    });
  }
}

function resolveSelectedCurrency(available, defaultCode, stored) {
  if (stored && available.includes(stored)) return stored;
  if (available.includes(defaultCode)) return defaultCode;
  return available[0];
}

function buildCurrencyInfoFromResponse(currency, storeScope, storeConfig) {
  const available = normalizeAvailableCodes(currency?.available_currency_codes);
  if (!available.length) return null;

  const storeLocale = commerceLocaleToBcp47(storeConfig?.locale);
  const info = normalizeCurrencyInfo({
    ...currency,
    available_currency_codes: available,
    exchangeRateMap: buildExchangeRateMap(currency.exchange_rates, currency.base_currency_code),
    selectedCurrency: resolveSelectedCurrency(
      available,
      currency.default_display_currency_code,
      getStoredDisplayCurrency(),
    ),
    storeScope,
    storeLocale,
  });

  if (!info) return null;
  return { ...info, storeScope, storeLocale: info.storeLocale || storeLocale };
}

export function onCommerceStoreContextChanged() {
  activeCurrencyContext = null;
  currencyInfoPromise = null;
  currencyFetchScope = null;
  try {
    sessionStorage.removeItem(getCurrencyInfoSessionStorageKey());
    sessionStorage.removeItem(getActiveCurrencySessionStorageKey());
  } catch {
    /* empty */
  }
}

export async function fetchCurrencyInfo(forceRefresh = false) {
  const storeScope = getCommerceStoreScopeKey();

  if (!forceRefresh) {
    try {
      const cached = sessionStorage.getItem(getCurrencyInfoSessionStorageKey());
      if (cached) {
        const parsed = JSON.parse(cached);
        const normalized = normalizeCurrencyInfo(parsed);
        if (
          normalized
          && parsed.storeScope === storeScope
          && isValidCurrencyCache(normalized)
        ) {
          activeCurrencyContext = { ...normalized, storeScope };
          return activeCurrencyContext;
        }
      }
    } catch {
      /* empty */
    }
  }

  const needsFetch = forceRefresh
    || !currencyInfoPromise
    || currencyFetchScope !== storeScope;

  if (!needsFetch) {
    return currencyInfoPromise;
  }

  currencyFetchScope = storeScope;
  if (!CORE_FETCH_GRAPHQL.endpoint) {
    currencyInfoPromise = Promise.resolve(null);
    return currencyInfoPromise;
  }

  currencyInfoPromise = withStoreViewCoreHeaders(() => CORE_FETCH_GRAPHQL.fetchGraphQl(
    CURRENCY_QUERY,
    { method: 'GET', cache: 'no-cache' },
  )).then(({ data }) => {
    if (!data?.currency) return null;

    activeCurrencyContext = buildCurrencyInfoFromResponse(
      data.currency,
      storeScope,
      data?.storeConfig,
    );
    if (!activeCurrencyContext) return null;

    try {
      sessionStorage.setItem(
        getCurrencyInfoSessionStorageKey(),
        JSON.stringify(activeCurrencyContext),
      );
    } catch {
      /* empty */
    }

    return activeCurrencyContext;
  }).catch(() => null);

  return currencyInfoPromise;
}

function applyDisplayCurrencyToPriceNode(record, ctx) {
  const {
    selectedCurrency: displayCode,
    base_currency_code: baseCode,
    exchangeRateMap: rates,
  } = ctx;
  const value = shouldConvertCatalogPrices(ctx)
    ? convertCurrencyAmount(record.value, record.currency, displayCode, baseCode, rates)
    : record.value;
  return { ...record, value, currency: displayCode };
}

function transformCatalogPriceNodes(node) {
  const ctx = normalizeCurrencyInfo(activeCurrencyContext);
  if (!ctx || !node || !shouldRelabelCatalogPrices(ctx)) return node;

  const displayCode = ctx.selectedCurrency;

  if (Array.isArray(node)) {
    return node.map((entry) => transformCatalogPriceNodes(entry));
  }

  if (typeof node !== 'object') return node;

  const record = /** @type {Record<string, unknown>} */ (node);
  if (typeof record.value === 'number' && typeof record.currency === 'string') {
    if (record.currency !== displayCode) {
      return applyDisplayCurrencyToPriceNode(record, ctx);
    }
    return record;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, transformCatalogPriceNodes(value)]),
  );
}

function registerCatalogPriceTransform(client) {
  client.addAfterHook((_request, response) => {
    if (!response?.data || !activeCurrencyContext) return response;
    try {
      return { ...response, data: transformCatalogPriceNodes(response.data) };
    } catch {
      return response;
    }
  });
}

export function attachCatalogCurrencyConversion() {
  if (catalogConversionHookRegistered) return;
  catalogConversionHookRegistered = true;
  registerCatalogPriceTransform(CS_FETCH_GRAPHQL);
  registerCatalogPriceTransform(CORE_FETCH_GRAPHQL);
}

function clearCookie(name) {
  document.cookie = `${name}=; path=/; Max-Age=0`;
}

function clearPriceScopedSessionCaches() {
  sessionStorage.removeItem('storeConfig');
  sessionStorage.removeItem('personalizationStoreConfig');
  sessionStorage.removeItem(getCurrencyInfoSessionStorageKey());
  sessionStorage.removeItem('DROPINS_CART_ID');
  sessionStorage.removeItem('DROPIN__CART__CART__DATA');
  sessionStorage.removeItem('DROPIN__CART__SHIPPING__DATA');
  clearCookie('DROPIN__CART__CART-ID');
  currencyInfoPromise = null;
  currencyFetchScope = null;
}

export async function initDisplayCurrency() {
  const fetched = await fetchCurrencyInfo();
  if (!fetched) return null;

  const info = normalizeCurrencyInfo(fetched);
  if (!info) return null;

  activeCurrencyContext = info;
  setStoredDisplayCurrency(info.selectedCurrency);
  applyContentCurrencyHeader(info.selectedCurrency, info.default_display_currency_code);
  attachCatalogCurrencyConversion();
  return info;
}

export function switchDisplayCurrency(code, availableCodes, defaultCode) {
  if (!availableCodes.includes(code)) return;
  clearPriceScopedSessionCaches();
  setStoredDisplayCurrency(code);
  applyContentCurrencyHeader(code, defaultCode);
  window.location.reload();
}
