import {
  InLineAlert,
  Icon,
  Button,
  provider as UI,
} from '@dropins/tools/components.js';
import { h } from '@dropins/tools/preact.js';
import { events } from '@dropins/tools/event-bus.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import * as pdpApi from '@dropins/storefront-pdp/api.js';
import { render as pdpRendered } from '@dropins/storefront-pdp/render.js';
import { render as wishlistRender } from '@dropins/storefront-wishlist/render.js';

import { WishlistToggle } from '@dropins/storefront-wishlist/containers/WishlistToggle.js';
import { WishlistAlert } from '@dropins/storefront-wishlist/containers/WishlistAlert.js';

// Containers
import ProductHeader from '@dropins/storefront-pdp/containers/ProductHeader.js';
import ProductPrice from '@dropins/storefront-pdp/containers/ProductPrice.js';
import ProductShortDescription from '@dropins/storefront-pdp/containers/ProductShortDescription.js';
import ProductOptions from '@dropins/storefront-pdp/containers/ProductOptions.js';
import ProductQuantity from '@dropins/storefront-pdp/containers/ProductQuantity.js';
import ProductDescription from '@dropins/storefront-pdp/containers/ProductDescription.js';
import ProductAttributes from '@dropins/storefront-pdp/containers/ProductAttributes.js';
import ProductGallery from '@dropins/storefront-pdp/containers/ProductGallery.js';
import ProductGiftCardOptions from '@dropins/storefront-pdp/containers/ProductGiftCardOptions.js';

// Relative Lib Imports (2 levels up)
import {
  rootLink,
  setJsonLd,
  fetchPlaceholders,
  getProductLink,
} from '../../scripts/commerce.js';
import { CompareService } from '../../scripts/compare-service.js';
import { renderBreadcrumbs } from '../../scripts/breadcrumbs.js';
import { showNotification } from '../../scripts/components/notification.js';

// Initializers
import { IMAGES_SIZES, THUMBNAIL_SIZES } from '../../scripts/initializers/pdp.js';
import '../../scripts/initializers/cart.js';
import '../../scripts/initializers/wishlist.js';

/**
 * Safely renders breadcrumbs without breaking the block execution if an error occurs.
 */
function safeRenderBreadcrumbs(container, categoryData, labels) {
  try {
    if (typeof renderBreadcrumbs === 'function' && container) {
      renderBreadcrumbs(container, categoryData, labels);
    }
  } catch (error) {
    console.error('Breadcrumb rendering failed on PDP:', error);
  }
}

function isProductPrerendered() {
  const jsonLdScript = document.querySelector('script[type="application/ld+json"]');

  if (!jsonLdScript?.textContent) {
    return false;
  }

  try {
    const jsonLd = JSON.parse(jsonLdScript.textContent);
    return jsonLd?.['@type'] === 'Product';
  } catch (error) {
    console.debug('Failed to parse JSON-LD:', error);
    return false;
  }
}

function updateAddToCartButtonText(addToCartInstance, inCart, labels) {
  const buttonText = inCart
    ? labels.Global?.UpdateProductInCart
    : labels.Global?.AddProductToCart;
  if (addToCartInstance) {
    addToCartInstance.setProps((prev) => ({
      ...prev,
      children: buttonText,
    }));
  }
}

function formatNumericAttributeValue(value) {
  const trimmed = value.trim();
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return value;
  return new Intl.NumberFormat(document.documentElement.lang).format(Number(trimmed));
}

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

