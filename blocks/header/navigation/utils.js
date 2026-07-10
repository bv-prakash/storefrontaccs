/**
 * Returns true if the menu item has child items.
 *
 * @param {Object} item
 * @returns {boolean}
 */
export function hasChildren(item) {
  return Array.isArray(item?.children) && item.children.length > 0;
}

/**
 * Returns true if this is a commerce menu.
 *
 * @param {Object} item
 * @returns {boolean}
 */
export function isCommerceMenu(item) {
  return item?.type === 'commerce';
}

/**
 * Returns true if this is a custom menu.
 *
 * @param {Object} item
 * @returns {boolean}
 */
export function isCustomMenu(item) {
  return item?.type === 'custom';
}

/**
 * Returns true if this is a normal link.
 *
 * @param {Object} item
 * @returns {boolean}
 */
export function isLink(item) {
  return item?.type === 'link';
}

/**
 * Creates an element with optional class names.
 *
 * @param {string} tag
 * @param {string|string[]} classNames
 * @returns {HTMLElement}
 */
export function createElement(tag, classNames = []) {
  const element = document.createElement(tag);

  if (!classNames) {
    return element;
  }

  if (Array.isArray(classNames)) {
    element.classList.add(...classNames);
  } else {
    element.classList.add(classNames);
  }

  return element;
}

/**
 * Creates a navigation link.
 *
 * @param {Object} item
 * @returns {HTMLAnchorElement}
 */
export function createLink(item) {
  const link = document.createElement('a');

  link.href = item.url || '#';
  link.textContent = item.title;

  return link;
}

/**
 * Creates a button.
 *
 * @param {string} label
 * @returns {HTMLButtonElement}
 */
export function createButton(label) {
  const button = document.createElement('button');

  button.type = 'button';
  button.textContent = label;

  return button;
}

/**
 * Recursively walk a category tree.
 * Fixed: Moved required parameter 'callback' first, optional last.
 *
 * @param {Function} callback
 * @param {Array} items
 */
export function walkTree(callback, items = []) {
  items.forEach((item) => {
    callback(item);

    if (hasChildren(item)) {
      walkTree(callback, item.children);
    }
  });
}

/**
 * Finds a menu item by id.
 * Fixed: Moved required parameter 'id' first, optional last.
 *
 * @param {string} id
 * @param {Array} items
 * @returns {Object|null}
 */
export function findMenuItem(id, items = []) {
  let result = null;

  walkTree((item) => {
    if (item.id === id) {
      result = item;
    }
  }, items);

  return result;
}

/**
 * Returns a flattened array of all menu items.
 *
 * @param {Array} items
 * @returns {Array}
 */
export function flattenTree(items = []) {
  const flattened = [];

  walkTree((item) => flattened.push(item), items);

  return flattened;
}
