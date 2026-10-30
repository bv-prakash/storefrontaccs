# Product Details Block

## Overview

The Product Details block provides comprehensive product detail page functionality using multiple `@dropins/storefront-pdp` containers. It handles product display, configuration, cart operations, wishlist integration, and SEO optimization with dynamic mode switching between add and update operations.

Project-owned helpers extend the drop-ins for **customizable options**, **grouped products**, and consistent **add-to-cart payloads** across product types (simple, configurable, virtual, downloadable, gift card, bundle, grouped).

## Integration

### URL Parameters

- `itemUid` — Cart line UID for update mode (when present, enables update mode instead of add mode).
- `optionsUIDs` — Product option UIDs for wishlist context (empty string treated as base product with no options).

The PDP initializer strips `quantity` and `optionsUIDs` from the URL after load (`scripts/initializers/pdp.js`); `itemUid` is kept for cart edit flows.

### Supporting scripts

| Module | Role |
| --- | --- |
| `scripts/components/product-input-options/` | `ac_customizable_options` dropdowns and `inputOptions` fields; `buildCartLinesForAddToCart` |
| `scripts/components/grouped-product-options/` | Grouped product qty UI and multi-line cart payload |
| `@dropins/storefront-pdp` `ProductGiftCardOptions` | Gift card `enteredOptions` |
| `@dropins/storefront-pdp` `ProductDownloadableOptions` | Downloadable link selection via `optionsUIDs` |

Do **not** modify `scripts/__dropins__/storefront-pdp/fragments.js` for customizable options; use the attribute-driven UI above.

### Events

#### Event Listeners

- `events.on('pdp/data', callback)` — Stock status, breadcrumbs, SKU/stock display, compare button, reviews, and `resetConfigurationForSimpleProduct`
- `events.on('pdp/valid', callback)` — Enable/disable add to cart from configuration validity
- `events.on('pdp/values', callback)` — Wishlist context when options change
- `events.on('wishlist/alert', callback)` — Wishlist notifications
- `events.on('cart/data', callback)` — Update mode detection
- `events.on('aem/lcp', callback)` — JSON-LD and meta tags

## Product types and add to cart

| Type | Configuration UI | Cart API |
| --- | --- | --- |
| Simple / virtual | Quantity; optional customizable or input options | Single line: variant or parent SKU |
| Configurable | `ProductOptions` swatches | Single line + `optionsUIDs` |
| Customizable (e.g. `ac_customizable_options`) | `product-input-options` dropdowns | Single line + `optionsUIDs` |
| Downloadable | `ProductDownloadableOptions` | Single line + link `optionsUIDs` |
| Gift card | `ProductGiftCardOptions` | Single line + `enteredOptions` |
| Bundle | `ProductOptions` (multi-select groups) | Parent SKU + bundle `optionsUIDs` |
| Grouped | `grouped-product-options` qty per child | Multiple lines with `parentSku` |

Add to cart calls `buildCartLinesForAddToCart` then `addProductsToCart(cartLines)` (or update with first line in edit mode).

## Behavior Patterns

### Page Context Detection

- **Add mode** — No `itemUid` in URL.
- **Update mode** — `itemUid` in URL; button copy and redirect target cart with same UID.
- **Stock** — Add to cart disabled when out of stock or configuration invalid.
- **Wishlist** — Context follows current `optionsUIDs` from configuration.

### User Interaction Flows

1. **Initialization** — Gallery, header, price, gift card/downloadable blocks, input options, grouped options (if applicable), swatches, quantity, actions.
2. **Configuration** — Drop-ins and helpers update `pdp/valid` and `pdp/values`.
3. **Add to cart** — Validates configuration; builds one or more cart lines; shows success notification (cart drop-in emits `cart/data`).
4. **Tabs** — Description, specifications, reviews (desktop tabs / mobile accordion).

### Styling

- Configurable swatches and quantity: `product-details.css`.
- Customizable fields: `product-input-options.css`.
- Grouped list: `grouped-product-options.css`.
- Gift card and downloadable blocks: themed in `product-details.css` (mobile-first downloadable rows; side-by-side link row from 768px on main PDP only).

### Error Handling

- Invalid configuration — Add to cart blocked; inline alert on API errors.
- Breadcrumb failures — Logged; block continues.
- JSON-LD parse failures — Silent fallback for prerender detection.

## Validation

1. `npm run lint`
2. Local PDP: simple with required custom options, configurable, downloadable, bundle, grouped, gift card (when available in catalog).
3. Add to cart and minicart quantity update without full page reload.

## Related

- [Product input options](../../scripts/components/product-input-options/README.md)
- [Grouped product options](../../scripts/components/grouped-product-options/README.md)
- [Commerce mini-PDP](../../scripts/components/commerce-mini-pdp/README.md) — quick view and cart edit (same input-options / grouped helpers)
- [Commerce cart](../commerce-cart/README.md) — cart line edit and configuration display
