# Display Currency & Currency Switcher — Implementation Guide

**For install, file checklists, and step-by-step add/remove:** see [README.md](./README.md).

---

## Summary (for shared documentation)

**Title:** Storefront display currency with optional Currency Switcher block

**What we implemented**

- Global display currency in `scripts/currency.js` (GraphQL, persistence, `Content-Currency`, price transform) wired through `scripts/commerce.js` and `scripts/initializers/index.js`.
- Optional **Currency Switcher** block in `blocks/currency-switcher/` for da.live (dropdown when 2+ Admin-allowed currencies; read-only label when one).
- Currencies, rates, and defaults from **Commerce Admin only**—not from `config.json`.

**How to use**

- Merchants configure currencies and rates in Admin; authors add the **Currency Switcher** block (empty configuration row); shoppers select currency in the header and the page reloads with updated prices.

**How to remove**

- **UI only:** remove CMS block + `blocks/currency-switcher/` + JSON registration; keep `scripts/currency.js` and commerce wiring ([README.md — Remove module](./README.md#remove-module), partial option).
- **Full module:** also delete `scripts/currency.js` and revert commerce/initializer hooks (§5.2 below and [README.md](./README.md#remove-module)).

---

## 1. Title of change

**Storefront display currency with optional Currency Switcher block**

Shoppers can view catalog and cart prices in a currency allowed in Adobe Commerce Admin for the current store view. An optional authorable block provides a header dropdown to change currency; the choice persists per store scope and is sent to Commerce via **`Content-Currency`**. Allowed codes, default currency, exchange rates, and (where GraphQL exposes them) symbols come from **Admin / GraphQL only**—not from hardcoded lists in `config.json`.

---

## 2. What was implemented

### 2.1 Two layers

| Layer | Location | Required? |
| --- | --- | --- |
| **Global display currency** | `scripts/currency.js` + wiring in `scripts/commerce.js`, `scripts/initializers/index.js` | Yes, for prices/headers to follow selection |
| **Currency Switcher UI** | `blocks/currency-switcher/` | Optional (authors place block in da.live) |

Without the global layer, the block alone does not update API headers or catalog price transforms.

### 2.2 Global behavior (`scripts/currency.js`)

- Loads currency data from **Core GraphQL** (`currency` + `storeConfig.locale`) once per session scope.
- Persists shopper selection (cookie / `localStorage` / `sessionStorage`, scoped by store view).
- Sets **`Content-Currency`** on Core and Catalog Service when selected currency ≠ store default.
- Adjusts Catalog Service price payloads client-side using Admin **exchange rates** when rate &gt; 0.
- Symbol display: Admin/GraphQL symbols when available → **Intl** fallback (e.g. ₹ for INR) → ISO code.
- **`getCommerceStoreScopeKey()`** in `commerce.js` scopes cache keys for multistore (`config.json` headers).

### 2.3 Block behavior (`currency-switcher.js`)

| State | `data-currency-state` | UI |
| --- | --- | --- |
| 2+ allowed currencies | *(dropdown)* | Trigger shows sign + code; list of options |
| 1 allowed currency | `single` | Read-only label (no dropdown) |
| No data / error | `unavailable` | Block hidden |

- Opening/closing the dropdown does **not** refetch GraphQL (data loaded at decorate time).
- Choosing a currency → persist → clear price-related session caches → **full page reload**.

### 2.4 CMS / project registration

Block is registered for Document Authoring in:

- `component-definition.json`
- `component-filters.json`
- `models/_component-definition.json`
- `models/_section.json`
- `blocks/currency-switcher/_currency-switcher.json`

---

## 3. Configuration options

### 3.1 Adobe Commerce Admin (merchants)

| Setting | Path | Effect |
| --- | --- | --- |
| Allowed currencies | **Stores → Configuration → General → Currency Setup** | Which codes appear in the switcher |
| Default display currency | Same | Store default; `Content-Currency` omitted when selection matches |
| Base currency | Same | Used with rates for conversion |
| Exchange rates | **Stores → Currency → Currency Rates** | Must be **&gt; 0** for converted amounts; `0` may still show labels |
| Custom symbols | **Stores → Currency → Currency Symbols** | Used only if GraphQL exposes per-code symbols (ACCS/SaaS may be limited) |

### 3.2 Storefront `config.json` (developers)

| Key | Required | Notes |
| --- | --- | --- |
| `commerce-endpoint` | Yes | Catalog Service GraphQL |
| `commerce-core-endpoint` | Optional | Core GraphQL; falls back to catalog endpoint |
| `headers.all` / `headers.cs` | Yes | Store, website, store view for multistore scoping |

No `currency-symbols` or allowed-currency lists in `config.json`—Admin is the source of truth.

Per-locale roots (e.g. `/fr/`) repeat endpoints/headers when that path uses another store view.

### 3.3 Block authoring (authors)

- Insert block **Currency Switcher** (typically header).
- Block table: one row, **empty** configuration cells—the UI is generated at runtime.

```
| currency-switcher |
|                   |
```

### 3.4 Partial deployment options

| Goal | Keep | Remove |
| --- | --- | --- |
| **Full feature** | `currency.js` + commerce wiring + block + JSON registration + authored block | — |
| **Display currency only (no dropdown)** | `scripts/currency.js` + `commerce.js` / `initializers` hooks | Entire `blocks/currency-switcher/`, JSON registrations, authored block |
| **Block only (not supported)** | — | Without global `currency.js`, selection will not drive headers/prices correctly |

---

## 4. How to use it

### 4.1 Shoppers

1. If the header shows a **currency control** (sign + code), click to open the list.
2. Select a currency (e.g. EUR, INR).
3. Page reloads; PLP, PDP, cart, and checkout show prices in that currency where rates and Admin config allow.

If only one currency is allowed, a **label** is shown instead of a dropdown.

### 4.2 Authors (da.live / AEM)

1. Open the page or shared header section.
2. Add block **Currency Switcher** where it should appear (often next to store switcher).
3. Publish. No block-level fields to fill.

### 4.3 Developers — install on a new branch / site

Follow the **Add** checklists in [README.md](./README.md):

1. Copy files: `scripts/currency.js`, `blocks/currency-switcher/*`.
2. Register block in the four JSON files listed in §2.4.
3. Merge `commerce.js` changes: `getCommerceStoreScopeKey`, `initDisplayCurrency`, `applyContentCurrencyHeader`, `commerceEndpointWithQueryParams` currency in `cb` hash.
4. Merge `initializers/index.js`: `onCommerceStoreContextChanged()` on store context change.
5. Configure Admin currencies and rates; set `config.json` Commerce endpoints/headers.
6. Run `npm run lint`, test locally and on feature preview.

### 4.4 Validation checklist

| Step | Pass |
| --- | --- |
| `npm run lint` | ☐ |
| Switcher visible when ≥2 currencies in Admin | ☐ |
| Network: Core GraphQL `currency` succeeds on first load | ☐ |
| Switch currency → reload → PLP/PDP/cart labels update | ☐ |
| Multistore (`/` vs `/fr/`): selections do not leak across store views | ☐ |
| Rate &gt; 0: converted amounts change; rate 0: understand label-only behavior | ☐ |

---

## 5. How to remove it

### 5.1 Remove **switcher UI only** (keep display currency logic)

Use when you want headers/price transform without a visible control (single-currency stores or fixed display currency).

1. Delete authored **Currency Switcher** blocks in CMS; publish.
2. Delete folder `blocks/currency-switcher/`.
3. Revert JSON registration:
   - `component-definition.json` — remove `currency-switcher` entry
   - `component-filters.json` — remove `"currency-switcher"`
   - `models/_component-definition.json` — remove currency-switcher definitions spread
   - `models/_section.json` — remove `"currency-switcher"` from components filter
4. Keep `scripts/currency.js` and `commerce.js` / `initializers` wiring.

Run `npm run lint` and smoke-test prices still match store default.

---

### 5.2 Remove **entire display currency module**

Use when the site should use only the store view default currency with no shopper override.

1. Complete **§5.1** (UI + block registration).

2. Delete **`scripts/currency.js`**.

3. Revert **`scripts/commerce.js`**:
   - Remove import/usage of `initDisplayCurrency`, `applyContentCurrencyHeader`.
   - Restore Catalog Service `setEndpoint` order to pre-module pattern (no await on currency init before drop-ins).
   - In `commerceEndpointWithQueryParams()`, remove dynamic `currency.js` import and currency from the `cb` hash.
   - Remove **`getCommerceStoreScopeKey()`** only if nothing else in the repo references it (search before delete).

4. Revert **`scripts/initializers/index.js`**: remove `onCommerceStoreContextChanged()` on store change.

5. Optional browser cleanup for testers (old keys may linger):
   - Cookie: `currency`
   - `localStorage`: `dropin_display_currency__*`
   - `sessionStorage`: `commerce_currency_info_v*__*`, `commerce_active_display_currency__*`

6. Run `npm run lint` and regression-test PLP, PDP, cart, checkout, multistore.

---

### 5.3 Rollback checklist

| Check | Pass |
| --- | --- |
| No Currency Switcher in header after CMS + code removal | ☐ |
| No GraphQL/errors from removed currency init | ☐ |
| Prices match Commerce default store currency | ☐ |
| Cart/checkout totals consistent | ☐ |
| `npm run lint` clean | ☐ |

---

## 6. Files reference (quick list)

| Path | Role |
| --- | --- |
| `scripts/currency.js` | GraphQL, persistence, headers, price transform |
| `scripts/commerce.js` | Init hook, scope key, CS endpoint hash |
| `scripts/initializers/index.js` | Store context change handler |
| `blocks/currency-switcher/currency-switcher.js` | Block decorate, dropdown UI |
| `blocks/currency-switcher/currency-switcher.css` | Block styles |
| `blocks/currency-switcher/_currency-switcher.json` | DA block model |
| `blocks/currency-switcher/README.md` | Detailed add/remove checklists |
| `blocks/currency-switcher/IMPLEMENTATION.md` | This guide |

---

## 7. Troubleshooting (summary)

| Symptom | Likely cause |
| --- | --- |
| Block hidden (`unavailable`) | GraphQL failure, missing endpoint, or no allowed currencies |
| Prices unchanged after switch | Exchange rate 0, or need hard refresh after Admin rate fix |
| Wrong symbol in list | ACCS may not expose custom Admin symbols; Intl/ISO fallback |
| Dropdown calls API every click | Should not happen; if it does, verify current `currency-switcher.js` (toggle only) |

See full table in [README.md](./README.md#troubleshooting).

---

*Copy sections 1–7 into your project wiki, release notes, or Word/PDF implementation document as needed.*