function renderCompareButton(product, targetContainer) {
  targetContainer.innerHTML = '';
  const compareBtnContainer = document.createElement('div');
  compareBtnContainer.className = 'pdp-compare-wrapper';

  UI.render(Button, {
    children: 'Compare',
    variant: 'secondary',
    onClick: () => {
      const currentProduct = product || pdpApi.getProductConfigurationValues();
      const finalPrice = currentProduct?.priceRange?.minimum?.final?.amount?.value
        || currentProduct?.price?.final?.amount?.value
        || 0;

      CompareService.addProduct({
        sku: currentProduct?.sku,
        name: currentProduct?.name,
        image: currentProduct?.images?.[0]?.url || currentProduct?.image?.url || '',
        urlKey: currentProduct?.urlKey,
        price: finalPrice,
      });

      events.emit('compare/update');
      showNotification({
        type: 'success',
        message: `${currentProduct?.name || 'Product'} has been added to compare list.`,
        linkText: 'View Compare',
        linkUrl: rootLink('/compare'),
      });
    },
  })(compareBtnContainer);

  targetContainer.appendChild(compareBtnContainer);
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

export default async function decorate(block) {
  const eventProduct = events.lastPayload('pdp/data') ?? null;
  const product = eventProduct?.sku ? eventProduct : null;

  const labels = await fetchPlaceholders();

  const urlParams = new URLSearchParams(window.location.search);
  const itemUidFromUrl = urlParams.get('itemUid');

  let isUpdateMode = false;
  let isOutOfStock = false;

  const fragment = document.createRange().createContextualFragment(`
    <div class="product-details__breadcrumbs"></div>
    <div class="product-details__alert"></div>
    <div class="product-details__wrapper">
      <div class="product-details__left-column">
        <div class="product-details__gallery desktop-gallery"></div>
        <div class="product-details__gallery mobile-gallery"></div>
      </div>
      <div class="product-details__right-column">
        <div class="product-details__header"></div>
        <div class="product-details__meta-info">
          <div class="product-details__sku"></div>
          <div class="product-details__stock"></div>
        </div>
        <div class="product-details__price"></div>
        <div class="product-details__short-description"></div>
        <div class="product-details__gift-card-options"></div>
        <div class="product-details__configuration">
          <div class="product-details__options"></div>
          <div class="product-details__buttons">
            <div class="product-details__quantity"></div>
            <div class="product-details__buttons__add-to-cart"></div>
            <div class="product-details__button__action-buttons">
               <div class="product-details__buttons__compare"></div>
                <div class="product-details__buttons__add-to-wishlist"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Responsive Tab/Accordion Wrapper -->
    <div class="product-details__tabs-wrapper">
      <!-- Desktop Tab Nav Header -->
      <div class="pdp-tabs-nav" role="tablist">
        <button 
          class="pdp-tab-btn active" 
          data-tab="description" 
          role="tab" 
          aria-selected="true" 
          aria-controls="pdp-tab-panel-description">
          Description
        </button>
        <button 
          class="pdp-tab-btn" 
          data-tab="attributes" 
          role="tab" 
          aria-selected="false" 
          aria-controls="pdp-tab-panel-attributes">
          Specifications
        </button>
      </div>

      <!-- Accordion & Tab Content Panels -->
      <div class="pdp-tabs-content">
        <!-- Section 1: Description -->
        <button 
          class="pdp-accordion-header active" 
          data-tab="description" 
          aria-expanded="true" 
          aria-controls="pdp-tab-panel-description">
          Description
        </button>
        <div 
          id="pdp-tab-panel-description" 
          class="pdp-tab-panel active" 
          role="tabpanel" 
          data-panel="description">
          <div class="product-details__description"></div>
        </div>

        <!-- Section 2: Specifications -->
        <button 
          class="pdp-accordion-header" 
          data-tab="attributes" 
          aria-expanded="false" 
          aria-controls="pdp-tab-panel-attributes">
          Specifications
        </button>
        <div 
          id="pdp-tab-panel-attributes" 
          class="pdp-tab-panel" 
          role="tabpanel" 
          data-panel="attributes">
          <div class="product-details__attributes"></div>
        </div>
      </div>
    </div>
  `);

  const $breadcrumbs = fragment.querySelector('.product-details__breadcrumbs');
  const $alert = fragment.querySelector('.product-details__alert');
  const $gallery = fragment.querySelector('.product-details__gallery.desktop-gallery');
  const $galleryMobile = fragment.querySelector('.product-details__gallery.mobile-gallery');
  const $header = fragment.querySelector('.product-details__header');
  const $sku = fragment.querySelector('.product-details__sku');
  const $stock = fragment.querySelector('.product-details__stock');
  const $price = fragment.querySelector('.product-details__price');
  const $shortDescription = fragment.querySelector('.product-details__short-description');
  const $options = fragment.querySelector('.product-details__options');
  const $quantity = fragment.querySelector('.product-details__quantity');
  const $giftCardOptions = fragment.querySelector('.product-details__gift-card-options');
  const $addToCart = fragment.querySelector('.product-details__buttons__add-to-cart');
  const $compareBtn = fragment.querySelector('.product-details__buttons__compare');
  const $wishlistToggleBtn = fragment.querySelector('.product-details__buttons__add-to-wishlist');
  const $description = fragment.querySelector('.product-details__description');
  const $attributes = fragment.querySelector('.product-details__attributes');

  block.replaceChildren(fragment);

  block.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.pdp-tab-btn');
    const accordionHeader = e.target.closest('.pdp-accordion-header');

    if (!tabBtn && !accordionHeader) return;

    const isDesktopView = window.matchMedia('(min-width: 768px)').matches;
    const tabsWrapper = block.querySelector('.product-details__tabs-wrapper');
    if (!tabsWrapper) return;

    if (isDesktopView && tabBtn) {
      const targetTab = tabBtn.getAttribute('data-tab');

      tabsWrapper.querySelectorAll('.pdp-tab-btn').forEach((b) => {
        const isActive = b.getAttribute('data-tab') === targetTab;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      tabsWrapper.querySelectorAll('.pdp-tab-panel').forEach((panel) => {
        const isActive = panel.getAttribute('data-panel') === targetTab;
        panel.classList.toggle('active', isActive);
      });
    } else if (!isDesktopView && accordionHeader) {
      const targetTab = accordionHeader.getAttribute('data-tab');
      const targetPanel = tabsWrapper.querySelector(`.pdp-tab-panel[data-panel="${targetTab}"]`);

      const isCurrentlyExpanded = accordionHeader.classList.contains('active');

      accordionHeader.classList.toggle('active', !isCurrentlyExpanded);
      accordionHeader.setAttribute('aria-expanded', !isCurrentlyExpanded ? 'true' : 'false');

      if (targetPanel) {
        targetPanel.classList.toggle('active', !isCurrentlyExpanded);
      }
    }
  });

  if (product) {
    const categoryData = {
      name: product.name,
      breadcrumbs: product.categories?.map((cat) => ({
        category_name: cat.name,
        category_url_path: cat.urlPath || `/categories/${cat.urlKey}`,
      })) || [],
    };
    safeRenderBreadcrumbs($breadcrumbs, categoryData, labels);
    renderSkuDetails(product, $sku);
    renderStockStatus(product, $stock);
    renderCompareButton(product, $compareBtn);
  }

  let inlineAlert = null;
  const routeToWishlist = rootLink('/wishlist');

  const [
    _galleryMobile,
    _gallery,
    _header,
    _price,
    _shortDescription,
    _options,
    _quantity,
    _giftCardOptions,
    _description,
    _attributes,
    wishlistToggleBtn,
  ] = await Promise.all([
    pdpRendered.render(ProductGallery, {
      controls: 'dots',
      arrows: true,
      peak: false,
      gap: 'small',
      loop: false,
      videos: true,
      imageParams: { ...IMAGES_SIZES },
      thumbnailParams: { ...THUMBNAIL_SIZES },
    })($galleryMobile),

    pdpRendered.render(ProductGallery, {
      controls: 'thumbnailsRow',
      arrows: false,
      peak: false,
      gap: 'small',
      loop: false,
      videos: true,
      imageParams: { ...IMAGES_SIZES },
      thumbnailParams: { ...THUMBNAIL_SIZES },
    })($gallery),

    pdpRendered.render(ProductHeader, {})($header),
    pdpRendered.render(ProductPrice, {})($price),
    pdpRendered.render(ProductShortDescription, {})($shortDescription),

    pdpRendered.render(ProductOptions, {
      hideSelectedValue: false,
      slots: {
        SwatchImage: (ctx) => {
          tryRenderAemAssetsImage(ctx, {
            ...imageSlotConfig(ctx),
            wrapper: document.createElement('span'),
          });
        },
      },
    })($options),

    pdpRendered.render(ProductQuantity, {})($quantity),
    pdpRendered.render(ProductGiftCardOptions, {})($giftCardOptions),
    pdpRendered.render(ProductDescription, {})($description),
    pdpRendered.render(ProductAttributes, {
      formatValue: formatNumericAttributeValue,
    })($attributes),

    wishlistRender.render(WishlistToggle, {
      product,
    })($wishlistToggleBtn),
  ]);

  const addToCart = await UI.render(Button, {
    children: labels.Global?.AddProductToCart,
    icon: h(Icon, { source: 'Cart' }),
    onClick: async () => {
      const buttonActionText = isUpdateMode
        ? labels.Global?.UpdatingInCart
        : labels.Global?.AddingToCart;
      try {
        addToCart.setProps((prev) => ({
          ...prev,
          children: buttonActionText,
          disabled: true,
        }));

        const values = pdpApi.getProductConfigurationValues();
        const valid = pdpApi.isProductConfigurationValid();

        if (valid) {
          if (isUpdateMode) {
            const { updateProductsFromCart } = await import(
              '@dropins/storefront-cart/api.js'
            );

            await updateProductsFromCart([{ ...values, uid: itemUidFromUrl }]);

            const updatedSku = values?.sku;
            if (updatedSku) {
              const cartRedirectUrl = new URL(
                rootLink('/cart'),
                window.location.origin,
              );
              cartRedirectUrl.searchParams.set('itemUid', itemUidFromUrl);
              window.location.href = cartRedirectUrl.toString();
            } else {
              window.location.href = rootLink('/cart');
            }
            return;
          }
          const { addProductsToCart } = await import(
            '@dropins/storefront-cart/api.js'
          );
          await addProductsToCart([{ ...values }]);
          showNotification({
            type: 'success',
            message: 'You added product to your shopping cart.',
            linkText: 'View Cart',
            linkUrl: rootLink('/cart'),
          });
        }

        inlineAlert?.remove();
      } catch (error) {
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

        $alert.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      } finally {
        updateAddToCartButtonText(addToCart, isUpdateMode, labels);
        addToCart.setProps((prev) => ({
          ...prev,
          disabled: isOutOfStock,
        }));
      }
    },
  })($addToCart);

  // Lifecycle Events
  events.on('pdp/data', (data) => {
    if (!data) return;
    isOutOfStock = data?.inStock === false;
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock }));

    const categoryData = {
      name: data.name,
      breadcrumbs: data.categories?.map((cat) => ({
        category_name: cat.name,
        category_url_path: cat.urlPath || `/categories/${cat.urlKey}`,
      })) || [],
    };
    safeRenderBreadcrumbs($breadcrumbs, categoryData, labels);
    renderSkuDetails(data, $sku);
    renderStockStatus(data, $stock);
    renderCompareButton(data, $compareBtn);
  }, { eager: true });

  events.on('pdp/valid', (valid) => {
    addToCart.setProps((prev) => ({ ...prev, disabled: isOutOfStock || !valid }));
  }, { eager: true });

  events.on('pdp/values', () => {
    if (wishlistToggleBtn) {
      const configValues = pdpApi.getProductConfigurationValues();
      const urlOptionsUIDs = urlParams.get('optionsUIDs');
      const optionUIDs = urlOptionsUIDs === '' ? undefined : (configValues?.optionsUIDs || undefined);

      wishlistToggleBtn.setProps((prev) => ({
        ...prev,
        product: {
          ...product,
          optionUIDs,
        },
      }));
    }
  }, { eager: true });

  events.on('wishlist/alert', ({ action, item }) => {
    wishlistRender.render(WishlistAlert, {
      action,
      item,
      routeToWishlist,
    })($alert);

    const productName = item?.product?.name || 'Product';
    if (action === 'add') {
      showNotification({
        type: 'success',
        message: `${productName} has been added to your Wish List.`,
        linkText: 'View Wish List',
        linkUrl: routeToWishlist,
      });
    } else if (action === 'remove') {
      showNotification({
        type: 'info',
        message: `${productName} has been removed from your Wish List.`,
        linkText: 'View Wish List',
        linkUrl: routeToWishlist,
      });
    }

    setTimeout(() => {
      $alert.innerHTML = '';
    }, 5000);

    setTimeout(() => {
      $alert.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 0);
  });

  events.on(
    'cart/data',
    (cartData) => {
      let itemIsInCart = false;
      if (itemUidFromUrl && cartData?.items) {
        itemIsInCart = cartData.items.some(
          (item) => item.uid === itemUidFromUrl,
        );
      }
      isUpdateMode = itemIsInCart;
      updateAddToCartButtonText(addToCart, itemIsInCart, labels);
    },
    { eager: true },
  );

  events.on('aem/lcp', () => {
    const isPrerendered = isProductPrerendered();
    if (product && !isPrerendered) {
      setJsonLdProduct(product);
      setMetaTags(product);
      document.title = product.name;
    }
  }, { eager: true });

  return Promise.resolve();
}

