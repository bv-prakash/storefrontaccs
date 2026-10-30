import GiftOptions from '@dropins/storefront-cart/containers/GiftOptions.js';
import { render as CartProvider } from '@dropins/storefront-cart/render.js';

import { readBlockConfig } from '../../scripts/aem.js';
import {
  bindCartGiftOptionsVisibility,
  buildOrderGiftOptionsProps,
  ensureCartReady,
  parseBlockFlag,
  renderGiftOptionsSwatchImage,
} from '../../scripts/gift-options-ui.js';

function resolveDataSource(raw) {
  const value = (raw || 'cart').toLowerCase();
  return value === 'order' ? 'order' : 'cart';
}

function resolveReadOnlyView(raw) {
  return (raw || 'primary').toLowerCase() === 'secondary' ? 'secondary' : 'primary';
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const dataSource = resolveDataSource(config['data-source'] || config.datasource);
  const isEditable = parseBlockFlag(
    config.editable,
    dataSource === 'cart',
  );
  const readOnlyFormOrderView = resolveReadOnlyView(config['read-only-view']);

  block.classList.add('commerce-gift-options');
  block.dataset.giftOptionsSource = dataSource;

  const mount = document.createElement('div');
  mount.className = 'commerce-gift-options__mount cart-gift-options-view';
  block.replaceChildren(mount);

  await ensureCartReady();

  const giftProps = dataSource === 'cart'
    ? buildOrderGiftOptionsProps({ isEditable, readOnlyFormOrderView })
    : {
      view: 'order',
      dataSource: 'order',
      isEditable,
      readOnlyFormOrderView,
      initialLoading: false,
      slots: {
        SwatchImage: renderGiftOptionsSwatchImage,
      },
    };

  await CartProvider.render(GiftOptions, giftProps)(mount);

  if (dataSource === 'cart') {
    bindCartGiftOptionsVisibility(mount);
  }
}
