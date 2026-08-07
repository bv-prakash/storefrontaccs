import { Icon } from '@dropins/tools/components.js';
import { render as accountRenderer } from '@dropins/storefront-account/render.js';
import { loadFragment } from '../fragment/fragment.js';
import { CUSTOMER_ORDERS_PATH, rootLink } from '../../scripts/commerce.js';

export default async function decorate(block) {
  const fragment = await loadFragment('/customer/sidebar-fragment');
  const sidebarItemsConfig = fragment.querySelectorAll('.default-content-wrapper > ol > li');
  const sidebarItems = Array.from(sidebarItemsConfig).map((item) => {
    const itemParams = Array.from(item.querySelectorAll('ol > li'));
    const itemTitle = item.childNodes[0]?.textContent?.trim() || item.querySelector(':scope > p')?.textContent?.trim() || 'Default Title';
    const itemLink = itemParams[0]?.innerText || rootLink('#');
    const itemIcon = itemParams[1]?.innerText || 'Placeholder';
    const itemConfig = {
      itemTitle,
      itemLink,
      itemIcon,
    };

    const menuItemEl = document.createElement('a');
    menuItemEl.classList.add('commerce-account-sidebar-item');
    menuItemEl.href = rootLink(itemConfig.itemLink);

    const isItemActive = (
      itemConfig.itemLink === CUSTOMER_ORDERS_PATH
        ? window.location.href.includes(CUSTOMER_ORDERS_PATH)
        : window.location.href.includes(itemConfig.itemLink)
    );
    if (isItemActive) {
      menuItemEl.classList.add('commerce-account-sidebar-item-active');
    }

    const iconEl = createMenuItemIcon(itemConfig.itemIcon);
    const contentEl = createMenuItemContent(itemConfig.itemTitle);

    menuItemEl.appendChild(iconEl);
    menuItemEl.appendChild(contentEl);

    return menuItemEl;
  });

  block.innerHTML = '';
  sidebarItems.forEach((el) => {
    block.appendChild(el);
  });
}

function createMenuItemIcon(iconSource) {
  const iconEl = document.createElement('div');
  iconEl.classList.add('commerce-account-sidebar-item-icon');
  accountRenderer.render(Icon, { source: iconSource, size: 26 })(iconEl);
  return iconEl;
}

function createMenuItemContent(title) {
  const contentEl = document.createElement('div');
  contentEl.classList.add('commerce-account-sidebar-item-content');

  const titleEl = document.createElement('p');
  titleEl.classList.add('commerce-account-sidebar-item-title');
  titleEl.innerText = title;

  contentEl.appendChild(titleEl);
  return contentEl;
}
