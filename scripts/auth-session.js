import { events } from '@dropins/tools/event-bus.js';
import { getCookie } from '@dropins/tools/lib.js';
import { getRootPath } from '@dropins/tools/lib/aem/configs.js';

const AUTH_MESSAGE_KEY = 'auth_session_message';
const USER_LOGOUT_KEY = 'auth_user_logout';
const CUSTOMER_PATH = '/customer';
const CUSTOMER_LOGIN_PATH = `${CUSTOMER_PATH}/login`;
const AUTH_COOKIES = [
  'auth_dropin_user_token',
  'auth_dropin_firstname',
  'auth_dropin_lastname',
  'auth_dropin_admin_session',
];

const MESSAGES = {
  'logged-out': 'You have been logged out.',
  'session-expired': 'Your session has expired. Please sign in again.',
};

function getLocaleRoot() {
  const configuredRoot = (getRootPath() || '').replace(/\/$/, '');
  if (configuredRoot) return configuredRoot;
  const [, firstSegment] = window.location.pathname.split('/');
  return firstSegment && /^[a-z]{2}(-[a-z]{2})?$/i.test(firstSegment) ? `/${firstSegment}` : '';
}

function rootLink(link) {
  const root = getLocaleRoot();
  if (!root) return link;
  if (link === root || link.startsWith(`${root}/`)) return link;
  return `${root}${link}`;
}

function setAuthMessage(kind) {
  try {
    sessionStorage.setItem(AUTH_MESSAGE_KEY, kind);
  } catch {
    // ignore storage errors
  }
}

export function hasPendingAuthMessage() {
  try {
    return Boolean(sessionStorage.getItem(AUTH_MESSAGE_KEY));
  } catch {
    return false;
  }
}

export function isLogoutInProgress() {
  try {
    return sessionStorage.getItem(USER_LOGOUT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markUserLogout() {
  try {
    sessionStorage.setItem(USER_LOGOUT_KEY, 'true');
  } catch {
    // ignore storage errors
  }
  setAuthMessage('logged-out');
}

export function markSessionExpired() {
  if (isLogoutInProgress()) return;
  setAuthMessage('session-expired');
}

export function clearLocalAuth() {
  AUTH_COOKIES.forEach((name) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  });
}

function isGuestAuthPath(pathname) {
  const guestPaths = [
    rootLink(CUSTOMER_LOGIN_PATH),
    rootLink(`${CUSTOMER_PATH}/create`),
    rootLink(`${CUSTOMER_PATH}/forgotpassword`),
    rootLink(`${CUSTOMER_PATH}/createpassword`),
    rootLink(`${CUSTOMER_PATH}/confirm`),
  ];
  return guestPaths.some((guestPath) => pathname === guestPath || pathname.startsWith(`${guestPath}/`));
}

export function isProtectedCustomerPath(pathname = window.location.pathname) {
  if (isGuestAuthPath(pathname)) return false;
  const accountRoot = rootLink(CUSTOMER_PATH);
  return pathname === accountRoot
    || pathname.startsWith(`${accountRoot}/`)
    || pathname.includes('/checkout')
    || pathname.includes('/order-details');
}

export function getLoginUrl() {
  return rootLink(CUSTOMER_LOGIN_PATH);
}

export function redirectAfterLogout() {
  const { pathname } = window.location;
  let nextUrl = rootLink('/');
  if (pathname.includes('/checkout')) {
    nextUrl = rootLink('/cart');
  } else if (isProtectedCustomerPath()) {
    nextUrl = getLoginUrl();
  }
  window.location.replace(nextUrl);
}

function suppressUnauthorizedRejection(event) {
  const message = event?.reason?.message || '';
  if (message.includes("isn't authorized") || message.includes('not authorized')) {
    event.preventDefault();
  }
}

/**
 * Logs the shopper out locally first so login pages do not bounce back to
 * My Account, then revokes the Commerce token when possible.
 */
export async function performLogout() {
  markUserLogout();
  clearLocalAuth();
  window.addEventListener('unhandledrejection', suppressUnauthorizedRejection);

  try {
    const authApi = await import('@dropins/storefront-auth/api.js');
    await authApi.revokeCustomerToken();
  } catch {
    events.emit('authenticated', false);
  }

  redirectAfterLogout();
}

export async function showPendingAuthMessage() {
  let kind;
  try {
    kind = sessionStorage.getItem(AUTH_MESSAGE_KEY);
    if (kind) sessionStorage.removeItem(AUTH_MESSAGE_KEY);
  } catch {
    return;
  }
  if (!kind) return;

  const { showNotification } = await import('./components/notification.js');
  showNotification({
    type: kind === 'session-expired' ? 'warning' : 'info',
    message: MESSAGES[kind] || MESSAGES['logged-out'],
    duration: 8000,
  });
}

/**
 * Redirects away from account pages and surfaces a message when the
 * customer token is revoked or expires.
 */
export function initAuthSessionWatch() {
  let wasAuthenticated = Boolean(getCookie('auth_dropin_user_token'));

  events.on('authenticated', (isAuthenticated) => {
    if (wasAuthenticated && !isAuthenticated) {
      // Explicit logout navigates itself; only handle unexpected session loss.
      if (isLogoutInProgress()) {
        wasAuthenticated = false;
        return;
      }
      markSessionExpired();
      if (isProtectedCustomerPath()) {
        window.location.replace(getLoginUrl());
      } else {
        showPendingAuthMessage();
      }
    }
    wasAuthenticated = Boolean(isAuthenticated);
  });

  showPendingAuthMessage();
}
