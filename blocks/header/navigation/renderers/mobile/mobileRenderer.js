import { createElement } from '../../utils.js';

/**
 * Render mobile navigation drawer using the compiled HTML tree structure.
 *
 * @param {HTMLElement} container - The destination placeholder (.nav-sections)
 * @param {HTMLElement} menuDom - The semantic <ul> element output by generateMenuMarkup
 * @returns {HTMLElement}
 */
export function renderMobileNavigation(container, menuDom) {
  // 1. Clear out any previous mobile navigation drawer instances to prevent duplication
  const oldDrawer = container.querySelector('.mobile-nav');
  if (oldDrawer) {
    oldDrawer.remove();
  }

  // 2. Clone the unified HTML tree so mobile-specific event modifications don't leak to desktop
  const mobileMenuClone = menuDom.cloneNode(true);

  // 3. Assemble the drawer shell matching your design requirements
  const drawer = createDrawer();
  const header = createDrawerHeader();
  const body = createDrawerBody(mobileMenuClone);

  drawer.append(header);
  drawer.append(body);

  // 4. Append to the target section wrapper block
  container.append(drawer);

  return drawer;
}

/**
 * Create drawer container.
 *
 * @returns {HTMLElement}
 */
function createDrawer() {
  const drawer = createElement('div', 'mobile-nav');

  drawer.hidden = true;
  drawer.setAttribute('aria-hidden', 'true');

  return drawer;
}

/**
 * Create drawer header.
 */
function createDrawerHeader() {
  const header = createElement('div', 'mobile-nav__header');
  return header;
}

/**
 * Create drawer body.
 *
 * @param {HTMLElement} mobileMenuClone - The cloned structural menu layout
 * @returns {HTMLElement}
 */
function createDrawerBody(mobileMenuClone) {
  const body = createElement('div', 'mobile-nav__body');

  // Inject a clean modifier hook class so your stylesheet can target mobile styles cleanly
  mobileMenuClone.classList.add('mobile-accordion-root');

  // Directly attach the pre-built DOM tree to the drawer's layout body
  body.append(mobileMenuClone);

  return body;
}

// =========================================================================
// ALIAS EXPORT TO MAP YOUR DRAWER ENGINE TO THE CONTROLLER TIMELINE
// =========================================================================
export { renderMobileNavigation as renderMobileRenderer };
