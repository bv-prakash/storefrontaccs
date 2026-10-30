# Product input options

Supplementary PDP UI for catalog options that are not rendered by `@dropins/storefront-pdp` `ProductOptions` alone.

## Role

| Source | UI | Cart payload |
| --- | --- | --- |
| `ac_customizable_options` (attribute JSON) | Dropdowns per option group | `optionsUIDs` |
| `inputOptions` on raw product (text, date, number, etc.) | Native fields | `enteredOptions` |

Used on the main **product-details** block and **commerce-mini-pdp** (`scope: 'modal'`).

## API

### `mountProductInputOptions(container, { scope? })`

Listens to `pdp/data` and `pdp/values`, renders fields, and sets `pdp/valid` when required customizable/input options are satisfied. Returns an unsubscribe function (call on modal close — wired via `disposeMiniPdpRoot` in mini-PDP).

### `resetConfigurationForSimpleProduct(productData, scope?)`

Clears stale `optionsUIDs` on simple products only. Skips configurable, bundle, grouped, downloadable, gift card, and customizable flows.

### `buildCartLineUpdatePayload(cartLine, values, productData)`

Builds the payload for cart line edits from cart / mini-PDP.

- **Unchanged options** — `{ uid, quantity }` only (in-place `updateProductsFromCart`).
- **Changed options or entered text** — full add-style payload (sku, `optionsUIDs`, `enteredOptions`, quantity) plus `uid` for the line being replaced.

### `isCartLineReconfigureUpdate(updateData)`

Returns true when the payload includes variant/options changes (not quantity-only). Used to pass `removedUid` into cart refresh waits.

### `executeCartLineUpdate(updateData)`

Applies the payload from `buildCartLineUpdatePayload`.

| Case | Behavior |
| --- | --- |
| Quantity only | `updateProductsFromCart([{ uid, quantity }])` |
| Reconfigure | Set original line `quantity: 0` → `waitForCartLineRemoved(uid)` (listens to `cart/data`, eager) → `addProductsToCart` with new configuration |

Avoids drop-in reconfigure removing the line before re-add fails (empty cart) and avoids showing old + new lines at once.

### `buildCartLinesForAddToCart(values, productData, scope?)`

Returns an array of cart lines for `addProductsToCart`:

- **Grouped** — one line per associated child SKU with quantity > 0 and `parentSku` (see grouped-product-options).
- **All other types** — single line from internal payload builder (`sku`, `quantity`, `optionsUIDs`, `enteredOptions` as applicable).

Bundles use the **parent** SKU with selected bundle `optionsUIDs`. Downloadable links use `optionsUIDs` from `ProductDownloadableOptions`. Gift cards use `enteredOptions` from `ProductGiftCardOptions`.

## Cart sync helpers

Reconfigure updates use event-driven waits in [`cart-line.js`](../commerce-mini-pdp/cart-line.js):

- **`waitForCartLineRemoved(lineUid)`** — resolves when uid disappears from `cart/data` (5s timeout + `getCartData` fallback).
- **`waitForCartRefreshAfterUpdate(cart, { removedUid })`** — resolves when cart has items and removed uid is gone (used before closing edit modal).

Mini-PDP calls these after `executeCartLineUpdate`; do not duplicate polling in blocks.

## Files

| File | Purpose |
| --- | --- |
| `product-input-options.js` | Logic and mount |
| `product-input-options.css` | Field styling (shared with `.commerce-mini-pdp`) |

## Related

- [Cart line helpers](../commerce-mini-pdp/cart-line.js) — display, edit fetch, wait helpers
- [Grouped product options](../grouped-product-options/README.md)
- [Product details block](../../../blocks/product-details/README.md)
- [Commerce mini-PDP](../commerce-mini-pdp/README.md)
