# Commerce Mini-PDP

## Overview

**Change summary for docs / stakeholders:** [IMPLEMENTATION.md](./IMPLEMENTATION.md) (opening **Summary** section).  
**This README:** API, integration points, file checklist, add/remove steps, and validation.

`commerce-mini-pdp` renders product configuration UI inside the shared [modal utility](../../blocks/modal/README.md):

1. **Quick view (PLP)** — preview product from the list, select options, add to cart (lazy-loaded).
2. **Cart edit** — update quantity/options for a configurable cart line item (`blocks/commerce-cart/commerce-cart.js`).

Layout and styling align with the **product-details** block (`blocks/product-details/product-details.css` + `commerce-mini-pdp.css`).

---

## Important: PDP initializer

Do **not** statically import `scripts/initializers/pdp.js` from PLP or this module. That initializer runs on page load and calls `loadErrorPage()` when no SKU is in the URL (category/PLP pages).

Mini-PDP mounts the PDP drop-in with `initializers.mountImmediately(initialize, { scope: 'modal', … })` when the modal opens.

PLP must use **dynamic `import()`** of `commerce-mini-pdp.js` on quick-view click only.

---

## API

### `createMiniPDP(input, onSuccess?, onClose?)`

Returns a **`HTMLElement`** root (`#mini-pdp-modal`, class `commerce-mini-pdp` or `commerce-mini-pdp--quick-view`).

#### Quick view input

```javascript
{
  sku: string,      // required
  urlKey?: string,
  image?: string,
}
```

#### Cart edit input

```javascript
{
  uid: string,      // cart line item UID
}
```

| Callback | When |
| --- | --- |
| `onSuccess` | Cart line updated (cart edit only) |
| `onClose` | After add/update, cancel, or view-details navigation |

On failure, returns an error panel with a Close button.

---

## Opening the modal (callers)

Header **title** and **size** are passed to `createModal`, not built inside mini-PDP.

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

See `blocks/commerce-cart/commerce-cart.js`.

---

## Markup structure (quick view / product-details layout)

```text
#mini-pdp-modal.commerce-mini-pdp[--quick-view]
├── .product-details__alert
└── .product-details__wrapper
    ├── .product-details__left-column (galleries)
    └── .product-details__right-column
        ├── header, SKU/stock, price
        ├── gift-card-options, downloadable-options
        ├── input-options, grouped-options, options, quantity, add to cart
        └── .mini-pdp__footer-actions (Cancel, View details)
```

---

## Drop-ins and scope

| Container | Scope |
| --- | --- |
| PDP API / events | `modal` |

- **ProductGallery** — thumbnails (desktop) / dots (mobile)
- **ProductGiftCardOptions** / **ProductDownloadableOptions** — same as main PDP
- **ProductOptions** — `SwatchImage` via `tryRenderAemAssetsImage` (same as product-details)
- **product-input-options** / **grouped-product-options** — shared helpers with main PDP
- **Cart** — `buildCartLinesForAddToCart(values, productData, 'modal')` then `addProductsToCart`
- **`pdp/data`** — updates SKU/stock; `resetConfigurationForSimpleProduct` with modal scope

---

## Module file checklist

| Path | Purpose |
| --- | --- |
| `scripts/components/commerce-mini-pdp/commerce-mini-pdp.js` | Component |
| `scripts/components/commerce-mini-pdp/commerce-mini-pdp.css` | Modal layout; downloadable stacked layout |
| `scripts/components/commerce-mini-pdp/IMPLEMENTATION.md` | Change record |
| `scripts/components/product-input-options/` | Customizable / input options + cart line builder |
| `scripts/components/grouped-product-options/` | Grouped product UI |
| `blocks/product-list-page/product-list-page.js` | Quick view (when enabled) |
| `blocks/product-list-page/product-list-page.css` | Quick-view button |
| `blocks/modal/modal.js` | `createModal` |
| `blocks/commerce-cart/commerce-cart.js` | Cart edit |
| `blocks/product-details/product-details.css` | Shared PDP, swatch, gift card, downloadable styles |

### Placeholders (optional)

| Key | Usage |
| --- | --- |
| `Global.QuickView` | Modal title, quick-view `aria-label` |
| `Global.AddProductToCart` / `Global.UpdateProductInCart` | Primary buttons |
| `Global.ViewAllDetails` / `Global.Cancel` | Quick view footer |

---

## Add quick view on PLP

1. On quick-view click, **dynamically import** `commerce-mini-pdp.js` and `blocks/modal/modal.js`.
2. `createMiniPDP({ sku, urlKey, image }, null, onClose)`.
3. `createModal([content], { title, size: 'wide' })`.
4. Add control in `SearchResults` → `ProductImage` slot; CSS in `product-list-page.css`.
5. `npm run lint` and test simple, configurable, downloadable, bundle, grouped, and gift card products in quick view when available in catalog.

---

## Remove module

### Quick view only (keep cart edit)

1. Remove quick-view UI and `openQuickView` from `product-list-page.js` / `.css`.
2. Keep `scripts/components/commerce-mini-pdp/` and cart wiring.

### Entire mini-PDP

1. Complete quick-view removal.
2. Remove cart `createMiniPDP` usage in `commerce-cart.js`.
3. Delete `scripts/components/commerce-mini-pdp/`.

Details: [IMPLEMENTATION.md §5](./IMPLEMENTATION.md).

---

## Validation

1. `npm run lint`
2. PLP: no PDP error page on category URL; quick view works when enabled.
3. Cart: edit configurable line item when enabled.
4. Quick view add to cart updates minicart quantity without reload.
5. Modal header matches other storefront modals.

---

## Related

- [Modal README](../../blocks/modal/README.md)
- [Product details README](../../blocks/product-details/README.md)
- [Product input options](../product-input-options/README.md)
- [Grouped product options](../grouped-product-options/README.md)
