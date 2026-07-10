import {
  createElement,
  createLink,
  hasChildren,
} from '../../utils.js';

/**
 * Render a menu item.
 *
 * @param {Object} item
 * @param {Object} options
 * @param {boolean} options.showChildren
 * @returns {HTMLLIElement}
 */
export function renderMenuItem(
  item,
  {
    showChildren = false,
  } = {},
) {
  const listItem = createElement('li', 'menu-item');

  listItem.dataset.id = item.id;

  if (item.type) {
    listItem.dataset.type = item.type;
  }

  const link = createLink(item);
  link.classList.add('menu-item__link');

  listItem.append(link);

  if (showChildren && hasChildren(item)) {
    const childList = createElement('ul', 'menu-item__children');

    item.children.forEach((child) => {
      childList.append(
        renderMenuItem(child, {
          showChildren: false,
        }),
      );
    });

    listItem.append(childList);
  }

  return listItem;
}
