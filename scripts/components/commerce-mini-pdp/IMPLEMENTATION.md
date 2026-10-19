# Commerce Mini-PDP with PLP Quick View — Implementation Guide

**Document type:** Technical implementation / change record  
**Feature:** Product List Page (PLP) quick view using `commerce-mini-pdp` in the shared modal  
**Related code README:** [README.md](./README.md) · [Modal utility](../../../blocks/modal/README.md)

---

## 1. Title of change

**Commerce Mini-PDP Quick View on Product List Page**

Shoppers can open a modal from the category/search product grid to preview a product, configure options (configurable products), adjust quantity, add to cart, or navigate to the full PDP—without leaving the list page. The modal uses the same layout and styling patterns as the `product-details` block.

---

## 2. Summary

| Area | What changed |
| --- | --- |
| **New component** | `scripts/components/commerce-mini-pdp/` — PDP drop-ins in an isolated `scope: 'modal'` |
| **PLP integration** | Quick-view control on product image; lazy `import()` of mini-PDP and modal on click |
| **Modal shell** | Unified `blocks/modal/` header (title + close), dialog sizes (`compact` / `default` / `wide`) |
| **Styling** | `product-details.css` (layout + configurable swatches), `commerce-mini-pdp.css`, PLP quick-view button styles |
| **Cart (existing pattern)** | Configurable line-item edit still uses the same mini-PDP module (separate from quick view) |

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
| `blocks/modal/modal.css` | Dialog shell, header, content scroll |
| `blocks/modal/README.md` | Modal API reference |

### PDP styling (configurable options in modal)

| File | Role |
| --- | --- |
| `blocks/product-details/product-details.css` | Swatch/option styles for `.commerce-mini-pdp .product-details__options` |

### Optional placeholder

| Key | Usage |
| --- | --- |
| `Global.QuickView` | Modal header title and quick-view button `aria-label` (fallback: `"Quick view"`) |

---

## 4. How to use it

### 4.1 End user (storefront)

1. Open any page with the **Product List Page** block (category, search results).
2. Hover the product image (desktop) or use the visible control (mobile)—click the **quick view** icon on the image.
3. In the modal:
   - Review gallery, title, SKU, stock, and price.
   - For **configurable** products, select required options (size, color, etc.).
   - Set quantity and click **Add to cart**, **Cancel**, or **View all details** (full PDP).

### 4.2 Author / CMS

- No new block is required on the PLP; quick view is added in code on the product discovery **ProductImage** slot.
- Optional: add `Global.QuickView` to placeholders for localized modal title and accessibility label.

### 4.3 Developer — enable on another list/grid

Reuse the same pattern as PLP:

1. On product card image (or action area), add a button that calls `openQuickView` with `{ sku, urlKey, image }`.
2. **Dynamically import** (do not static-import) `commerce-mini-pdp.js` and `blocks/modal/modal.js` on click.
3. Open the modal:

```javascript
const miniPDPContent = await createMiniPDP(
  { sku: product.sku, urlKey: product.urlKey, image: product.images?.[0]?.url },
  null,
  onClose,
);

const modal = await createModal([miniPDPContent], {
  title: 'Quick view', // or placeholders.Global.QuickView
  size: 'wide',
});
modal.showModal();
```

### 4.4 Developer — cart edit (same component, different entry)

Cart configurable edit is unchanged: `commerce-cart.js` static-imports `createMiniPDP` with a cart line `uid` and opens `createModal` with `UpdateProductInCart` title. See [README.md](./README.md).

### 4.5 Local verification

```bash
npm install
npm run lint
npx @adobe/aem-cli up
```

- PLP: quick view on simple and configurable products; add to cart; close modal.
- Cart: edit configurable item still works if mini-PDP remains installed.

---

## 5. How to remove the implementation

Choose the level that matches your requirement.

### 5.1 Remove **PLP quick view only** (keep cart edit mini-PDP)

**Goal:** No quick-view button or modal from the product list; cart “Edit” for configurables still works.

1. **`blocks/product-list-page/product-list-page.js`**
   - Delete `quickViewModal`, `closeQuickViewModal`, and `openQuickView` (approx. lines 691–733).
   - In the `SearchResults` → `ProductImage` slot, remove creation of `quickViewBtn` and `imageWrap.append(..., quickViewBtn)`; keep only the image link/image (or restore the default slot behavior).

2. **`blocks/product-list-page/product-list-page.css`**
   - Remove all rules for `.product-discovery-product-actions__quick-view` and related image-wrap hover rules.

3. **Optional:** Remove `Global.QuickView` from placeholders if it was added only for this feature.

4. Run `npm run lint` and test PLP and cart edit.

**Do not delete** `scripts/components/commerce-mini-pdp/` if cart edit is still required.

---

### 5.2 Remove **entire commerce-mini-pdp** (quick view + cart edit)

**Goal:** No mini-PDP modals anywhere.

1. Complete **§5.1** (PLP quick view).

2. **`blocks/commerce-cart/commerce-cart.js`**
   - Remove `import createMiniPDP from '.../commerce-mini-pdp.js'`.
   - Remove or replace `handleEditButtonClick` so it no longer opens mini-PDP (e.g. link to PDP with `itemUid`, or disable edit when block config expects mini-PDP).
   - Remove `createModal` usage tied only to mini-PDP if nothing else needs it in that handler.

3. **Delete component folder** (after cart no longer references it):
   - `scripts/components/commerce-mini-pdp/` (JS, CSS, README, this file).

4. **`blocks/product-details/product-details.css`**
   - Optional cleanup: remove selectors scoped to `.commerce-mini-pdp .product-details__options` if you do not need shared swatch styles outside full PDP.

5. **Modal utility**
   - Keep `blocks/modal/` if store switcher, checkout sign-in, or other flows still use `createModal`.

6. Run `npm run lint` and regression-test cart, checkout, store switcher, and PLP.

---

### 5.3 Rollback checklist

| Check | Pass |
| --- | --- |
| PLP loads with no console errors | ☐ |
| No quick-view control on product cards (if removed) | ☐ |
| Simple product add-to-cart on PLP still works | ☐ |
| Configurable PLP “Add to cart” still links to PDP (if applicable) | ☐ |
| Cart edit behavior matches expectation after mini-PDP removal | ☐ |
| `npm run lint` clean | ☐ |

---

## 6. Design and technical constraints

- **Do not** add `import '../../initializers/pdp.js'` to PLP or mini-PDP; the PDP page initializer redirects to the error page when no SKU is on the URL.
- **Lazy-load** mini-PDP on PLP so category pages do not load the full PDP stack eagerly.
- PDP drop-in scope for quick view / cart modal: **`modal`** (separate from the main PDP page instance).
- Modal **title** and **size** are set by the caller (`createModal`), not inside mini-PDP.

---

## 7. Support references

| Topic | Location |
| --- | --- |
| Mini-PDP API and markup | [README.md](./README.md) |
| Modal API and sizes | [blocks/modal/README.md](../../../blocks/modal/README.md) |
| Store switcher modal | [blocks/store-switcher/README.md](../../../blocks/store-switcher/README.md) |
| Full PDP block | [blocks/product-details/README.md](../../../blocks/product-details/README.md) |

---

*Copy sections 1–7 into your project wiki, release notes, or Word/PDF implementation document as needed.*
