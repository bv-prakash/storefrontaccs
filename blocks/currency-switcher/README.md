# Currency Switcher Module

## Overview

This module adds **display currency** support to the Edge Delivery storefront:

1. **Global behavior** (`scripts/currency.js`) — loads allowed currencies from Core GraphQL, persists the shopper’s choice, sends `Content-Currency` on Core and Catalog Service, and adjusts catalog price payloads for PLP/PDP.
2. **Currency Switcher block** (optional UI) — dropdown in the header (or any section) so shoppers can change currency without leaving the page.

Allowed currencies, default currency, and exchange rates come from **Adobe Commerce Admin** only. Authors do not configure currency codes in the CMS.

---

## Module file checklist

Use this list when **adding** or **removing** the module. Paths are relative to the repository root.

### Add — new files (copy into the repo)

| Path | Purpose |
| --- | --- |
| `blocks/currency-switcher/currency-switcher.js` | Block decoration, dropdown UI |
| `blocks/currency-switcher/currency-switcher.css` | Block styles (scoped to `.currency-switcher`) |
| `blocks/currency-switcher/_currency-switcher.json` | Document Authoring block definition |
| `blocks/currency-switcher/README.md` | This document |
| `scripts/currency.js` | GraphQL fetch, persistence, headers, catalog price transform |

### Add — register the block in CMS / project JSON

Edit these existing files and add the entries shown below (keep JSON valid: commas, ordering).

| File | What to add |
| --- | --- |
| `component-definition.json` | Block entry: `id` / `model` / `plugins.da` for `currency-switcher` (see `blocks/currency-switcher/_currency-switcher.json`) |
| `component-filters.json` | `"currency-switcher"` in the section filter list where other blocks are allowed |
| `models/_component-definition.json` | Spread: `{ "...": "../blocks/currency-switcher/_*.json#/definitions" }` |
| `models/_section.json` | `"currency-switcher"` in the section `components` filter list |

### Add — wire global currency in JavaScript

These changes live in **existing** files (not in the block folder). Match the current project branch or merge from the feature that introduced the module.

| File | What was added |
| --- | --- |
| `scripts/commerce.js` | `getCommerceStoreScopeKey()` — scopes storage keys per `config.json` headers |
| `scripts/commerce.js` | `initializeCommerce()` — `initDisplayCurrency()` before Catalog Service `setEndpoint`; `applyContentCurrencyHeader()` |
| `scripts/commerce.js` | `commerceEndpointWithQueryParams()` — includes active display currency in CS `cb` hash (via `scripts/currency.js`) |
| `scripts/initializers/index.js` | On store/website change: `onCommerceStoreContextChanged()` from `currency.js` |

### Add — storefront configuration (`config.json`)

No currency-specific keys are required. The module uses the same Commerce setup as the rest of the site:

| Key | Required | Notes |
| --- | --- | --- |
| `commerce-endpoint` | **Yes** (Catalog Service GraphQL URL) | Used by drop-ins and CS client |
| `commerce-core-endpoint` | Optional | If omitted, Core uses `commerce-endpoint` |
| `headers.all` / `headers.cs` | **Yes** | Store, website, and store-view codes for GraphQL and multistore scoping |

Repeat `commerce-endpoint` and headers under each multistore root (for example `/fr/`) when that locale uses a different store view.

### Add — content (merchants / authors)

1. In Document Authoring, insert block **Currency Switcher** (typically header).
2. Block table layout:

| currency-switcher |
| --- |
| *(empty row)* |

3. Do not add configuration cells; runtime UI is generated from Commerce.

### Add — Commerce Admin (merchants)

Configure per store view:

- **Stores → Configuration → General → Currency Setup** — allowed currencies, default display currency, base currency.
- **Stores → Currency → Currency Rates** — rates must be **> 0** for amount conversion (for example AWG). Rates of `0` still allow currency labels on prices but not converted amounts.
- **Stores → Currency → Currency Symbols** — custom per-code symbols require GraphQL to expose them (for example `available_currencies` on PaaS 2.4.8+). The storefront query requests base/default symbols, allowed codes, and rates only. If a code has no symbol in the response, the UI uses **Intl** (for example ₹ for INR). Currency data loads once per page; toggling the dropdown does not call Commerce again.

---

## Remove module

Perform the reverse of the steps above.

### 1. Remove new files

Delete:

- `blocks/currency-switcher/` (entire directory)
- `scripts/currency.js`

