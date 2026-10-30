# Grouped product options

Custom UI for **Magento grouped products** on PDP and quick view.

## Detection

Treated as grouped when the transformed product has **one** option group, **`multiple: false`**, and **two or more** option values that reference child products (`item.product.sku`). Multi-option bundles are handled by drop-in `ProductOptions` instead.

## Behavior

- Renders per–associated-product quantity steppers (defaults from catalog `quantity` when available).
- Hides drop-in **ProductOptions** and parent **ProductQuantity** while grouped UI is active.
- Sets `pdp/valid` when at least one child quantity is > 0.
- Add to cart uses multiple lines: `{ sku, quantity, parentSku }`.

## API

| Export | Purpose |
| --- | --- |
| `isGroupedProduct(productData)` | Grouped vs bundle/configurable heuristic |
| `buildGroupedCartLines(productData, scope?)` | Cart lines for grouped add-to-cart |
| `mountGroupedProductOptions(container, { scope?, optionsContainer?, quantityContainer? })` | Mount UI and wire events |

## Files

| File | Purpose |
| --- | --- |
| `grouped-product-options.js` | Detection, UI, cart lines |
| `grouped-product-options.css` | List and stepper styling |

## Related

- [Product input options](../product-input-options/README.md) — `buildCartLinesForAddToCart`
- [Product details block](../../../blocks/product-details/README.md)
