/**
 * Navigation Events
 *
 * Handles:
 * - Desktop hover
 * - Desktop keyboard
 * - Mobile drawer
 * - Mobile accordion
 * - Escape
 * - Click outside
 */

export function initializeNavigationEvents(container) {
  initializeDesktopEvents(container);
  initializeMobileEvents(container);
  initializeGlobalEvents(container);
}

/* -------------------------------------------------------------------------- */
/* Desktop */
/* -------------------------------------------------------------------------- */

function initializeDesktopEvents(container) {
  const triggers = container.querySelectorAll(
    '.header-navigation__trigger',
  );

  triggers.forEach((trigger) => {
    trigger.addEventListener('mouseenter', handleDesktopOpen);
    trigger.addEventListener('focus', handleDesktopOpen);

    trigger.addEventListener('mouseleave', handleDesktopClose);
    trigger.addEventListener('blur', handleDesktopClose);
  });
}

function handleDesktopOpen(event) {
  const item = event.currentTarget.closest(
    '.header-navigation__item',
  );

  if (!item) return;

  openDesktopMenu(item);
}

function handleDesktopClose(event) {
  const item = event.currentTarget.closest(
    '.header-navigation__item',
  );

  if (!item) return;

  closeDesktopMenu(item);
}

function openDesktopMenu(item) {
  const menu = item.querySelector('.mega-menu');

  if (!menu) return;

  menu.hidden = false;
  menu.setAttribute('aria-hidden', 'false');

  const trigger = item.querySelector(
    '.header-navigation__trigger',
  );

  trigger?.setAttribute('aria-expanded', 'true');

  item.classList.add('is-open');
}

function closeDesktopMenu(item) {
  const menu = item.querySelector('.mega-menu');

  if (!menu) return;

  menu.hidden = true;
  menu.setAttribute('aria-hidden', 'true');

  const trigger = item.querySelector(
    '.header-navigation__trigger',
  );

  trigger?.setAttribute('aria-expanded', 'false');

  item.classList.remove('is-open');
}

/* -------------------------------------------------------------------------- */
/* Mobile */
/* -------------------------------------------------------------------------- */

function initializeMobileEvents(container) {
  const triggers = container.querySelectorAll(
    '.mobile-nav__trigger',
  );

  triggers.forEach((button) => {
    button.addEventListener('click', toggleAccordion);
  });
}

function toggleAccordion(event) {
  const button = event.currentTarget;

  const item = button.closest('.mobile-nav__item');

  if (!item) return;

  const panel = item.querySelector('.mobile-nav__panel');

  if (!panel) return;

  const expanded = button.getAttribute('aria-expanded') === 'true';

  button.setAttribute(
    'aria-expanded',
    String(!expanded),
  );

  panel.hidden = expanded;
}

/* -------------------------------------------------------------------------- */
/* Global */
/* -------------------------------------------------------------------------- */

function initializeGlobalEvents(container) {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAllMenus(container);
    }
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) {
      closeAllMenus(container);
    }
  });
}

function closeAllMenus(container) {
  container
    .querySelectorAll('.header-navigation__item.is-open')
    .forEach((item) => {
      closeDesktopMenu(item);
    });

  container
    .querySelectorAll('.mobile-nav__trigger')
    .forEach((button) => {
      button.setAttribute('aria-expanded', 'false');
    });

  container
    .querySelectorAll('.mobile-nav__panel')
    .forEach((panel) => {
      panel.hidden = true;
    });
}