### 2. Revert JSON registration

| File | What to remove |
| --- | --- |
| `component-definition.json` | The `currency-switcher` block object |
| `component-filters.json` | `"currency-switcher"` from the filter array |
| `models/_component-definition.json` | The `../blocks/currency-switcher/_*.json#/definitions` spread entry |
| `models/_section.json` | `"currency-switcher"` from the components list |

### 3. Revert JavaScript integration

| File | What to remove / restore |
| --- | --- |
| `scripts/commerce.js` | Remove `getCommerceStoreScopeKey()` if nothing else uses it |
| `scripts/commerce.js` | In `initializeCommerce()`, remove `currency` import, `initDisplayCurrency()`, and `applyContentCurrencyHeader()`; restore Catalog Service `setEndpoint` to run **before** drop-ins without waiting on currency (match pre-module boilerplate order) |
| `scripts/commerce.js` | In `commerceEndpointWithQueryParams()`, remove dynamic import of `currency.js` and `Content-Currency` in the `cb` hash (restore headers-only hash) |
| `scripts/initializers/index.js` | Remove `onCommerceStoreContextChanged()` call on store change |

### 4. Remove authored content

- Delete **Currency Switcher** blocks from header/footer (or any section) in the CMS.
- Publish updated pages.

### 5. Optional cleanup in browsers

Shoppers may still have old keys until they clear site data:

| Mechanism | Key pattern |
| --- | --- |
| Cookie | `currency` |
| localStorage | `dropin_display_currency__*` |
| sessionStorage | `commerce_currency_info_v*__*`, `commerce_active_display_currency__*` |

---

## Partial install options

| Goal | Keep | Remove |
| --- | --- | --- |
| **Full module** | Everything in the checklists above | — |
| **Display currency only (no switcher UI)** | `scripts/currency.js` + `commerce.js` / `initializers` wiring | Block folder + all JSON block registrations + authored block |
| **Switch UI only (not recommended)** | Block files + JSON | Without `currency.js` and commerce wiring, prices and headers will not follow the selection |

---

## Runtime reference

### Local storage and cookies

| Mechanism | Key | Purpose |
| --- | --- | --- |
| Cookie | `currency` | Display currency (1 year, path = store root). Not read on multistore sites (localStorage/session used instead). |
| localStorage | `dropin_display_currency__{website}__{storeView}__{Store}` | Scoped persistence |
| sessionStorage | `commerce_currency_info_v10__{scope}` | Cached GraphQL `currency` + locale |
| sessionStorage | `commerce_active_display_currency__{scope}` | Active code for CS `cb` hash |

Scope `{scope}` comes from `getCommerceStoreScopeKey()` (`config.json` headers).

### GraphQL behavior

- Core query: `currency` + `storeConfig { locale }` via `CORE_FETCH_GRAPHQL`.
- When selected currency ≠ store default: **`Content-Currency`** on Core and Catalog Service.
- Catalog Service does not convert all product prices server-side; `scripts/currency.js` post-processes `{ value, currency }` nodes using Admin exchange rates when `rate > 0`, and relabels currency when rates are missing.

### Block UI behavior

- **Two or more** allowed currencies → dropdown (sign + ISO code columns).
- **One** allowed currency → read-only label (`data-currency-state="single"`).
- **No data** → block hidden (`data-currency-state="unavailable"`).
- Selection → persist, clear price-related session caches, **full page reload**.

### Events

No custom event-bus listeners or emitters in this block.

---

## Validation after install

1. `npm run lint`
2. Local: `npx -y @adobe/aem-cli up` — open site, confirm switcher loads and GraphQL `currency` succeeds (Network tab).
3. Switch EUR / AWG / SGD — confirm PLP/PDP/cart prices and currency labels update after reload.
4. Multistore: test `/` and `/fr/` (or other roots) — currency choice must not leak between store views.
5. Feature preview URL in PR description per project publishing process.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Block empty / unavailable | GraphQL error, missing `commerce-endpoint`, or no allowed currencies in Admin |
| Prices stay `$` after AWG | AWG **exchange rate 0** in Admin, or catalog cache — hard refresh after rate fix |
| SGD shows `$` in dropdown | By design only **USD** uses `$`; SGD uses ISO or Admin symbol when exposed via GraphQL |
| Bad API / 400 on load | Invalid GraphQL query fields; use supported `currency` query only (no custom fields unless schema provides them) |
