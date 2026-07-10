/**
 * Standardized Desktop Navigation Renderer
 * Directly mounts the exact tree markup structure built by menuBuilder.js
 * @param {Element} menuDom - The semantic <ul> element output by generateMenuMarkup
 * @param {Element} headerElement - The global header block container wrapper
 */
export function renderDesktopRenderer(menuDom, headerElement) {
  // 1. Target the correct block container placement in the AEM layout
  const insertionPoint = headerElement.querySelector('.nav-sections') || headerElement;

  // 2. Remove duplicate local nav elements to prevent stacking
  const selectors = [
    'nav[data-role="navigation"]',
    '.nav-desktop-menu-wrapper',
    '.navigation-desktop-wrapper',
  ].join(',');

  const oldNav = insertionPoint.querySelector(selectors);
  if (oldNav) {
    oldNav.remove();
  }

  // 3. Construct a standard, generic navigation block container wrapper
  const navContainer = document.createElement('div');
  navContainer.id = 'nav';
  navContainer.className = 'navigation-desktop-wrapper';
  navContainer.setAttribute('data-action', 'navigation');
  navContainer.setAttribute('role', 'navigation');

  // 4. Cleanly mount the exact nested tree built by createMarkupFromTree
  /* (This ensures all role="menuitem", level0, level1,
   and ui-menu attributes stay perfectly intact) */
  navContainer.appendChild(menuDom);

  // 5. Safely append the finished, correctly structured module to the DOM
  insertionPoint.appendChild(navContainer);
}