async function setJsonLdProduct(product) {
  const {
    name,
    inStock,
    description,
    sku,
    urlKey,
    price,
    priceRange,
    images,
    attributes,
  } = product;
  const amount = priceRange?.minimum?.final?.amount || price?.final?.amount;
  const brand = attributes?.find((attr) => attr.name === 'brand');

  const { data } = await pdpApi.fetchGraphQl(`
    query GET_PRODUCT_VARIANTS($sku: String!) {
      variants(sku: $sku) {
        variants {
          product {
            sku
            name
            inStock
            images(roles: ["image"]) {
              url
            }
            ...on SimpleProductView {
              price {
                final { amount { currency value } }
              }
            }
          }
        }
      }
    }
  `, {
    method: 'GET',
    variables: { sku },
  });

  const variants = data?.variants?.variants || [];

  const ldJson = {
    '@context': 'http://schema.org',
    '@type': 'Product',
    name,
    description,
    image: images[0]?.url,
    offers: [],
    productID: sku,
    brand: {
      '@type': 'Brand',
      name: brand?.value,
    },
    url: new URL(getProductLink(urlKey, sku), window.location),
    sku,
    '@id': new URL(getProductLink(urlKey, sku), window.location),
  };

  if (variants.length > 1) {
    ldJson.offers.push(...variants.map((variant) => ({
      '@type': 'Offer',
      name: variant.product.name,
      image: variant.product.images[0]?.url,
      price: variant.product.price.final.amount.value,
      priceCurrency: variant.product.price.final.amount.currency,
      availability: variant.product.inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
      sku: variant.product.sku,
    })));
  } else {
    ldJson.offers.push({
      '@type': 'Offer',
      price: amount?.value,
      priceCurrency: amount?.currency,
      availability: inStock ? 'http://schema.org/InStock' : 'http://schema.org/OutOfStock',
    });
  }

  setJsonLd(ldJson, 'product');
}

