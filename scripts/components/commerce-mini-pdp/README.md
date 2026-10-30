# Commerce Mini-PDP

## Overview

**Change summary for docs / stakeholders:** [IMPLEMENTATION.md](./IMPLEMENTATION.md) (opening **Summary** section).  
**This README:** API, integration points, file checklist, add/remove steps, and validation.

`commerce-mini-pdp` renders product configuration UI inside the shared [modal utility](../../blocks/modal/README.md):

1. **Quick view (PLP)** — preview product from the list, select options, add to cart (lazy-loaded).
2. **Cart / minicart edit** — update quantity and options for eligible cart lines via the same modal UI (`openCartItemEditModal`).

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
{ mode: 'quickView', sku: string, urlKey?: string, image?: string }
// or legacy: { sku, urlKey?, image? }
```

#### Cart edit input (internal — prefer `openCartItemEditModal`)

```javascript
{ mode: 'cart', cartItem: object } // cart line with uid
```

| Callback | When |
| --- | --- |
| `onSuccess` | Cart line updated (cart edit only) |
| `onClose` | After add/update, cancel, or view-details navigation |

On failure, returns an error panel with a Close button.

### `openCartItemEditModal(cartItem, options?)`

Opens the wide modal with a loading placeholder, resolves the latest cart line, fetches catalog product data, and mounts `createMiniPDP` in cart edit mode.

| Option | Purpose |
| --- | --- |
| `placeholders` | Labels for title, loading, errors |
| `title` | Modal title override |
| `onUpdated` | After successful cart update (before close) |
| `onError` | Edit open or update failure |

### `closeCartItemEditModal()` / `disposeMiniPdpRoot(root?)`

Tears down the active edit modal. **`disposeMiniPdpRoot`** unsubscribes PDP event listeners and product-input / grouped-option mounts (`pdp/data`, `pdp/valid`, `pdp/values`) so repeated open/close does not leak listeners.

### `createCartItemEditButton({ cartItem, placeholders, enableUpdatingProduct, … })`

Returns a Preact edit control when `shouldOfferCartItemEdit(cartLine)` is true. Used on the full cart **Actions** slot.

### `appendMinicartEditAction(ctx, options)`

Wires edit (and optionally remove) into the mini cart **ItemRemoveAction** slot. Respects `undo-remove-item`: prepends edit only when undo is on; otherwise replaces the slot with edit + trash. Skips redundant DOM rebuilds when line uid and loading state are unchanged.

---

## Cart line helpers (`cart-line.js`)

Shared by cart display, gift-options UI, mini-PDP edit prefill, and update flows.

| Export | Role |
| --- | --- |
| `resolveCartLineForDisplay(item)` | Merge slot item with latest `cart/data` cache by uid |
| `getCartLineSelectionSummary` / `getCartLineConfigDisplaySignature` | Option rows and stable DOM diff key |
| `createCartLineAttributesElement` | Minicart shape: `div.dropin-cart-item__attributes` > `span` |
| `createCartLineConfigurationsListElement` | Full cart table inline config lines |
| `fetchCatalogProductForCartEdit` | Resolve parent SKU and load PDP GraphQL product |
| `shouldOfferCartItemEdit` | Edit affordance for configurable, bundle, custom options, etc. |
| `waitForCartLineRemoved` / `waitForCartRefreshAfterUpdate` | Event-driven cart sync after reconfigure updates |

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

### Cart / minicart — edit line item

```javascript
await openCartItemEditModal(ctx.item, {
  placeholders,
  onUpdated: () => showCartItemUpdatedNotice(ctx.item),
  onError: showCartItemEditError,
});
```

See `createCartItemEditButton` in `commerce-mini-pdp.js` and slots in `blocks/commerce-cart/commerce-cart.js` and `blocks/commerce-mini-cart/commerce-mini-cart.js`.

---

## Cart edit behavior

- **Prefill:** Cart snapshot → mapped `optionsUIDs` on `ProductOptions`, customizable fields via `applyCartLineConfigurationToModal`; initial apply runs once (not on every variant `pdp/data` after prefill) so swatches stay responsive.
- **Update:** `buildCartLineUpdatePayload` — quantity-only uses `updateProductsFromCart`; option/variant changes use remove-then-add via `executeCartLineUpdate` (see [product-input-options README](../product-input-options/README.md)).
- **Display after update:** Cart and minicart show selected options under SKU (inline, 14px-style classes) via `mountCartLineConfigurationDetails` in [gift-options-ui](../../gift-options-ui.js) (no per-line `cart/data` listeners; one rAF-coalesced refresh + signature skip to avoid flicker).

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
- **product-input-options** / **grouped-product-options** — shared helpers with main PDP; return unsubscribe used on modal dispose
- **Cart** — `buildCartLinesForAddToCart` / `buildCartLineUpdatePayload` + `executeCartLineUpdate` in cart edit mode
- **`pdp/data`** — updates SKU/stock; simple-product reset when not editing a line

---

## Module file checklist

| Path | Purpose |
| --- | --- |
| `scripts/components/commerce-mini-pdp/commerce-mini-pdp.js` | Modal UI, edit API, minicart edit slot |
| `scripts/components/commerce-mini-pdp/cart-line.js` | Line display, edit resolution, cart wait helpers |
| `scripts/components/commerce-mini-pdp/commerce-mini-pdp.css` | Modal layout; downloadable stacked layout |
| `scripts/components/commerce-mini-pdp/IMPLEMENTATION.md` | Change record |
| `scripts/gift-options-ui.js` | `mountCartLineConfigurationDetails` for cart + minicart |
| `scripts/components/product-input-options/` | Customizable / input options + cart update payload |
| `scripts/components/grouped-product-options/` | Grouped product UI |
| `blocks/product-list-page/product-list-page.js` | Quick view (when enabled) |
| `blocks/commerce-cart/commerce-cart.js` | Configurations slot, edit button |
| `blocks/commerce-mini-cart/commerce-mini-cart.js` | ProductAttributes + ItemRemoveAction slots |
| `blocks/modal/modal.js` | `createModal` |
| `blocks/product-details/product-details.css` | Shared PDP, swatch, gift card, downloadable styles |

### Placeholders (optional)

| Key | Usage |
| --- | --- |
| `Global.QuickView` | Modal title, quick-view `aria-label` |
| `Global.AddProductToCart` / `Global.UpdateProductInCart` | Primary buttons |
| `Global.ViewAllDetails` / `Global.Cancel` | Quick view footer |
| `Global.CartEditOptions` | Edit modal title fallback |

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
2. Remove `createCartItemEditButton` / `appendMinicartEditAction` and config slots from cart blocks.
3. Delete `scripts/components/commerce-mini-pdp/`.

Details: [IMPLEMENTATION.md §5](./IMPLEMENTATION.md).

---

## Validation

1. `npm run lint`
2. PLP: no PDP error page on category URL; quick view works when enabled.
3. Cart / minicart: edit configurable line when enabled; options show under SKU; update shows new variant (not empty cart).
4. Open/close edit modal several times — no growing listener count in DevTools (dispose path).
5. Quick view add to cart updates minicart quantity without reload.
6. Modal header matches other storefront modals.

---

## Related

- [Modal README](../../blocks/modal/README.md)
- [Product details README](../../blocks/product-details/README.md)
- [Commerce cart README](../../blocks/commerce-cart/README.md)
- [Commerce mini cart README](../../blocks/commerce-mini-cart/README.md)
- [Product input options](../product-input-options/README.md)
- [Grouped product options](../grouped-product-options/README.md)
