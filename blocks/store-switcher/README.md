# Store Switcher Block

## Overview

The Store Switcher block lets shoppers move between the site's configured store views (locales) while staying on the page they are currently viewing. It renders a trigger button labeled with the active store's name, and on click opens a native `<dialog>` modal listing all stores authored in the `/store-switcher` fragment. Switching stores navigates to the equivalent page under the target locale.

The block is **fragment-driven**: all store names, labels, and links come from a CMS fragment (`/store-switcher`, with an optional localized variant such as `/fr/store-switcher`), not from block configuration.

## Content Authoring (Fragment Contract)

The fragment is expected to follow this structure (as authored in the CMS):

```html
<div>
  <h3>Select a store</h3>
</div>
<div>
  <ul>
    <li>
      <p>United States ($)</p>
      <ul>
        <li><a href="/">United States ($)</a></li>
      </ul>
    </li>
    <li>
      <p>Canada (CA$)</p>
      <ul>
        <li><a href="/fr/">Canada (French)</a></li>
      </ul>
    </li>
  </ul>
</div>
```

Rules:

- Store links must point to the **bare locale roots** of the target stores (e.g. `/`, `/fr`).
- A parent `<li>` whose nested `<ul>` contains **multiple** links is rendered as an expandable accordion region.
- A parent `<li>` with a **single** nested link is flattened into a plain one-click store item.

## Integration

### Block Configuration

No block configuration is read via `readBlockConfig()`.

### URL Parameters

No URL parameters are read. The current page path (`window.location.pathname`) is used to keep the shopper on the same page after switching stores.

### Local Storage

No localStorage keys are used by this block.

### Events

#### Event Listeners

No commerce event-bus listeners are implemented in this block.

#### Event Emitters

No events are emitted by this block.

### Storefront Configuration

- The localized fragment path is resolved with `localizedFragmentPath('/store-switcher')` and `getRootPath()` from the Storefront Configuration (`config.json`), e.g. `/fr/store-switcher` on French stores.
- **Important:** the fragment is fetched directly as `.plain.html` and *not* through `loadFragment()`. `loadFragment()` runs `decorateMain()`, whose `decorateLinks()` step localizes every same-origin link to the *active* store root — that would rewrite the other store's bare locale-root link (e.g. `href="/"` viewed on a `/fr` page) to `/fr`, making every option navigate to the same URL. Fetching the raw fragment preserves the authored cross-store hrefs.

## Behavior Patterns

### Rendering

1. **Double-decoration guard**: decoration is skipped when `data-store-switcher-decorated="true"` is already set (the block can be loaded both by `loadSection()` and by the footer fragment's explicit `loadBlock()` call; a second pass would wipe the rendered button).
2. **Fragment loading**: the localized fragment is fetched first and falls back to the master `/store-switcher` fragment (both fetched in parallel, deduplicated when both paths resolve to the same URL).
3. **Trigger button**: labeled with the active locale's link text (the fragment link matching the current locale root), falling back to `Select Store`. The Drop-in `Button` component is preferred; a native `<button>` fallback is created first and removed only if the Drop-in button mounts successfully, so the trigger is never silently missing.
4. **Modal markup**: fragment children are moved into a `#storeview-modal` container; the first two sections receive `storeview-modal-storeview-title` / `storeview-modal-storeview-list` classes; the `<h3>` is decorated as `storeview-modal-heading` (focusable via `tabindex="0"`).
5. **Store list decoration**: `<ul>` elements containing nested lists get `storeview-selection-grid`; multi-store groups become accordions (`storeview-multiple-stores` + `storeviews-dropdown`) with `aria-expanded` state; single-store groups are flattened (`storeview-single-store-item`).

### Store Link Rewriting (locale + page preservation)

Before each modal opening, `localizeStoreLinks()` rewrites the store links so switching locales **keeps the current page**:

- Bare locale-root links (`/`, `/fr`, …) get the current page path appended, e.g. on `/fr/categories/gear`:
  - `United States ($)`: `/` → `/categories/gear`
  - `Canada (French)`: `/fr/` → `/fr/categories/gear`
- Only same-origin links are modified; external/scheme links are untouched.
- The authored href is cached in `data-original-href` on first encounter so repeated modal openings always re-derive from the fragment value (never from a previously rewritten URL).

### User Interaction Flows

1. **Open**: clicking the trigger button rewrites the store links, creates a modal via `createModal()`, and shows it.
2. **Multi-store regions**: clicking a region header (or pressing Enter/Space) toggles its accordion; other regions collapse (`toggleStoreDropdown`).
3. **Switch store**: clicking a store link performs a full navigation to the rewritten URL — the locale change is picked up from `config.json` on the next page load (store headers, placeholders, category trees).
4. **Close**: the modal closes via the close button, a click outside the dialog, or Escape; any rendered Drop-in containers inside are unmounted.

### Error Handling

- **Missing or empty fragment**: if neither the localized nor the master fragment returns usable content, a `console.warn` is logged and the block renders nothing (no throw).
- **Drop-in Button failure**: if the Drop-in `Button` component fails to mount, the pre-created native `<button>` fallback remains and is fully functional (a `console.warn` is logged).
- **Invalid URLs**: href parsing is wrapped in `try`/`catch`; invalid URLs are left untouched.
- **Double decoration**: the `data-store-switcher-decorated` guard prevents duplicate decoration and duplicate modal markup.
- **Empty state**: even if the store list finds no nodes to decorate, the trigger button is still rendered so the switcher is never silently hidden.