function createMetaTag(property, content, type) {
  if (!property || !type) {
    return;
  }
  let meta = document.head.querySelector(`meta[${type}="${property}"]`);
  if (meta) {
    if (!content) {
      meta.remove();
      return;
    }
    meta.setAttribute(type, property);
    meta.setAttribute('content', content);
    return;
  }
  if (!content) {
    return;
  }
  meta = document.createElement('meta');
  meta.setAttribute(type, property);
  meta.setAttribute('content', content);
  document.head.appendChild(meta);
}

function setMetaTags(product) {
  if (!product?.sku) {
    return;
  }

  const price = product.prices.final.minimumAmount ?? product.prices.final.amount;

  createMetaTag('title', product.metaTitle || product.name, 'name');
  createMetaTag('description', product.metaDescription, 'name');
  createMetaTag('keywords', product.metaKeyword, 'name');

  createMetaTag('og:type', 'product', 'property');
  createMetaTag('og:description', product.shortDescription, 'property');
  createMetaTag('og:title', product.metaTitle || product.name, 'property');
  createMetaTag('og:url', window.location.href, 'property');
  const mainImage = product?.images?.filter((image) => image.roles.includes('thumbnail'))[0];
  const metaImage = mainImage?.url || product?.images[0]?.url;
  createMetaTag('og:image', metaImage, 'property');
  createMetaTag('og:image:secure_url', metaImage, 'property');
  createMetaTag('product:price:amount', price.value, 'property');
  createMetaTag('product:price:currency', price.currency, 'property');
}
