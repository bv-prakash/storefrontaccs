# Commerce Mini Cart Block

## Overview

The Commerce Mini Cart block provides a compact cart interface with product management, notifications, and modal integration. It renders a mini cart with configurable options for product editing, undo functionality, and navigation URLs with real-time cart update notifications.

## Integration

### Block Configuration

| Configuration Key | Type | Default | Description | Required | Side Effects |
|-------------------|------|---------|-------------|----------|--------------|
| `start-shopping-url` | string | `''` | URL for "Start Shopping" button when cart is empty | No | Sets destination for empty cart CTA |
| `cart-url` | string | `''` | URL for cart page navigation | No | Sets destination for cart navigation |
| `checkout-url` | string | `''` | URL for checkout navigation | No | Sets destination for checkout action |
| `enable-updating-product` | string | `'false'` | Enables product editing via mini-PDP modal | No | Shows/hides edit buttons for configurable products |
| `undo-remove-item` | string | `'false'` | Enables undo functionality when removing items | No | Shows/hides undo option after item removal |

<!-- ### URL Parameters

No URL parameters directly affect this block's behavior. -->

<!-- ### Local Storage

No localStorage keys are used by this block. -->

### Events

#### Event Listeners

- `events.on('cart/product/added', callback)` - Listens for product addition events to show success message
- `events.on('cart/product/updated', callback)` - Listens for product update events to show update message

<!-- #### Event Emitters

No events are emitted by this block. -->

## Behavior Patterns

### Page Context Detection

- **Empty Cart**: When cart has no items, shows empty cart message with start shopping CTA
- **Populated Cart**: When cart has items, shows mini cart with product list and actions
- **Configurable Products**: When configurable products are present and editing is enabled, shows edit buttons
- **Undo Mode**: When undo is enabled, prevents mini cart from closing during remove operations

### Drop-in slots (custom)

| Slot | Integration |
| --- | --- |
| **ProductAttributes** | `mountCartLineConfigurationDetails` (`variant: 'attributes'`) — `div.dropin-cart-item__attributes` with `span` lines (`Label: value`) |
| **ItemRemoveAction** | `appendMinicartEditAction` — edit pencil (+ trash when `undo-remove-item` is false); prepends edit only when undo mode keeps drop-in remove/undo |

Minicart edit actions skip redundant Preact re-mounts when line uid and loading state are unchanged. Styling for edit/remove placement lives in `commerce-mini-cart.css`.

### User Interaction Flows

1. **Cart Display**: Block renders mini cart with product thumbnails, selected options under SKU, and actions
2. **Product Editing**: Edit opens `openCartItemEditModal` (same mini-PDP as full cart); successful update triggers `cart/product/updated` message
3. **Cart Updates**: Real-time notifications show when products are added or updated
4. **Navigation**: Users can navigate to cart page, checkout, or start shopping
5. **Undo Operations**: When enabled, users can undo item removal operations; edit is prepended without replacing the remove control

### Error Handling

- **Mini-PDP Errors**: If mini-PDP modal fails to open, shows error message via notification system
- **Cart Data Errors**: If cart data is invalid or missing, the MiniCart container handles fallback display
- **Configuration Errors**: If `readBlockConfig()` fails, uses default configuration values
- **Render Errors**: If container rendering fails, the block content remains empty
- **Fallback Behavior**: Always falls back to default configuration values for missing or invalid settings

## Related

- [Commerce mini-PDP](../../scripts/components/commerce-mini-pdp/README.md) — `appendMinicartEditAction`, edit modal
- [Commerce cart](../commerce-cart/README.md) — full cart configuration slot and edit button
- [Commerce gift options](../commerce-gift-options/README.md) — shared `gift-options-ui.js`
