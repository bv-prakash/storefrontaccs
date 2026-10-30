# Commerce Gift Options Block

## Overview

Renders Adobe Commerce **order-level gift options** (gift wrapping, gift message, printed card, gift receipt) using `@dropins/storefront-cart` `GiftOptions`. Shoppers can configure options when `data-source` is **cart** and **editable** is enabled.

Use this block on the cart page, checkout adjacent sections, or any page where the active cart should show gift services. Per-line gift options remain on the **commerce-cart** block (each cart line’s actions slot).

## Block configuration

Read via `readBlockConfig(block)`:

| Key | Default | Description |
| --- | --- | --- |
| `data-source` | `cart` | `cart` — live cart gift options. `order` — order confirmation context (read-only). |
| `editable` | `true` when source is `cart` | Allow shoppers to change gift wrap and message. |
| `read-only-view` | `primary` | `primary` or `secondary` layout when not editable. |

## Integration

### Dependencies

- `scripts/initializers/cart.js` — cart drop-in and GraphQL endpoint
- `scripts/gift-options-ui.js` — gift swatch slot, cart readiness, and **cart line configuration mounting** (used by commerce-cart and commerce-mini-cart, not only this block)

### Events

- **`cart/data`** (eager) — When `data-source` is `cart`, the block is hidden if the cart is empty.

### Gift wrapping UI

- Wrapping designs use the **SwatchImage** slot with `tryRenderAemAssetsImage` (same pattern as cart and checkout).
- Available options (wrap designs, message fields, checkboxes) come from the commerce backend and cart GraphQL; no hardcoded option list in the block.

### `gift-options-ui.js` (shared cart UI)

| Export | Used by |
| --- | --- |
| `ensureCartReady()` | Cart, minicart, checkout gift mounts |
| `mountCartLineConfigurationDetails(ctx, options)` | Cart **Configurations** slot; minicart **ProductAttributes** slot |
| `buildCartLineConfigurationBlock` / `renderCartLineGiftOptions` | Per-line gift options on full cart |
| `bindCartGiftOptionsVisibility` | Hide order-level gift UI when cart empty |

**`mountCartLineConfigurationDetails`** mounts immediately and on drop-in `onRender`. It merges line data via `resolveCartLineForDisplay`, skips DOM `replaceWith` when `getCartLineConfigDisplaySignature` is unchanged, and refreshes labels from a **single** `cart/data` listener batched with `requestAnimationFrame` (avoids per-line listeners and layout flicker).

## Behavior

1. Block mounts `GiftOptions` with `view: 'order'`.
2. Shoppers expand the gift options accordion, select wrapping (if enabled in Admin), and optionally enter message / receipt options.
3. Changes persist through the cart drop-in API (same as embedded cart sidebar gift options).

## Styling

`commerce-gift-options.css` scopes cart gift-option drop-in classes under `.commerce-gift-options__mount` and aligns with storefront branding (`--color-dark-blue`, neutral card background).

## Validation

1. `npm run lint`
2. Enable gift options in Adobe Commerce Admin (**Stores → Configuration → Sales → Gift Options**): order-level wrapping/message, gift receipt, printed card.
3. For **order gift wrapping** to appear, at least one cart line must allow gift wrap on the product (`gift_wrapping_available`).
4. Add products to cart; use **commerce-cart** (sidebar gift options) and/or **Commerce Gift Options** block (`editable: true`, `data-source: cart`).
5. Change options and blur the form (or mouse-leave) to save; order summary should show lines such as “Order gift wrapping” with price after `cart/data` updates.
6. Block mount hides when the cart is empty (not the whole section wrapper).

## Troubleshooting

- **Empty gift UI:** Cart store config not loaded yet — blocks call `ensureCartReady()` before mounting GiftOptions.
- **Read-only form:** Set block `editable` to `true` (or remove stale key-value rows that set `editable` to `false`). Checkout order-level gift options are editable after this project’s checkout container update.
- **Wrapping missing, message works:** Enable order wrapping in Admin and allow gift wrap on products in the cart.

## Related

- [Commerce cart](../commerce-cart/README.md) — order-level and per-item gift options on full cart page
- [Commerce mini cart](../commerce-mini-cart/README.md) — minicart attribute lines via same UI helper
- [Commerce mini-PDP](../../scripts/components/commerce-mini-pdp/README.md) — `cart-line.js` display and edit helpers
- [Commerce checkout](../commerce-checkout/README.md) — checkout gift options slot
