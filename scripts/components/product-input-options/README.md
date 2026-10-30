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

Listens to `pdp/data` and `pdp/values`, renders fields, and sets `pdp/valid` when required customizable/input options are satisfied. Returns an unsubscribe function.

### `resetConfigurationForSimpleProduct(productData, scope?)`

Clears stale `optionsUIDs` on simple products only. Skips configurable, bundle, grouped, downloadable, gift card, and customizable flows.

### `buildCartLinesForAddToCart(values, productData, scope?)`

Returns an array of cart lines for `addProductsToCart`:

- **Grouped** — one line per associated child SKU with quantity > 0 and `parentSku` (see grouped-product-options).
- **All other types** — single line from internal payload builder (`sku`, `quantity`, `optionsUIDs`, `enteredOptions` as applicable).

Bundles use the **parent** SKU with selected bundle `optionsUIDs`. Downloadable links use `optionsUIDs` from `ProductDownloadableOptions`. Gift cards use `enteredOptions` from `ProductGiftCardOptions`.

## Files

| File | Purpose |
| --- | --- |
| `product-input-options.js` | Logic and mount |
| `product-input-options.css` | Field styling (shared with `.commerce-mini-pdp`) |

## Related

- [Grouped product options](../grouped-product-options/README.md)
- [Product details block](../../../blocks/product-details/README.md)
- [Commerce mini-PDP](../commerce-mini-pdp/README.md)
