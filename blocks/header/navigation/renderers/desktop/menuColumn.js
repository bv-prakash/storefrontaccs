import {
  createElement,
  createLink,
  hasChildren,
} from '../../utils.js';

import { renderMenuItem } from './menuItem.js';

/**
 * Render a mega menu column.
 *
 * Structure:
 *
 * Indoor Lighting
 * ----------------
 * • Chandeliers
 * • Pendants
 * • Flush Mount
 *
 * @param {Object} category
 * @returns {HTMLElement}
 */
export function renderMenuColumn(category) {
  const column = createElement('section', 'mega-menu__column');

  column.dataset.id = category.id;

  // Category Heading
  const heading = createElement('h3', 'mega-menu__heading');

  const headingLink = createLink(category);

  headingLink.classList.add('mega-menu__heading-link');

  heading.append(headingLink);

  column.append(heading);

  if (!hasChildren(category)) {
    return column;
  }

  // Child Categories
  const list = createElement('ul', 'mega-menu__list');

  category.children.forEach((child) => {
    list.append(renderMenuItem(child));
  });

  column.append(list);

  return column;
}
