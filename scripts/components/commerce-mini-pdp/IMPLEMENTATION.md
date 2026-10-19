# Commerce Mini-PDP & PLP Quick View — Implementation Guide

**For integration steps, file lists, and step-by-step add/remove:** see [README.md](./README.md).

---

## Summary (for shared documentation)

**Title:** Commerce Mini-PDP with Quick View on Product List Page

**What we implemented**

- **Quick view** on the product list: icon on the product image opens a modal with gallery, title, SKU/stock, price, configurable options, quantity, add to cart, cancel, and link to full PDP—aligned with the **product-details** experience.
- **`commerce-mini-pdp`** component mounts Adobe Commerce PDP drop-ins with `scope: 'modal'` (separate from the main PDP page initializer).
- **Shared modal** (`blocks/modal/`): dark header with title + close; `size: 'wide'` for quick view and cart edit.
- **Cart edit** reuses the same component for configurable line items.
- PLP loads mini-PDP via **dynamic import on click** so category pages do not load `initializers/pdp.js` (which expects a product SKU in the URL).

**How to use**

- **Shoppers:** On PLP, use quick view on the product image; configure the product and add to cart, or open the full PDP. On cart, use edit for configurable items when enabled.
- **Authors:** Quick view is code-enabled on the PLP block (no separate CMS block). Optional placeholder `Global.QuickView` for modal title.
- **Developers:** See [README.md](./README.md) for files and PLP wiring; [blocks/modal/README.md](../../blocks/modal/README.md) for modal API.

**How to remove**

- **Quick view only:** Remove PLP button, `openQuickView`, and related CSS; keep mini-PDP for cart ([README.md](./README.md)).
- **All mini-PDP:** Remove cart edit usage and delete `scripts/components/commerce-mini-pdp/` ([README.md](./README.md), §5 below).

---

## 1. Title of change

**Commerce Mini-PDP with Quick View on Product List Page**

Shoppers can open a modal from the category/search product grid to preview a product, configure options (configurable products), adjust quantity, add to cart, or navigate to the full PDP—without leaving the list page. Configurable products use the same option swatches and validation as the full product details page.

---

## 2. What was implemented

| Area | What changed |
| --- | --- |
| **New component** | `scripts/components/commerce-mini-pdp/` — PDP drop-ins in an isolated `scope: 'modal'` |
| **PLP integration** | Quick-view control on product image; lazy `import()` of mini-PDP and modal on click |
| **Modal shell** | Unified `blocks/modal/` header (title + close), dialog sizes (`compact` / `default` / `wide`) |
| **Styling** | `product-details.css` (layout + configurable swatches), `commerce-mini-pdp.css`, PLP quick-view button styles |
| **Cart** | Configurable line-item edit uses the same mini-PDP module |

### 2.1 Component

- Fetches product via Catalog Service GraphQL; mounts `initialize` with `scope: 'modal'`.
- Renders ProductGallery (responsive), ProductHeader, SKU/stock meta, ProductPrice, ProductOptions (swatch image slot), ProductQuantity, add/update cart actions.
- Quick view input: `{ sku, urlKey?, image? }`. Cart input: cart line with `uid`.
- Loads `blocks/product-details/product-details.css` + `commerce-mini-pdp.css`.

### 2.2 PLP integration

- `ProductImage` slot: image link + quick-view button (`.product-discovery-product-actions__quick-view`).
- `openQuickView(product)` → dynamic import mini-PDP + modal → `createModal(..., { title, size: 'wide' })`.

### 2.3 Cart integration

- `commerce-cart.js`: `createMiniPDP(cartItem, onSuccess, onClose)` inside `createModal` with update title.

---

## 3. Scope — files touched

### Quick view (PLP)

| File | Role |
| --- | --- |
| `blocks/product-list-page/product-list-page.js` | `openQuickView`, `ProductImage` slot, quick-view button |
| `blocks/product-list-page/product-list-page.css` | `.product-discovery-product-actions__quick-view` |

### Mini-PDP component

| File | Role |
| --- | --- |
| `scripts/components/commerce-mini-pdp/commerce-mini-pdp.js` | Mount PDP API, render gallery/options/cart actions |
| `scripts/components/commerce-mini-pdp/commerce-mini-pdp.css` | Mini-PDP-specific layout overrides |
| `scripts/components/commerce-mini-pdp/README.md` | Developer reference |

### Shared modal

