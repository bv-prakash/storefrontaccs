# Commerce mini-PDP

## Overview

`commerce-mini-pdp` renders a product configuration UI inside the shared [modal utility](../../../blocks/modal/README.md). It supports:

1. **Quick view** (product list) — preview a product, select configurable options, add to cart
2. **Cart edit** — change quantity/options for a configurable line item

The layout and styling align with the **`product-details`** block (gallery, header, SKU/stock, price, options, quantity, add/update cart). Styles come from `blocks/product-details/product-details.css` plus `commerce-mini-pdp.css`.

## Important: PDP initializer

Do **not** statically import `scripts/initializers/pdp.js` from this module. That initializer runs on every page load and calls `loadErrorPage()` when no SKU is in the URL (e.g. category/PLP pages).

Mini-PDP mounts the PDP drop-in with `initializers.mountImmediately(initialize, { scope: 'modal', … })` only when the modal opens.

PLP loads this module with **dynamic `import()`** on quick-view click for the same reason.

## API

### `createMiniPDP(input, onSuccess?, onClose?)`

Returns a **`HTMLElement`** root (`#mini-pdp-modal`, class `commerce-mini-pdp`).

#### Quick view input

```javascript
{
  sku: string,      // required
  urlKey?: string,
  image?: string,   // fallback if gallery not ready
}
```

#### Cart edit input

```javascript
{
  uid: string,      // cart line item UID
  // …other cart item fields from Cart API
}
```

| Callback | When |
| --- | --- |
| `onSuccess` | Cart line updated (cart edit only) |
| `onClose` | After successful add/update or when user cancels / view-details navigation |

On failure, returns an error panel with a Close button instead of throwing before DOM creation.

## Opening the modal (callers)

Callers pass the returned element to `createModal` with a **title** and **size** (header is owned by the modal utility, not mini-PDP).

### Product list — quick view

```javascript
const miniPDPContent = await createMiniPDP(
  { sku, urlKey, image },
  null,
  closeQuickViewModal,
);

const modal = await createModal([miniPDPContent], {
  title: labels.Global?.QuickView || 'Quick view',
  size: 'wide',
});
modal.showModal();
```

See `blocks/product-list-page/product-list-page.js` (`openQuickView`).

### Cart — edit configurable item

```javascript
const miniPDPContent = await createMiniPDP(cartItem, onSuccess, onClose);

const modal = await createModal([miniPDPContent], {
  title: placeholders.Global?.UpdateProductInCart || 'Edit item',
  size: 'wide',
});
modal.showModal();
```

See `blocks/commerce-cart/commerce-cart.js` (`handleEditButtonClick`).

## Markup structure (inside `.modal-content`)

```text
#mini-pdp-modal.commerce-mini-pdp[--quick-view]
├── .product-details__alert
└── .product-details__wrapper
    ├── .product-details__left-column
    │   ├── .product-details__gallery.desktop-gallery
    │   └── .product-details__gallery.mobile-gallery
    └── .product-details__right-column
        ├── .product-details__header          (ProductHeader drop-in)
        ├── .product-details__meta-info     (SKU + stock, updated on option change)
        ├── .product-details__price
        ├── .product-details__configuration
        │   ├── .product-details__options   (ProductOptions + swatch slot)
        │   └── .product-details__buttons
        │       ├── .product-details__quantity
        │       └── .product-details__buttons__add-to-cart
        └── .mini-pdp__footer-actions
            ├── Cancel
            └── View all details → PDP URL
```

## Drop-ins and scope

| Container | Scope |
| --- | --- |
| PDP API / events | `modal` (`MINI_PDP_SCOPE`) |

- **ProductGallery** — thumbnails on desktop (`≥1024px`), dots on smaller viewports
- **ProductOptions** — `SwatchImage` uses `tryRenderAemAssetsImage` (same pattern as `product-details`)
- **Add to cart / update** — uses `getProductConfigurationValues({ scope: 'modal' })` and `{ ...values }` for configurable products
- **`pdp/data`** — refreshes SKU/stock when options change

## CSS

| File | Role |
| --- | --- |
| `blocks/product-details/product-details.css` | PDP layout, buttons, incrementer, **configurable option swatches** |
| `commerce-mini-pdp.css` | Gallery visibility, footer actions, error state; optional `.modal-content` overrides via `:has(.commerce-mini-pdp)` |

Configurable option styling is scoped under `.product-details .product-details__options` and `.commerce-mini-pdp .product-details__options` in `product-details.css`.

## PLP quick-view control

The PLP block adds a quick-view button on the product image (`product-discovery-product-actions__quick-view`). Styles live in `blocks/product-list-page/product-list-page.css`.

## Placeholders

Uses global placeholders from `fetchPlaceholders()` (e.g. `Global.AddProductToCart`, `Global.UpdateProductInCart`, `Global.ViewAllDetails`, `Global.Cancel`). Quick view **modal title** is set by the PLP caller (`Global.QuickView`), not inside mini-PDP.

## Testing locally

1. `npm run lint`
2. Start AEM CLI and open a category PLP with configurable products
3. Quick view: options, gallery, add to cart, close header
4. Cart: edit a configurable line item; confirm update and modal title

## Changelog summary (feature)

- PLP quick view with lazy-loaded mini-PDP + modal
- Mini-PDP mirrors `product-details` for configurables (gallery, options, swatches)
- Unified modal header/title/sizes across storefront modals
- Fixed blank modal wrapper from empty `buildBlock('modal')` rows
- Cart add/update uses full PDP configuration values for configurables
