# Modal utility

## Overview

The modal utility creates a native HTML `<dialog>` overlay for storefront flows (quick view, cart edit, store switcher, checkout sign-in, and similar). It is **not** an AEM-authored block: there is no `modal` block folder content in the CMS. Callers import `createModal` from `blocks/modal/modal.js`.

All modals share the same shell:

- Dark blue **header** (`modal-header`) with uppercase **title** and **close** control
- Scrollable **body** (`.modal-content`) for caller-supplied markup
- Consistent **dialog width** via `data-modal-size` on `<dialog>`

## DOM structure

```html
<div class="modal">
  <dialog role="dialog" data-modal-size="default">
    <header class="modal-header">
      <p class="modal-header__title">Title from caller</p>
      <button type="button" class="close-button" aria-label="Close">…</button>
    </header>
    <div class="modal-content">
      <!-- one or more nodes passed to createModal -->
    </div>
  </dialog>
</div>
```

The `.modal` wrapper is appended to `<main>` while open and removed on `dialog` `close`. `body.modal-open` locks page scroll.

## API

### `createModal(contentNodes, options?)`

| Argument / option | Type | Description |
| --- | --- | --- |
| `contentNodes` | `HTMLElement[]` | Nodes appended inside `.modal-content` |
| `options.title` | `string` | Header title (default: empty title placeholder) |
| `options.size` | `'compact' \| 'default' \| 'wide'` | Sets `data-modal-size` on `<dialog>` (default: `'default'`) |
| `options.header` | `HTMLElement` | Optional custom `<header>`; close button is wired if missing |

**Returns:** `{ block, showModal, removeModal }`

- `showModal()` — opens the dialog, resets content scroll, focuses the first input when available
- `removeModal()` — closes the dialog and unmounts drop-in roots (`[data-dropin-container]`) inside the dialog

### `createModalHeader(title?)`

Builds a `modal-header` element (title + close). Used internally when `options.header` is not provided. Exported for custom headers if needed.

### Size presets (`modal.css`)

| `data-modal-size` | Max width |
| --- | --- |
| `compact` | 480px (e.g. store switcher) |
| `default` | 700px (e.g. sign-in, sign-up) |
| `wide` | 960px (e.g. mini-PDP quick view, cart edit) |

## Styling

| File | Responsibility |
| --- | --- |
| `blocks/modal/modal.css` | Dialog shell, header, close icon, size breakpoints, `.modal-content` scroll area |
| Feature CSS | Per-feature overrides (e.g. `commerce-mini-pdp.css`, `store-switcher.css`) targeting `.modal dialog:has(…)` |

Adjust padding, max-height, or margins on `.modal-content` in `modal.css` or in feature-specific stylesheets as needed.

## Integration (current callers)

| Feature | Title source | Size |
| --- | --- | --- |
| Product list quick view | `labels.Global.QuickView` | `wide` |
| Cart configurable edit | `placeholders.Global.UpdateProductInCart` | `wide` |
| Store switcher | Fragment `<h3>` text or `Select store` | `compact` |
| Checkout sign-in | `Sign in` | `default` |
| Checkout success sign-up | `Create account` | `default` |

### Example

```javascript
import createModal from '../modal/modal.js';

const content = document.createElement('div');
content.textContent = 'Hello';

const modal = await createModal([content], {
  title: 'My modal',
  size: 'default',
});

modal.showModal();

// later
modal.removeModal();
```

### Checkout helper

`blocks/commerce-checkout/utils.js` exports `showModal(content, options)` which forwards `options` to `createModal`.

## Behavior

- **Close:** header close button, `removeModal()`, or click outside the dialog (mouse only)
- **Drop-ins:** `Render.unmount` runs on `[data-dropin-container]` when the modal closes via `removeModal`
- **No empty block rows:** the host uses `document.createElement('div.modal')` (not `buildBlock('modal', '')`) to avoid blank wrapper divs

## Related documentation

- Mini-PDP (quick view / cart edit content): [commerce-mini-pdp README](../../scripts/components/commerce-mini-pdp/README.md)
- Store switcher modal content: [store-switcher README](../store-switcher/README.md)

## Validation

```bash
npm run lint
```
