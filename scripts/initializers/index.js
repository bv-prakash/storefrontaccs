// Drop-in Tools
import { getCookie } from '@dropins/tools/lib.js';
import { events } from '@dropins/tools/event-bus.js';
import { initializers } from '@dropins/tools/initializer.js';
import { isAemAssetsEnabled } from '@dropins/tools/lib/aem/assets.js';
import { getConfigValue, getHeaders, getRootPath } from '@dropins/tools/lib/aem/configs.js';
import { CORE_FETCH_GRAPHQL, CS_FETCH_GRAPHQL, fetchPlaceholders } from '../commerce.js';

const DROPIN_WEBSITE_COOKIE = 'dropin_website_path';
const DROPIN_STORE_COOKIE = 'dropin_store_code';
const getWebsitePath = () => getRootPath() || '/';
const getStoreCode = () => {
  try {
    return getHeaders('all')?.Store || 'default';
  } catch {
    return 'default';
  }
};
const clearCookie = (name) => { document.cookie = `${name}=; path=/; Max-Age=0`; };

function clearStoreScopedCaches() {
  sessionStorage.removeItem('storeConfig');
  sessionStorage.removeItem('personalizationStoreConfig');
  Object.keys(sessionStorage).forEach((key) => {
    if (key === '_account_countries' || key.startsWith('_account_regions_')) {
      sessionStorage.removeItem(key);
    }
  });
}

export const getUserTokenCookie = () => getCookie('auth_dropin_user_token');

const setAuthHeaders = (state) => {
  if (state) {
    const token = getUserTokenCookie();
    CORE_FETCH_GRAPHQL.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);
  } else {
    CORE_FETCH_GRAPHQL.removeFetchGraphQlHeader('Authorization');
  }
};

const setCustomerGroupHeader = (customerGroupId) => {
  CS_FETCH_GRAPHQL.setFetchGraphQlHeader('Magento-Customer-Group', customerGroupId);
};

const setAdobeCommerceOptimizerHeader = (adobeCommerceOptimizer) => {
  if (adobeCommerceOptimizer?.priceBookId) {
    CS_FETCH_GRAPHQL.setFetchGraphQlHeader('AC-Price-Book-ID', adobeCommerceOptimizer.priceBookId);
  } else {
    CS_FETCH_GRAPHQL.removeFetchGraphQlHeader('AC-Price-Book-ID');
  }
};

const persistCartDataInSession = (data) => {
  if (data?.id) {
    sessionStorage.setItem('DROPINS_CART_ID', data.id);
  } else {
    sessionStorage.removeItem('DROPINS_CART_ID');
  }
};

const setupAemAssetsImageParams = () => {
  if (isAemAssetsEnabled()) {
    // Convert decimal values to integers for AEM Assets compatibility
    initializers.setImageParamKeys({
      width: (value) => [
        'width',
        value !== undefined && value !== null && !Number.isNaN(Number(value))
          ? Math.floor(Number(value))
          : undefined,
      ],
      height: (value) => [
        'height',
        value !== undefined && value !== null && !Number.isNaN(Number(value))
          ? Math.floor(Number(value))
          : undefined,
      ],
      quality: 'quality',
      auto: 'auto',
      crop: 'crop',
      fit: 'fit',
    });
  }
};

export default async function initializeDropins() {
  const init = async () => {
    // Set Customer-Group-ID header
    if (getConfigValue('adobe-commerce-optimizer')) {
      events.on('auth/adobe-commerce-optimizer', setAdobeCommerceOptimizerHeader, { eager: true });
    } else {
      events.on('auth/group-uid', setCustomerGroupHeader, { eager: true });
    }

    // Clear cart and store-scoped caches when switching websites/store views
    // so newsletter, account, and storeConfig data are not reused from default.
    const storedWebsitePath = getCookie(DROPIN_WEBSITE_COOKIE);
    const currentWebsitePath = getWebsitePath();
    const storedStoreCode = getCookie(DROPIN_STORE_COOKIE);
    const currentStoreCode = getStoreCode();
    const storeChanged = (storedWebsitePath && storedWebsitePath !== currentWebsitePath)
      || (storedStoreCode && storedStoreCode !== currentStoreCode);
    if (storeChanged) {
      clearCookie('DROPIN__CART__CART-ID');
      sessionStorage.removeItem('DROPINS_CART_ID');
      sessionStorage.removeItem('DROPIN__CART__CART__DATA');
      sessionStorage.removeItem('DROPIN__CART__SHIPPING__DATA');
      localStorage.removeItem('DROPIN__CART__CART__AUTHENTICATED');
      clearStoreScopedCaches();
    }
    document.cookie = `${DROPIN_WEBSITE_COOKIE}=${currentWebsitePath}; path=/`;
    document.cookie = `${DROPIN_STORE_COOKIE}=${currentStoreCode}; path=/`;

    CORE_FETCH_GRAPHQL.addAfterHook((_request, response) => {
      const hasAuthError = response?.errors?.some((error) => {
        const category = error?.extensions?.category;
        const message = error?.message || '';
        return category === 'graphql-authentication' || message.includes("isn't authorized");
      });
      if (!hasAuthError) return response;

      let loggingOut = false;
      try {
        loggingOut = sessionStorage.getItem('auth_user_logout') === 'true';
      } catch {
        loggingOut = false;
      }

      if (loggingOut) {
        return { ...response, errors: undefined };
      }

      import('../auth-session.js').then(({
        clearLocalAuth,
        markSessionExpired,
        isProtectedCustomerPath,
        getLoginUrl,
      }) => {
        if (getUserTokenCookie()) {
          clearLocalAuth();
          markSessionExpired();
          if (isProtectedCustomerPath()) {
            window.location.replace(getLoginUrl());
          }
        }
      });
      return response;
    });

    // Set auth headers on authenticated event
    events.on('authenticated', setAuthHeaders, { eager: true });

    // Cache cart data in session storage
    events.on('cart/data', persistCartDataInSession, { eager: true });

    // on page load, check if user is authenticated
    const token = getUserTokenCookie();
    // set auth headers
    setAuthHeaders(!!token);

    // Event Bus Logger
    events.enableLogger(true);

    // Set up AEM Assets image parameter conversion
    setupAemAssetsImageParams();

    // Fetch global placeholders
    await fetchPlaceholders('placeholders/global.json');

    // Initialize Global Drop-ins
    await import('./auth.js');
    const { initAuthSessionWatch } = await import('../auth-session.js');
    initAuthSessionWatch();

    await import('./personalization.js');

    import('./cart.js');

    events.on('aem/lcp', async () => {
      // Recaptcha
      await import('@dropins/tools/recaptcha.js').then((recaptcha) => {
        recaptcha.setEndpoint(CORE_FETCH_GRAPHQL);
        recaptcha.enableLogger(true);
        return recaptcha.setConfig();
      });
    });
  };

  // re-initialize on prerendering changes
  document.addEventListener('prerenderingchange', initializeDropins, { once: true });

  return init();
}

export function initializeDropin(cb) {
  let initialized = false;

  const init = async (force = false) => {
    // prevent re-initialization
    if (initialized && !force) return;
    // initialize drop-in
    await cb();
    initialized = true;
  };

  // re-initialize on prerendering changes
  document.addEventListener('prerenderingchange', () => init(true), { once: true });

  return init;
}