| File | Role |
| --- | --- |
| `blocks/modal/modal.js` | `createModal`, `createModalHeader` |
| `blocks/modal/modal.css` | Dialog shell, header |
| `blocks/modal/README.md` | Modal API reference |

### PDP styling

| File | Role |
| --- | --- |
| `blocks/product-details/product-details.css` | Swatch/option styles for `.commerce-mini-pdp .product-details__options` |

### Optional placeholder

| Key | Usage |
| --- | --- |
| `Global.QuickView` | Modal header title and quick-view `aria-label` (fallback: `Quick view`) |

---

## 4. How to use it

### 4.1 Shoppers

1. Open a page with the **Product List Page** block (category, search).
2. Click **quick view** on the product image.
3. Select configurable options if required; set quantity; **Add to cart**, **Cancel**, or **View all details**.
4. Close via modal header close.

### 4.2 Authors

- Ensure **Product List Page** is on category/search templates.
- No mini-PDP CMS block; optional `Global.QuickView` in placeholders.

### 4.3 Developers

Follow [README.md — Add quick view on PLP](./README.md#add-quick-view-on-plp). Example:

```javascript
const miniPDPContent = await createMiniPDP(
  { sku: product.sku, urlKey: product.urlKey, image: product.images?.[0]?.url },
  null,
  onClose,
);

const modal = await createModal([miniPDPContent], {
  title: labels.Global?.QuickView || 'Quick view',
  size: 'wide',
});
modal.showModal();
```

Cart edit: `commerce-cart.js` — `createMiniPDP(cartItem, …)` with `UpdateProductInCart` modal title.

### 4.4 Validation checklist

| Step | Pass |
| --- | --- |
| `npm run lint` | ☐ |
| PLP loads without PDP error page (no SKU on URL) | ☐ |
| Quick view: configurable options + add to cart | ☐ |
| Cart edit modal (if enabled) | ☐ |
| Modal header title + close consistent with other modals | ☐ |

Local: `npm run lint` · `npx @adobe/aem-cli up` · test PLP and cart edit.

---

## 5. How to remove it

### 5.1 Remove PLP quick view only (keep cart edit)

1. **`blocks/product-list-page/product-list-page.js`** — Remove `quickViewModal`, `closeQuickViewModal`, `openQuickView`; remove quick-view button from `ProductImage` slot.
2. **`blocks/product-list-page/product-list-page.css`** — Remove `.product-discovery-product-actions__quick-view` and related rules.
3. Optional: remove `Global.QuickView` from placeholders if unused.
4. **Do not delete** `scripts/components/commerce-mini-pdp/` if cart edit remains.

Run `npm run lint`; test PLP and cart edit.

### 5.2 Remove entire commerce-mini-pdp

1. Complete §5.1.
2. **`blocks/commerce-cart/commerce-cart.js`** — Remove `createMiniPDP` import and edit-modal handler (or link to full PDP).
3. Delete **`scripts/components/commerce-mini-pdp/`** (JS, CSS, README, this file).
4. Optional: remove `.commerce-mini-pdp` selectors from `product-details.css` if unused.
5. Keep **`blocks/modal/`** if store switcher, checkout, or other flows use it.

Run `npm run lint`; regression-test cart, checkout, store switcher, PLP.

### 5.3 Rollback checklist

| Check | Pass |
| --- | --- |
| PLP loads with no console errors | ☐ |
| No quick-view on product cards (if removed) | ☐ |
| Simple product add-to-cart on PLP still works | ☐ |
| Configurable PLP add-to-cart / PDP link still works | ☐ |
| Cart edit behavior matches expectation | ☐ |
| `npm run lint` clean | ☐ |

---

## 6. Design and technical constraints

- **Do not** static-import `scripts/initializers/pdp.js` on PLP or in mini-PDP; it calls `loadErrorPage()` when no SKU is in the URL.
- **Lazy-load** mini-PDP on PLP (dynamic `import()` on click).
- PDP drop-in scope: **`modal`** (separate from the main PDP page).
- Modal **title** and **size** are set by the caller (`createModal`), not inside mini-PDP.

---

## 7. Support references

| Topic | Location |
| --- | --- |
| Mini-PDP API and markup | [README.md](./README.md) |
| Modal API and sizes | [blocks/modal/README.md](../../blocks/modal/README.md) |
| Full PDP block | [blocks/product-details/README.md](../../blocks/product-details/README.md) |

---

*Copy the **Summary** section into team documentation; use **README.md** for implementation verification.*
