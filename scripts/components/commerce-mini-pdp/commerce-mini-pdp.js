import { events } from '@dropins/tools/event-bus.js';
import { render as pdpRender } from '@dropins/storefront-pdp/render.js';
import {
  setEndpoint,
  fetchProductData,
  initialize,
  setProductConfigurationValues,
  getProductConfigurationValues,
  isProductConfigurationValid,
} from '@dropins/storefront-pdp/api.js';
import { initializers } from '@dropins/tools/initializer.js';
import {
  InLineAlert,
  Icon,
  Button,
  provider as UI,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import * as Cart from '@dropins/storefront-cart/api.js';

import ProductHeader from '@dropins/storefront-pdp/containers/ProductHeader.js';
import ProductPrice from '@dropins/storefront-pdp/containers/ProductPrice.js';
import ProductOptions from '@dropins/storefront-pdp/containers/ProductOptions.js';
import ProductQuantity from '@dropins/storefront-pdp/containers/ProductQuantity.js';
import ProductGallery from '@dropins/storefront-pdp/containers/ProductGallery.js';

import '../../initializers/cart.js';

import {
  fetchPlaceholders,
  CS_FETCH_GRAPHQL,
  getProductLink,
  rootLink,
} from '../../commerce.js';
import { loadCSS } from '../../aem.js';
import { showNotification } from '../notification.js';

const MINI_PDP_SCOPE = 'modal';

const IMAGES_SIZES = {
  width: 800,
  height: 800,
};

const THUMBNAIL_SIZES = {
  width: 100,
  height: 100,
};

function renderSkuDetails(product, targetContainer) {
  targetContainer.innerHTML = '';
  const skuContainer = document.createElement('div');
  skuContainer.className = 'pdp-sku-info';

  const rawSku = product?.sku || '';
  const seriesName = product?.series || 'SERIES';

  skuContainer.innerHTML = `
    <strong class="pdp-sku-label">${seriesName}:</strong>
    <span class="pdp-sku-value">${rawSku}</span>
  `;

  targetContainer.appendChild(skuContainer);
}

function renderStockStatus(product, targetContainer) {
  targetContainer.innerHTML = '';
  const statusContainer = document.createElement('div');

  const inStock = product?.inStock ?? (product?.stockStatus === 'IN_STOCK');
  statusContainer.className = `pdp-stock-status ${inStock ? 'is-in-stock' : 'is-out-of-stock'}`;

  statusContainer.innerHTML = `
    <span class="pdp-stock-text">${inStock ? 'In Stock' : 'Out of Stock'}</span>
  `;

  targetContainer.appendChild(statusContainer);
}

function imageSlotConfig(ctx) {
  const { data, defaultImageProps } = ctx;
  return {
    alias: data.sku,
    imageProps: defaultImageProps,

    params: {
      width: defaultImageProps.width,
      height: defaultImageProps.height,
    },
  };
}

async function getFreshCartItem(cartItemUid) {
  try {
    const cartData = await Cart.getCartData();
    if (!cartData?.items) return null;
    return cartData.items.find((item) => item.uid === cartItemUid) || null;
  } catch {
    return null;
  }
}

function resolveMiniPdpContext(input) {
  if (input?.uid) {
    return { mode: 'cart', cartItem: input };
  }
  return {
    mode: 'quickView',
    sku: input?.sku,
    urlKey: input?.urlKey,
    imageFallback: input?.image,
  };
}

async function mountMiniPdpProduct(sku, optionsUIDs, placeholders, product) {
  setEndpoint(CS_FETCH_GRAPHQL);

  const langDefinitions = { default: placeholders };

  await initializers.mountImmediately(initialize, {
    scope: MINI_PDP_SCOPE,
    sku,
    optionsUIDs,
    langDefinitions,
    models: {
      ProductDetails: {
        initialData: { ...product },
        fallbackData: (parent, refinedData) => ({
          ...parent,
          ...refinedData,
          images: refinedData.images?.length > 0 ? refinedData.images : parent.images,
          description: refinedData.description && refinedData.description !== ''
            ? refinedData.description
            : parent.description,
        }),
      },
    },
    acdl: false,
    persistURLParams: false,
  });
}

export default async function createMiniPDP(input, onSuccess, onClose) {
  const codeBase = window.hlx.codeBasePath;
  await Promise.all([
    loadCSS(`${codeBase}/blocks/product-details/product-details.css`),
    loadCSS(`${codeBase}/scripts/components/commerce-mini-pdp/commerce-mini-pdp.css`),
  ]);

  const placeholders = await fetchPlaceholders();
  const ctx = resolveMiniPdpContext(input);
  const isQuickView = ctx.mode === 'quickView';

  let sku;
  let optionsUIDs;
  let initialQuantity = 1;

  if (isQuickView) {
    sku = ctx.sku;
    if (!sku) throw new Error('Product SKU is required');
  } else {
    const freshCartItem = await getFreshCartItem(ctx.cartItem.uid) || ctx.cartItem;
    sku = freshCartItem.topLevelSku || freshCartItem.sku;
    initialQuantity = freshCartItem.quantity || 1;
    optionsUIDs = freshCartItem.selectedOptionsUIDs
      ? Object.values(freshCartItem.selectedOptionsUIDs).filter(Boolean)
      : undefined;
  }

  try {
    setEndpoint(CS_FETCH_GRAPHQL);

    const product = await fetchProductData(sku, {
      optionsUIDs,
      skipTransform: true,
    });

    if (!product?.sku) {
      throw new Error('Product data not available');
    }

    await mountMiniPdpProduct(sku, optionsUIDs, placeholders, product);

    setProductConfigurationValues((prev) => ({
      ...prev,
      quantity: initialQuantity,
    }), { scope: MINI_PDP_SCOPE });

    const miniPDPContainer = document.createElement('div');
    miniPDPContainer.id = 'mini-pdp-modal';
    miniPDPContainer.className = isQuickView
      ? 'commerce-mini-pdp commerce-mini-pdp--quick-view'
      : 'commerce-mini-pdp';

    const productUrl = getProductLink(product.urlKey, product.sku);

    const fragment = document.createRange().createContextualFragment(`
      <div class="product-details__alert mini-pdp__alert"></div>
      <div class="product-details__wrapper mini-pdp__wrapper">
        <div class="product-details__left-column">
          <div class="product-details__gallery desktop-gallery mini-pdp__gallery"></div>
          <div class="product-details__gallery mobile-gallery mini-pdp__gallery"></div>
        </div>
        <div class="product-details__right-column">
          <div class="product-details__header mini-pdp__header"></div>
          <div class="product-details__meta-info">
            <div class="product-details__sku"></div>
            <div class="product-details__stock"></div>
          </div>
          <div class="product-details__price mini-pdp__price"></div>
          <div class="product-details__configuration mini-pdp__configuration">
            <div class="product-details__options mini-pdp__options"></div>
            <div class="product-details__buttons mini-pdp__buttons">
              <div class="product-details__quantity mini-pdp__quantity"></div>
              <div class="product-details__buttons__add-to-cart mini-pdp__primary-button"></div>
            </div>
          </div>
          <div class="mini-pdp__footer-actions">
            <div class="mini-pdp__cancel-button"></div>
            <div class="mini-pdp__buttons__redirect-to-pdp"></div>
          </div>
        </div>
      </div>
    `);

    const $alert = fragment.querySelector('.mini-pdp__alert');
    const $gallery = fragment.querySelector('.product-details__gallery.desktop-gallery');
    const $galleryMobile = fragment.querySelector('.product-details__gallery.mobile-gallery');
    const $header = fragment.querySelector('.mini-pdp__header');
    const $sku = fragment.querySelector('.product-details__sku');
    const $stock = fragment.querySelector('.product-details__stock');
    const $price = fragment.querySelector('.mini-pdp__price');
    const $options = fragment.querySelector('.mini-pdp__options');
    const $quantity = fragment.querySelector('.mini-pdp__quantity');
    const $primaryButton = fragment.querySelector('.mini-pdp__primary-button');
    const $cancelButton = fragment.querySelector('.mini-pdp__cancel-button');
    const $redirectButton = fragment.querySelector('.mini-pdp__buttons__redirect-to-pdp');

    miniPDPContainer.appendChild(fragment);

    renderSkuDetails(product, $sku);
    renderStockStatus(product, $stock);

    let isLoading = false;
    let isOutOfStock = product?.inStock === false;
    let inlineAlert = null;

    const primaryLabel = isQuickView
      ? placeholders?.Global?.AddProductToCart
      : placeholders?.Global?.UpdateProductInCart;
    const primaryLoadingLabel = isQuickView
      ? placeholders?.Global?.AddingToCart
      : placeholders?.Global?.UpdatingInCart;

    const galleryOptions = {
      scope: MINI_PDP_SCOPE,
      peak: false,
      gap: 'small',
      loop: false,
      videos: true,
      imageParams: { ...IMAGES_SIZES },
      thumbnailParams: { ...THUMBNAIL_SIZES },
    };

    const [
      _galleryMobile,
      _gallery,
      _header,
      _priceInstance,
      _optionsInstance,
      _quantityInstance,
      primaryButton,
      _cancelButton,
      _viewDetailsButton,
    ] = await Promise.all([
      pdpRender.render(ProductGallery, {
        ...galleryOptions,
        controls: 'dots',
        arrows: true,
      })($galleryMobile),

      pdpRender.render(ProductGallery, {
        ...galleryOptions,
        controls: 'thumbnailsRow',
        arrows: false,
      })($gallery),

      pdpRender.render(ProductHeader, { scope: MINI_PDP_SCOPE })($header),

      pdpRender.render(ProductPrice, { scope: MINI_PDP_SCOPE })($price),

      pdpRender.render(ProductOptions, {
        hideSelectedValue: false,
        scope: MINI_PDP_SCOPE,
        slots: {
          SwatchImage: (swatchCtx) => {
            tryRenderAemAssetsImage(swatchCtx, {
              ...imageSlotConfig(swatchCtx),
              wrapper: document.createElement('span'),
            });
          },
        },
      })($options),

      pdpRender.render(ProductQuantity, { scope: MINI_PDP_SCOPE })($quantity),

      UI.render(Button, {
        children: primaryLabel,
        icon: h(Icon, { source: 'Cart' }),
        onClick: async () => {
          if (isLoading) return;

          try {
            isLoading = true;
            primaryButton.setProps((prev) => ({
              ...prev,
              children: primaryLoadingLabel,
              disabled: true,
            }));

            const values = getProductConfigurationValues({ scope: MINI_PDP_SCOPE });
            const valid = isProductConfigurationValid({ scope: MINI_PDP_SCOPE });

            if (!valid) {
              throw new Error('Please select all required options');
            }

            if (isQuickView) {
              await Cart.addProductsToCart([{ ...values }]);
              showNotification({
                type: 'success',
                message: `${product.name} added to your cart.`,
                linkText: placeholders?.Global?.CartTitle || 'View Cart',
                linkUrl: rootLink('/cart'),
              });
              onClose?.();
            } else {
              const freshCartItem = await getFreshCartItem(ctx.cartItem.uid) || ctx.cartItem;
              const updateData = { ...values, uid: freshCartItem.uid };
              const updateResponse = await Cart.updateProductsFromCart([updateData]);
              events.emit('cart/updated', updateResponse);
              onSuccess?.(updateData);
              onClose?.();
            }

            inlineAlert?.remove();
          } catch (error) {
            inlineAlert?.remove();
            inlineAlert = await UI.render(InLineAlert, {
              heading: 'Error',
              description: error.message,
              icon: h(Icon, { source: 'Warning' }),
              'aria-live': 'assertive',
              role: 'alert',
              onDismiss: () => {
                inlineAlert.remove();
              },
            })($alert);
            $alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } finally {
            isLoading = false;
            primaryButton.setProps((prev) => ({
              ...prev,
              children: primaryLabel,
              disabled: isOutOfStock || !isProductConfigurationValid({ scope: MINI_PDP_SCOPE }),
            }));
          }
        },
        disabled: isLoading || isOutOfStock,
      })($primaryButton),

      UI.render(Button, {
        children: placeholders?.Global?.Cancel,
        variant: 'secondary',
        size: 'medium',
        onClick: onClose,
      })($cancelButton),

      UI.render(Button, {
        children: placeholders?.Global?.ViewAllDetails,
        variant: 'tertiary',
        size: 'medium',
        onClick: () => {
          onClose?.();
          window.location.href = productUrl;
        },
      })($redirectButton),
    ]);

    events.on(
      'pdp/data',
      (data) => {
        if (!data) return;
        isOutOfStock = data?.inStock === false;
        primaryButton.setProps((prev) => ({
          ...prev,
          disabled: isOutOfStock || isLoading,
        }));
        renderSkuDetails(data, $sku);
        renderStockStatus(data, $stock);
      },
      { eager: true, scope: MINI_PDP_SCOPE },
    );

    events.on(
      'pdp/valid',
      (valid) => {
        primaryButton.setProps((prev) => ({
          ...prev,
          disabled: !valid || isLoading || isOutOfStock,
        }));
      },
      { eager: true, scope: MINI_PDP_SCOPE },
    );

    return miniPDPContainer;
  } catch (error) {
    const errorContainer = document.createElement('div');
    errorContainer.className = 'commerce-mini-pdp commerce-mini-pdp--error';
    errorContainer.innerHTML = `
      <div class="mini-pdp__error">
        <h3>Error</h3>
        <p>${error.message || placeholders?.Global?.ProductLoadError}</p>
        <button type="button" class="mini-pdp__close-button">Close</button>
      </div>
    `;
    errorContainer.querySelector('.mini-pdp__close-button').addEventListener('click', onClose);
    return errorContainer;
  }
}
