import { events } from '@dropins/tools/event-bus.js';
import { render as pdpRender } from '@dropins/storefront-pdp/render.js';
import {
  fetchProductData,
  initialize,
  setEndpoint,
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
import ProductGiftCardOptions from '@dropins/storefront-pdp/containers/ProductGiftCardOptions.js';
import ProductDownloadableOptions from '@dropins/storefront-pdp/containers/ProductDownloadableOptions.js';

import '../../initializers/cart.js';

import {
  CS_FETCH_GRAPHQL,
  fetchPlaceholders,
  getProductLink,
  rootLink,
} from '../../commerce.js';
import { loadCSS } from '../../aem.js';
import { showNotification } from '../notification.js';
import {
  buildCartLinesForAddToCart,
  buildCartLineUpdatePayload,
  executeCartLineUpdate,
  isCartLineReconfigureUpdate,
  mapOptionsUIDsForPdpConfiguration,
  areOptionUidSetsEquivalent,
  getCartLineCustomizableOptionsUIDs,
  isCartEditConfigurationReady,
  mountProductInputOptions,
  resetConfigurationForSimpleProduct,
} from '../product-input-options/product-input-options.js';
import { mountGroupedProductOptions } from '../grouped-product-options/grouped-product-options.js';
import {
  fetchCatalogProductForCartEdit,
  getCartLineCatalogOptionsUIDs,
  getCartLineConfigurationSnapshot,
  getCartLineSelectedOptionsUIDs,
  getCartLineSelectionSummary,
  getCartLineUid,
  resolveCartLineItem,
  resolveCartLineForEdit,
  shouldOfferCartItemEdit,
  waitForCartRefreshAfterUpdate,
  cartHasLineItems,
} from './cart-line.js';

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

function renderSwatchImage(swatchCtx) {
  tryRenderAemAssetsImage(swatchCtx, {
    ...imageSlotConfig(swatchCtx),
    wrapper: document.createElement('span'),
  });
}

async function getFreshCartItem(cartItemUid) {
  const find = (cartData) => cartData?.items?.find(
    (item) => getCartLineUid(item) === cartItemUid,
  ) || null;

  const cached = find(Cart.getCartDataFromCache());
  if (cached) {
    return cached;
  }

  try {
    return find(await Cart.getCartData()) || cached;
  } catch {
    return cached;
  }
}

function isCartLineInput(input) {
  if (!input || typeof input !== 'object') {
    return false;
  }
  if (input.itemType && String(input.itemType).endsWith('CartItem')) {
    return true;
  }
  if (input.uid && (
    input.quantity != null
    || input.selectedOptions != null
    || input.selectedOptionsUIDs != null
  )) {
    return true;
  }
  return false;
}

function resolveMiniPdpContext(input) {
  if (input?.mode === 'quickView') {
    return {
      mode: 'quickView',
      sku: input.sku,
      urlKey: input.urlKey,
    };
  }
  if (input?.mode === 'cart') {
    return { mode: 'cart', cartItem: input.cartItem ?? input };
  }
  if (isCartLineInput(input)) {
    return { mode: 'cart', cartItem: input };
  }
  return {
    mode: 'quickView',
    sku: input?.sku,
    urlKey: input?.urlKey,
  };
}

function ensureMiniPdpCatalogEndpoint() {
  setEndpoint(CS_FETCH_GRAPHQL);
}

function resolveMiniPdpProductUrl(product, fallbackUrlKey) {
  const urlKey = product?.urlKey
    ?? fallbackUrlKey
    ?? product?.url?.urlKey;
  const sku = product?.sku || product?.variantSku;
  return getProductLink(urlKey, sku);
}

function productResponseHasSku(product) {
  return !!(product?.sku || product?.variantSku);
}

async function fetchMiniPdpProduct(catalogSku, optionsUIDs) {
  if (!catalogSku) {
    return null;
  }
  ensureMiniPdpCatalogEndpoint();
  return fetchProductData(catalogSku, {
    optionsUIDs,
    skipTransform: true,
  });
}

let miniPdpStylesPromise;

function loadMiniPdpStyles(codeBase) {
  if (!miniPdpStylesPromise) {
    miniPdpStylesPromise = Promise.all([
      loadCSS(`${codeBase}/blocks/product-details/product-details.css`),
      loadCSS(`${codeBase}/scripts/components/commerce-mini-pdp/commerce-mini-pdp.css`),
      loadCSS(`${codeBase}/scripts/components/product-input-options/product-input-options.css`),
      loadCSS(`${codeBase}/scripts/components/grouped-product-options/grouped-product-options.css`),
    ]);
  }
  return miniPdpStylesPromise;
}

function renderCartLineSelectionSummary(target, cartLine, placeholders) {
  const { name, sku, rows } = getCartLineSelectionSummary(cartLine);
  if (!name && !rows.length) {
    return;
  }

  const title = placeholders?.Global?.CurrentSelection
    || placeholders?.Global?.CartEditOptions
    || 'Current selection';

  const list = rows.length
    ? `<ul class="mini-pdp__cart-line-summary-list">${rows.map(
      (row) => `<li><span class="mini-pdp__cart-line-summary-label">${row.label}:</span> ${row.value}</li>`,
    ).join('')}</ul>`
    : '';

  target.innerHTML = `
    <div class="mini-pdp__cart-line-summary">
      <p class="mini-pdp__cart-line-summary-title">${title}</p>
      <p class="mini-pdp__cart-line-summary-name">${name}</p>
      ${sku ? `<p class="mini-pdp__cart-line-summary-sku">${sku}</p>` : ''}
      ${list}
    </div>
  `;
}

function buildPdpSnapshotFromCart(cartLine, productData, snapshot) {
  if (!snapshot) return null;
  const optionsUIDs = snapshot.optionsUIDs?.length
    ? mapOptionsUIDsForPdpConfiguration(snapshot.optionsUIDs, productData, cartLine)
    : [];
  return {
    ...snapshot,
    optionsUIDs,
    sku: cartLine?.sku || productData?.variantSku || productData?.sku,
  };
}

function applyCartLineConfigurationToModal(cartLine, productData, snapshot) {
  if (!cartLine || !snapshot) return;

  const pdpSnapshot = buildPdpSnapshotFromCart(cartLine, productData, snapshot);
  if (!pdpSnapshot) return;

  setProductConfigurationValues((prev) => ({
    ...prev,
    sku: pdpSnapshot.sku || prev?.sku,
    quantity: pdpSnapshot.quantity,
    ...(pdpSnapshot.optionsUIDs?.length ? { optionsUIDs: [...pdpSnapshot.optionsUIDs] } : {}),
    ...(pdpSnapshot.enteredOptions?.length ? { enteredOptions: pdpSnapshot.enteredOptions } : {}),
  }), { scope: MINI_PDP_SCOPE });
}

function cartEditConfigurationMatches(values, snapshot, productData, cartLine) {
  if (!snapshot?.optionsUIDs?.length) {
    return true;
  }
  const expected = mapOptionsUIDsForPdpConfiguration(snapshot.optionsUIDs, productData, cartLine);
  const current = values?.optionsUIDs ?? [];
  return areOptionUidSetsEquivalent(expected, current, productData, cartLine);
}

export function createMiniPdpLoadingPlaceholder(message = 'Loading product…') {
  const el = document.createElement('div');
  el.className = 'commerce-mini-pdp commerce-mini-pdp--loading';
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = `<p class="mini-pdp__loading">${message}</p>`;
  return el;
}

function buildCartEditSnapshot(cartLine, product) {
  let optionsUIDs = getCartLineSelectedOptionsUIDs(cartLine);
  if (!optionsUIDs.length) {
    optionsUIDs = [
      ...(getCartLineCatalogOptionsUIDs(cartLine) || []),
      ...getCartLineCustomizableOptionsUIDs(cartLine, product),
    ];
  }
  return {
    ...getCartLineConfigurationSnapshot(cartLine, product),
    optionsUIDs,
  };
}

async function mountMiniPdpProduct(sku, optionsUIDs, placeholders, product, isCartEdit = false) {
  const langDefinitions = { default: placeholders };
  let mountOptionsUIDs = optionsUIDs;
  if (isCartEdit) {
    mountOptionsUIDs = optionsUIDs?.length ? optionsUIDs : undefined;
  }

  await initializers.mountImmediately(initialize, {
    scope: MINI_PDP_SCOPE,
    sku,
    optionsUIDs: mountOptionsUIDs,
    preselectFirstOption: !isCartEdit && !optionsUIDs?.length,
    langDefinitions,
    models: {
      ProductDetails: {
        initialData: { ...product },
        transform: (raw, model) => ({
          ...model,
          inputOptions: Array.isArray(raw?.inputOptions) ? raw.inputOptions : [],
        }),
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
  const [placeholders] = await Promise.all([
    fetchPlaceholders(),
    loadMiniPdpStyles(codeBase),
  ]);
  const ctx = resolveMiniPdpContext(input);
  const isQuickView = ctx.mode === 'quickView';

  let sku;
  let optionsUIDs;
  let initialQuantity = 1;
  let cartLineItem = null;
  let cartEditSnapshot = null;

  if (isQuickView) {
    sku = ctx.sku;
    if (!sku) throw new Error('Product SKU is required');
  } else {
    cartLineItem = resolveCartLineItem(
      await getFreshCartItem(getCartLineUid(ctx.cartItem)) || ctx.cartItem,
    );
    if (!cartLineItem) {
      throw new Error('Cart line item is not available');
    }
    initialQuantity = cartLineItem.quantity || 1;
    optionsUIDs = getCartLineSelectedOptionsUIDs(cartLineItem);
  }

  try {
    ensureMiniPdpCatalogEndpoint();

    let product;
    let mountOptionUids = optionsUIDs;

    if (isQuickView) {
      product = await fetchMiniPdpProduct(sku, optionsUIDs);
      if (!productResponseHasSku(product)) {
        throw new Error('Product data not available');
      }
      if (ctx.urlKey && !product.urlKey) {
        product = { ...product, urlKey: ctx.urlKey };
      }
    } else {
      const fetched = await fetchCatalogProductForCartEdit(cartLineItem);
      if (!fetched) {
        throw new Error('Product data not available');
      }
      product = fetched.product;
      sku = fetched.catalogSku;
      cartEditSnapshot = buildCartEditSnapshot(cartLineItem, product);
      mountOptionUids = mapOptionsUIDsForPdpConfiguration(
        cartEditSnapshot.optionsUIDs,
        product,
        cartLineItem,
      );
      if (!mountOptionUids.length && cartEditSnapshot.optionsUIDs?.length) {
        mountOptionUids = [...cartEditSnapshot.optionsUIDs];
      }

      if (mountOptionUids.length) {
        const variantProduct = await fetchMiniPdpProduct(sku, mountOptionUids);
        if (productResponseHasSku(variantProduct)) {
          product = variantProduct;
        }
      }
    }

    await mountMiniPdpProduct(
      sku,
      mountOptionUids?.length ? mountOptionUids : undefined,
      placeholders,
      product,
      !isQuickView,
    );

    const miniPDPContainer = document.createElement('div');
    miniPDPContainer.id = 'mini-pdp-modal';
    miniPDPContainer.className = isQuickView
      ? 'commerce-mini-pdp commerce-mini-pdp--quick-view'
      : 'commerce-mini-pdp commerce-mini-pdp--cart-edit';

    const productUrl = resolveMiniPdpProductUrl(product, ctx.urlKey);

    const fragment = document.createRange().createContextualFragment(`
      <div class="product-details__alert mini-pdp__alert"></div>
      <div class="mini-pdp__cart-line-summary-mount"></div>
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
          <div class="product-details__gift-card-options mini-pdp__gift-card-options"></div>
          <div class="product-details__downloadable-options mini-pdp__downloadable-options"></div>
          <div class="product-details__configuration mini-pdp__configuration">
            <div class="product-details__input-options mini-pdp__input-options"></div>
            <div class="product-details__grouped-options pdp-grouped-products mini-pdp__grouped-options"></div>
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
    const $cartSummary = fragment.querySelector('.mini-pdp__cart-line-summary-mount');
    if (cartLineItem && $cartSummary) {
      renderCartLineSelectionSummary($cartSummary, cartLineItem, placeholders);
    }
    const $gallery = fragment.querySelector('.product-details__gallery.desktop-gallery');
    const $galleryMobile = fragment.querySelector('.product-details__gallery.mobile-gallery');
    const $header = fragment.querySelector('.mini-pdp__header');
    const $sku = fragment.querySelector('.product-details__sku');
    const $stock = fragment.querySelector('.product-details__stock');
    const $price = fragment.querySelector('.mini-pdp__price');
    const $giftCardOptions = fragment.querySelector('.mini-pdp__gift-card-options');
    const $downloadableOptions = fragment.querySelector('.mini-pdp__downloadable-options');
    const $inputOptions = fragment.querySelector('.mini-pdp__input-options');
    const $groupedOptions = fragment.querySelector('.mini-pdp__grouped-options');
    const $options = fragment.querySelector('.mini-pdp__options');
    const $quantity = fragment.querySelector('.mini-pdp__quantity');
    const $primaryButton = fragment.querySelector('.mini-pdp__primary-button');
    const $cancelButton = fragment.querySelector('.mini-pdp__cancel-button');
    const $redirectButton = fragment.querySelector('.mini-pdp__buttons__redirect-to-pdp');

    miniPDPContainer.appendChild(fragment);

    let isLoading = false;
    let isOutOfStock = product?.inStock === false;
    let inlineAlert = null;
    const isCartEditMode = Boolean(cartLineItem) && !isQuickView;

    const applyCartEditValues = (liveProduct = product) => {
      if (!cartEditSnapshot || !cartLineItem) return;
      applyCartLineConfigurationToModal(cartLineItem, liveProduct, cartEditSnapshot);
    };

    const isSubmitEnabled = () => {
      const scopeOpt = { scope: MINI_PDP_SCOPE };
      const productData = events.lastPayload('pdp/data', scopeOpt);
      const values = getProductConfigurationValues(scopeOpt);

      if (!isCartEditMode) {
        return isProductConfigurationValid(scopeOpt);
      }
      if (productData?.isBundle) {
        return isProductConfigurationValid(scopeOpt);
      }
      return isProductConfigurationValid(scopeOpt)
        || isCartEditConfigurationReady(productData, values, cartLineItem);
    };

    applyCartEditValues();

    const disposeCallbacks = [];
    const registerDispose = (unsubscribeOrSubscription) => {
      if (typeof unsubscribeOrSubscription === 'function') {
        disposeCallbacks.push(unsubscribeOrSubscription);
        return;
      }
      if (unsubscribeOrSubscription?.off) {
        disposeCallbacks.push(() => unsubscribeOrSubscription.off());
      }
    };

    registerDispose(mountProductInputOptions($inputOptions, {
      scope: MINI_PDP_SCOPE,
    }));
    registerDispose(mountGroupedProductOptions($groupedOptions, {
      scope: MINI_PDP_SCOPE,
      optionsContainer: $options,
      quantityContainer: $quantity,
    }));

    renderSkuDetails(product, $sku);
    renderStockStatus(product, $stock);
    const primaryLabel = isCartEditMode
      ? (placeholders?.Global?.UpdateProductInCart || 'Update cart')
      : (placeholders?.Global?.AddProductToCart || 'Add to cart');
    const primaryLoadingLabel = isCartEditMode
      ? (placeholders?.Global?.UpdatingInCart || 'Updating cart…')
      : (placeholders?.Global?.AddingToCart || 'Adding to cart…');

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
      _giftCardOptions,
      _downloadableOptions,
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
        initialData: {
          data: product,
          optionsUIDs: (() => {
            if (!cartEditSnapshot) {
              return mountOptionUids?.length ? mountOptionUids : [];
            }
            const mapped = buildPdpSnapshotFromCart(
              cartLineItem,
              product,
              cartEditSnapshot,
            )?.optionsUIDs;
            if (mapped?.length) return mapped;
            return mountOptionUids?.length ? mountOptionUids : [];
          })(),
        },
        slots: { SwatchImage: renderSwatchImage },
      })($options),

      pdpRender.render(ProductGiftCardOptions, { scope: MINI_PDP_SCOPE })($giftCardOptions),
      pdpRender.render(ProductDownloadableOptions, { scope: MINI_PDP_SCOPE })($downloadableOptions),

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
            const productData = events.lastPayload('pdp/data', { scope: MINI_PDP_SCOPE })
              || product;

            if (!productData) {
              throw new Error(
                placeholders?.Global?.ProductLoadError
                  || 'Product configuration is not loaded yet. Please wait and try again.',
              );
            }

            if (!isSubmitEnabled()) {
              throw new Error(
                placeholders?.Global?.SelectProductOptions
                  || 'Please select all required options before updating your cart.',
              );
            }

            if (!isCartEditMode) {
              const cartLines = buildCartLinesForAddToCart(
                values,
                productData,
                MINI_PDP_SCOPE,
              );
              await Cart.addProductsToCart(cartLines);
              showNotification({
                type: 'success',
                message: `${product.name} added to your cart.`,
                linkText: placeholders?.Global?.CartTitle || 'View Cart',
                linkUrl: rootLink('/cart'),
              });
              onClose?.();
            } else {
              const freshCartItem = resolveCartLineItem(
                await getFreshCartItem(getCartLineUid(cartLineItem)) || cartLineItem,
              );
              if (!freshCartItem?.uid) {
                throw new Error('Cart line item is not available');
              }
              const updateData = buildCartLineUpdatePayload(
                freshCartItem,
                values,
                productData,
              );
              const updatedCart = await waitForCartRefreshAfterUpdate(
                await executeCartLineUpdate(updateData),
                {
                  removedUid: isCartLineReconfigureUpdate(updateData)
                    ? updateData.uid
                    : undefined,
                },
              );
              if (!cartHasLineItems(updatedCart)) {
                throw new Error(
                  placeholders?.Global?.CartUpdateError
                    || 'Unable to update cart item.',
                );
              }
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
              disabled: isOutOfStock || !isSubmitEnabled(),
            }));
          }
        },
        disabled: isLoading || isOutOfStock || !isSubmitEnabled(),
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

    const syncPrimaryButton = () => {
      primaryButton.setProps((prev) => ({
        ...prev,
        disabled: isOutOfStock || isLoading || !isSubmitEnabled(),
      }));
    };

    if (!cartEditSnapshot) {
      setProductConfigurationValues((prev) => ({
        ...prev,
        quantity: initialQuantity,
      }), { scope: MINI_PDP_SCOPE });
    }
    let cartEditUserChangedOptions = false;
    let cartEditInitialApplied = false;

    syncPrimaryButton();
    queueMicrotask(() => {
      applyCartEditValues(
        events.lastPayload('pdp/data', { scope: MINI_PDP_SCOPE }) || product,
      );
      cartEditInitialApplied = true;
      syncPrimaryButton();
    });

    registerDispose(events.on(
      'pdp/data',
      (data) => {
        if (!data) return;
        isOutOfStock = data?.inStock === false;
        if (!cartLineItem) {
          resetConfigurationForSimpleProduct(data, MINI_PDP_SCOPE);
        } else if (cartEditSnapshot && !cartEditUserChangedOptions && !cartEditInitialApplied) {
          applyCartEditValues(data);
        }
        syncPrimaryButton();
        renderSkuDetails(data, $sku);
        renderStockStatus(data, $stock);
      },
      { eager: true, scope: MINI_PDP_SCOPE },
    ));

    registerDispose(events.on('pdp/valid', syncPrimaryButton, {
      eager: true,
      scope: MINI_PDP_SCOPE,
    }));

    registerDispose(events.on('pdp/values', (values) => {
      if (cartEditSnapshot && cartLineItem && cartEditInitialApplied) {
        const liveProduct = events.lastPayload('pdp/data', { scope: MINI_PDP_SCOPE }) || product;
        if (!cartEditConfigurationMatches(values, cartEditSnapshot, liveProduct, cartLineItem)) {
          cartEditUserChangedOptions = true;
        }
      }
      syncPrimaryButton();
    }, {
      eager: true,
      scope: MINI_PDP_SCOPE,
    }));

    miniPDPContainer._disposeMiniPdp = () => {
      disposeCallbacks.forEach((unsubscribe) => unsubscribe());
      miniPDPContainer._disposeMiniPdp = null;
    };

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

let activeEditModal = null;

export function disposeMiniPdpRoot(root = document.getElementById('mini-pdp-modal')) {
  root?._disposeMiniPdp?.();
}

export function closeCartItemEditModal() {
  disposeMiniPdpRoot();
  if (activeEditModal) {
    activeEditModal.removeModal();
    activeEditModal = null;
  }
}

export async function openCartItemEditModal(cartItem, options = {}) {
  const {
    placeholders = {},
    title,
    onUpdated,
    onError,
  } = options;

  closeCartItemEditModal();

  const modalTitle = title
    || placeholders?.Global?.CartEditOptions
    || placeholders?.Global?.UpdateProductInCart
    || 'Edit options';

  const loadingMessage = placeholders?.Global?.LoadingProduct
    || placeholders?.Global?.Loading
    || 'Loading product…';

  const onClose = () => closeCartItemEditModal();

  try {
    const { default: createModal } = await import('../../../blocks/modal/modal.js');
    const loadingEl = createMiniPdpLoadingPlaceholder(loadingMessage);

    activeEditModal = await createModal([loadingEl], {
      title: modalTitle,
      size: 'wide',
    });
    activeEditModal.showModal();

    const line = await resolveCartLineForEdit(cartItem);

    const miniPDPContent = await createMiniPDP(
      { mode: 'cart', cartItem: line },
      async () => {
        onUpdated?.();
        onClose();
      },
      onClose,
    );

    loadingEl.replaceWith(miniPDPContent);

    if (miniPDPContent?.setAttribute) {
      miniPDPContent.setAttribute('id', 'mini-pdp-modal');
    }
  } catch (error) {
    onError?.(error);
    closeCartItemEditModal();
    throw error;
  }
}

export function createCartItemEditButton({
  cartItem,
  placeholders,
  enableUpdatingProduct,
  className = 'cart-item-edit-link',
  iconSize = '32',
  onUpdated,
  onError,
}) {
  if (!shouldOfferCartItemEdit(cartItem, enableUpdatingProduct)) {
    return null;
  }

  const wrap = document.createElement('div');
  wrap.className = className;

  const ariaLabel = placeholders?.Global?.CartEditOptions
    || placeholders?.Global?.CartEditButton
    || 'Edit options';

  UI.render(Button, {
    variant: 'tertiary',
    size: 'medium',
    className: iconSize === '32'
      ? 'cart-cart-summary-table__item-edit-button'
      : 'dropin-cart-item__edit',
    'aria-label': ariaLabel,
    'data-testid': 'cart-item-edit-button',
    icon: h(Icon, { source: 'Edit', size: iconSize }),
    onClick: async () => {
      try {
        await openCartItemEditModal(cartItem, {
          placeholders,
          onUpdated,
          onError,
        });
      } catch (error) {
        onError?.(error);
      }
    },
  })(wrap);

  return wrap;
}

const MINICART_EDIT_ACTION_ATTR = 'data-accs-minicart-edit-actions';

function getMinicartDomRoot(slotCtx) {
  const anchor = slotCtx?.el ?? slotCtx?.element ?? slotCtx?.target;
  if (anchor instanceof Element) {
    const scoped = anchor.closest('.minicart-panel, .cart-mini-cart, .commerce-mini-cart');
    if (scoped) return scoped;
  }
  return document.querySelector('.minicart-panel, .cart-mini-cart') || document;
}

function removeMinicartEditActionNodes(slotCtx) {
  const lineUid = getCartLineUid(slotCtx?.item);
  if (!lineUid) return;
  getMinicartDomRoot(slotCtx)
    .querySelectorAll(`[${MINICART_EDIT_ACTION_ATTR}="${lineUid}"]`)
    .forEach((node) => {
      node.remove();
    });
}

function mountMinicartEditAction(slotCtx, options = {}) {
  const {
    placeholders = {},
    enableUpdatingProduct = 'false',
    onUpdated,
    onError,
  } = options;

  removeMinicartEditActionNodes(slotCtx);

  const editButton = createCartItemEditButton({
    cartItem: slotCtx.item,
    placeholders,
    enableUpdatingProduct,
    className: 'minicart-item-edit-link',
    iconSize: '24',
    onUpdated,
    onError,
  });
  if (!editButton) {
    return;
  }

  const lineUid = getCartLineUid(slotCtx.item);
  const wrap = document.createElement('div');
  wrap.className = 'minicart-item-icon-actions minicart-item-icon-actions--edit-only';
  wrap.setAttribute(MINICART_EDIT_ACTION_ATTR, lineUid || '');
  wrap.appendChild(editButton);

  if (typeof slotCtx.prependChild === 'function') {
    slotCtx.prependChild(wrap);
  } else if (typeof slotCtx.replaceWith === 'function') {
    slotCtx.replaceWith(wrap);
  }
}

async function removeMinicartLine(ctx) {
  const { item } = ctx;
  const uid = item?.uid || getCartLineUid(item);
  if (!uid) {
    throw new Error('Cart line item is not available');
  }

  const setLoading = (state) => {
    if (typeof ctx.handleItemsLoading === 'function') {
      ctx.handleItemsLoading(uid, state);
    }
  };

  setLoading(true);
  try {
    if (typeof ctx.handleItemQuantityUpdate === 'function') {
      await Promise.resolve(ctx.handleItemQuantityUpdate(item, 0));
    } else {
      await Cart.updateProductsFromCart([{ uid, quantity: 0 }]);
    }
  } finally {
    setLoading(false);
  }
}

function renderMinicartEditAndRemove(ctx, options = {}) {
  const {
    placeholders = {},
    enableUpdatingProduct = 'false',
    onUpdated,
    onError,
  } = options;

  removeMinicartEditActionNodes(ctx);

  const bar = document.createElement('div');
  bar.className = 'minicart-item-icon-actions';
  const lineUid = getCartLineUid(ctx.item);
  if (lineUid) {
    bar.setAttribute(MINICART_EDIT_ACTION_ATTR, lineUid);
  }

  const editButton = createCartItemEditButton({
    cartItem: ctx.item,
    placeholders,
    enableUpdatingProduct,
    className: 'minicart-item-edit-link',
    iconSize: '24',
    onUpdated,
    onError,
  });
  if (editButton) {
    bar.appendChild(editButton);
  }

  if (ctx.enableRemoveItem !== false) {
    const removeWrap = document.createElement('div');
    removeWrap.className = 'minicart-item-remove-link';

    const removeTemplate = placeholders?.Global?.CartRemoveItem
      || placeholders?.Global?.RemoveProductFromCart
      || 'Remove {product}';
    const productName = ctx.item?.name || '';
    const ariaLabel = removeTemplate.includes('{product}')
      ? removeTemplate.replace('{product}', productName)
      : `${removeTemplate} ${productName}`.trim();

    const isLoading = ctx.itemsLoading?.has?.(getCartLineUid(ctx.item));

    UI.render(Button, {
      variant: 'tertiary',
      size: 'medium',
      className: 'dropin-cart-item__remove',
      'data-testid': 'cart-item-remove-button',
      'aria-label': ariaLabel,
      disabled: isLoading,
      icon: h(Icon, { source: 'Trash', size: '24' }),
      onClick: async (event) => {
        event.preventDefault();
        event.stopPropagation();
        try {
          await removeMinicartLine(ctx);
        } catch (error) {
          ctx.handleItemsError?.(getCartLineUid(ctx.item), error?.message);
          onError?.(error);
          console.error('Minicart remove failed:', error);
        }
      },
    })(removeWrap);

    bar.appendChild(removeWrap);
  }

  if (!bar.childElementCount) {
    return;
  }

  ctx.replaceWith(bar);
}

/**
 * Adds cart edit to the mini cart remove-action slot. When undo-remove is on,
 * prepends edit so the drop-in delete + undo flow stays intact; otherwise
 * replaces the slot with edit + remove icons (top-right).
 */
export function appendMinicartEditAction(ctx, options = {}) {
  const useUndoRemove = options.undo === 'true' || options.undo === true;
  let lastSlotKey = '';

  const getSlotKey = (slotCtx) => {
    const uid = getCartLineUid(slotCtx?.item) || '';
    const loading = slotCtx?.itemsLoading?.has?.(uid) ? '1' : '0';
    return `${uid}:${loading}:${useUndoRemove ? 'undo' : 'full'}`;
  };

  const hasMinicartActionDom = (slotCtx) => {
    const uid = getCartLineUid(slotCtx?.item);
    if (!uid) return false;
    return Boolean(
      getMinicartDomRoot(slotCtx).querySelector(`[${MINICART_EDIT_ACTION_ATTR}="${uid}"]`),
    );
  };

  const run = (slotCtx) => {
    const slotKey = getSlotKey(slotCtx);
    if (slotKey === lastSlotKey && hasMinicartActionDom(slotCtx)) {
      return;
    }
    lastSlotKey = slotKey;

    if (useUndoRemove) {
      mountMinicartEditAction(slotCtx, options);
    } else {
      renderMinicartEditAndRemove(slotCtx, options);
    }
  };

  run(ctx);

  if (typeof ctx.onRender === 'function') {
    ctx.onRender((slotCtx) => {
      run(slotCtx);
    });
  }
}
