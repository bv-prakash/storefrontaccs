/**
 * Parses the HTML structure that header.js already placed on the page,
 * extracts custom categories, and handles both standalone custom items
 * and deep target bucket categories identically.
 */
function parseCustomCategories(existingNavDom) {
  const customMap = {};

  const rootLists = existingNavDom.querySelectorAll(':scope > ul, :scope .default-content-wrapper > ul');

  rootLists.forEach((rootUl) => {
    const primaryItems = rootUl.querySelectorAll(':scope > li');

    primaryItems.forEach((li) => {
      const anchor = li.querySelector(':scope > a, :scope > span');
      const nestedUl = li.querySelector(':scope > ul');

      if (!anchor) return;
      const itemName = anchor.textContent.trim();
      const matchKey = itemName.toLowerCase();

      let children = [];
      if (nestedUl) {
        children = Array.from(nestedUl.querySelectorAll(':scope > li')).map((subLi) => {
          const a = subLi.querySelector('a');
          const deepestUl = subLi.querySelector('ul');

          return {
            id: `custom-${Math.random().toString(36).substr(2, 9)}`,
            name: a ? a.textContent.trim() : subLi.firstChild.textContent.trim(),
            url_path: a ? a.getAttribute('href') : '#',
            isCustom: true,
            children: deepestUl ? Array.from(deepestUl.querySelectorAll(':scope > li')).map((dLi) => {
              const dA = dLi.querySelector('a');
              return {
                id: `custom-${Math.random().toString(36).substr(2, 9)}`,
                name: dA ? dA.textContent.trim() : dLi.textContent.trim(),
                url_path: dA ? dA.getAttribute('href') : '#',
                isCustom: true,
                children: [],
              };
            }) : [],
          };
        });
      }

      customMap[matchKey] = {
        name: itemName,
        url_path: anchor.getAttribute('href') || '#',
        children,
        isCustom: true,
      };
    });
  });

  return customMap;
}

/**
 * Cleanly merges dynamic commerce arrays and authored trees together.
 */
function blendNavigationTrees(commerceItems, customMap) {
  const customMapCopy = { ...customMap };

  const filteredCommerce = commerceItems.filter((category) => {
    const nameLow = category.name.trim().toLowerCase();
    const urlLow = (category.url_path || '').toLowerCase();
    return nameLow !== 'all' && urlLow !== 'all' && urlLow !== 'products/all';
  });

  const blendedCommerce = filteredCommerce.map((category) => {
    const categoryNameNormalized = category.name.trim().toLowerCase();
    let blendedChildren = [];

    if (category.children && category.children.length > 0) {
      blendedChildren = blendNavigationTrees(category.children, customMapCopy);
    }

    if (customMapCopy[categoryNameNormalized]) {
      const customData = customMapCopy[categoryNameNormalized];
      blendedChildren = [...blendedChildren, ...customData.children];
      delete customMapCopy[categoryNameNormalized];
    }

    return {
      ...category,
      children: blendedChildren,
    };
  });

  const standaloneCustomItems = Object.keys(customMapCopy).map((key) => ({
    id: `custom-${Math.random().toString(36).substr(2, 9)}`,
    name: customMapCopy[key].name,
    url_path: customMapCopy[key].url_path,
    children: customMapCopy[key].children,
    isCustom: true,
  }));

  return [...blendedCommerce, ...standaloneCustomItems];
}

/**
 * Transforms your clean, merged JSON tree into a standardized multi-level menu
 * matching standard application layout requirements perfectly.
 */
function createMarkupFromTree(blendedTree, level = 0) {
  const ul = document.createElement('ul');

  if (level === 0) {
    ul.className = 'navigation'; // Main root bar
  } else {
    ul.setAttribute('role', 'menu');
    ul.className = `level${level - 1} submenu ui-menu ui-widget ui-widget-content ui-front`;
    ul.setAttribute('aria-expanded', 'false');
  }

  blendedTree.forEach((item) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'menuitem');

    // Construct paths
    let targetUrl = item.url_path || '#';
    if (!item.isCustom && !targetUrl.startsWith('/') && !targetUrl.startsWith('http')) {
      targetUrl = `/products/${targetUrl}`;
    }
    if (targetUrl.endsWith('/all') || targetUrl === '/products/all') {
      targetUrl = '#';
    }

    const a = document.createElement('a');
    a.href = targetUrl;
    a.textContent = item.name;

    // Apply strict tier classes matching your requested DOM structure
    if (level === 0) {
      li.className = 'level0 level-top ui-menu-item fullwidth';
      a.className = 'level-top ui-menu-item-wrapper';
      if (item.children && item.children.length > 0) {
        li.classList.add('parent');
      }
    } else {
      li.className = `level${level} nav ui-menu-item`;
      a.className = 'ui-menu-item-wrapper';
    }

    li.appendChild(a);

    // Recursively process nested child arrays matching exact parameters
    if (item.children && item.children.length > 0) {
      const subUl = createMarkupFromTree(item.children, level + 1);
      li.appendChild(subUl);
    }

    ul.appendChild(li);
  });

  return ul;
}

/* --- EXPLICIT EXPORTS CONTAINER --- */
export {
  parseCustomCategories,
  blendNavigationTrees,
  createMarkupFromTree,
  createMarkupFromTree as generateMenuMarkup,
};
