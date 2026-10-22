# Custom product reviews on PDP and PLP (Mesh REST API)

**Copy into Word or Google Docs**

Markdown tables and code blocks often paste badly from the IDE. Use one of these instead:

| File | How to use |
| --- | --- |
| [product-reviews-stakeholder-guide.txt](./product-reviews-stakeholder-guide.txt) | Open in editor → Select all (Ctrl+A / Cmd+A) → Copy → Paste into doc |
| [product-reviews-stakeholder-guide.html](./product-reviews-stakeholder-guide.html) | **Word:** File → Open → choose this HTML → Save As `.docx` · **Browser:** Open file → Ctrl+A → Copy → Paste into Google Docs |

---

## Purpose

Shoppers see star ratings and review counts on **PLP** and **PDP**, open a **Reviews** tab on the product page, read paginated reviews, and submit new reviews (name, title, rating, body). Data is loaded and saved through an **Adobe I/O Runtime / App Builder** REST API (`get-ratings`, `create-review`), not through Commerce storefront GraphQL. The API base URL is set in **`config.json`** per store view; review content and moderation live in your Mesh/backend service.

**Repo:** https://github.com/bv-prakash/storefrontaccs/

---

## Who does what

### Merchants / backend (Mesh / App Builder)

- Deploy and maintain the **product-reviews** web actions (`get-ratings`, `create-review`).
- Expose a stable base URL (e.g. `https://…/api/v1/web/product-reviews`).
- Allow **CORS** (or equivalent) for storefront origins: local dev (`localhost:3000`), feature preview (`*.aem.page`), and live (`*.aem.live`).
- Ensure responses include `averageRating`, `reviewCount`, `reviews[]`, and `pagination` (page, limit, totalPages) as documented below.
- Operate review moderation/approval in your backend if required before reviews appear in `get-ratings`.

### Authors (da.live / AEM)

- Use the standard **Product Details** block on PDP pages (reviews are built into that block, not a separate CMS block).
- Ensure the PDP includes the **Reviews** tab and product-details layout shipped with this project.
- **PLP / category** pages use the **Product List Page** block; review stars appear automatically under the product title when the API returns reviews for that SKU.
- No extra block rows or cells are required for reviews—UI is rendered at runtime from the API.

### Shoppers

- **PDP (under price):** If reviews exist, see gold stars and **“N Reviews”** (opens Reviews tab). If none, **Be the first reviewer** opens the write-review form.
- **PDP (Reviews tab):** See rating summary and breakdown, **Write a Review** (toggles the form), then the review list (5 per page with Previous/Next when there are more than 5).
- **Write a review:** Select stars (hover preview, click to select), enter name, **review title**, and review text, then submit.
- **PLP:** Stars and review count under the product name when that SKU has reviews.

### Developers / implementers

- **What was built:** `scripts/product-reviews.js` (REST client) + `scripts/components/product-reviews/` (UI/CSS), wired in `scripts/commerce.js`, `blocks/product-details/product-details.js`, and `blocks/product-list-page/product-list-page.js`.
- **Install, file lists, remove steps, API details:** this document (sections below).
- **Initialization:** `scripts/commerce.js` → `initializeCommerce()` → `initProductReviewsApi()`.

---

## If you do not need product reviews

- **Hide behavior only:** Remove PLP/PDP wiring and delete `scripts/components/product-reviews/`; follow **Remove — UI only** below. You can leave `product-reviews-api-base` in config if the backend stays for a later phase.
- **Remove completely:** Follow **Remove — full module** below (includes `scripts/product-reviews.js`, `commerce.js` init, and config keys).

---

## Support checklist

| Issue | What to check |
| --- | --- |
| No stars on PDP or PLP | `product-reviews-api-base` in `config.json` for the active store/locale; browser console for init warning; Network tab for failed `get-ratings` |
| PLP stars missing but PDP works | PLP rating must be a **sibling** of the title link (inside the title `<a>` is clipped by line-clamp CSS) |
| CORS / fetch failed | Mesh runtime allowlist includes your site origin |
| Submit fails | POST `create-review` logs; required fields: `sku`, `author`, `title`, `review`, `rating` (1–5) |
| Wrong average or star display | API `averageRating` and per-review `rating` should be **1–5**; half stars use the average (e.g. 3.5) |
| Counts stale after submit | Hard refresh; submit path invalidates client cache for that SKU |
| Configurable product wrong SKU | PDP must call review sync when the active variant SKU changes (`syncProductReviews` on product data) |
| Pagination missing | More than 5 reviews for SKU; API should return sensible `pagination.totalPages` |

---

## Repository paths

`scripts/product-reviews.js` · `scripts/components/product-reviews/` · `scripts/commerce.js` · `blocks/product-details/` · `blocks/product-list-page/` · `config.json` · `default-site.json` · `icons/star.svg`

---

## Module file checklist

Paths are relative to the repository root.

### Feature files (owned by product reviews)

| Path | Purpose |
| --- | --- |
| `scripts/product-reviews.js` | Mesh REST client, cache, star normalization, create review |
| `scripts/components/product-reviews/product-reviews.js` | Teaser, PDP section, PLP rating, stars, form, pagination |
| `scripts/components/product-reviews/product-reviews.css` | Scoped styles (PDP + PLP) |
| `scripts/components/product-reviews/README.md` | This document |
| `icons/star.svg` | Reference star SVG (runtime also builds SVG in JS) |

### Integration — existing files to wire or revert

| File | Role |
| --- | --- |
| `scripts/commerce.js` | `initProductReviewsApi()` inside `initializeCommerce()` |
| `config.json` | `product-reviews-api-base` under each `public` store key |
| `default-site.json` | Template placeholder `{PRODUCT_REVIEWS_API_BASE}` |
| `blocks/product-details/product-details.js` | Teaser mount, Reviews tab, `mountProductReviewsSection`, `renderProductReviewTeaser`, labels, CSS load |
| `blocks/product-list-page/product-list-page.js` | `SearchResults` → `ProductName` slot → `renderPlpProductReviewRating`, CSS load |

---

## Configuration (`config.json`)

Under `public` → store key (e.g. `default`, `/fr/`):

```json
{
  "product-reviews-api-base": "https://YOUR_NAMESPACE.adobeioruntime.net/api/v1/web/product-reviews"
}
```

**`default-site.json`** (provisioning template):

```json
"product-reviews-api-base": "{PRODUCT_REVIEWS_API_BASE}"
```

Storefront requests also send `headers.all` and `headers.cs` from the same store section when present.

---

## API reference

| Action | Method | URL |
| --- | --- | --- |
| Get ratings & reviews | `GET` | `{product-reviews-api-base}/get-ratings?sku={sku}&page={page}&limit={limit}` |
| Create review | `POST` | `{product-reviews-api-base}/create-review` |

### GET response (example)

```json
{
  "success": true,
  "sku": "24-MB01",
  "averageRating": 4.5,
  "reviewCount": 2,
  "reviews": [
    {
      "author": "Roni",
      "title": "Nice",
      "review": "hello world review",
      "rating": 5
    }
  ],
  "pagination": { "page": 1, "limit": 5, "total": 2, "totalPages": 1 }
}
```

### POST body

| Field | Required | Storefront source |
| --- | --- | --- |
| `sku` | Yes | Current product SKU |
| `author` | Yes | Form “Your name” |
| `title` | Yes | Form “Review title” (max 255) |
| `review` | Yes | Form “Your review” |
| `rating` | Yes | Integer 1–5 from star picker |

---

## UI behavior (reference)

| Surface | Behavior |
| --- | --- |
| PDP under price | Stars + “N Reviews”, or **Be the first reviewer** |
| PDP Reviews tab | Hero → write-review form (toggle) → list → pagination (5 per page) |
| PLP | Stars + “N Reviews” under title if `reviewCount` > 0 |

Optional placeholder keys (`labels.Global.*`) are wired in `blocks/product-details/product-details.js` (`ReviewTitle`, `WriteReview`, `ReviewSubmitted`, pagination labels, etc.).

---

## Remove module

### Remove — UI only

1. **`blocks/product-details/product-details.js`** — Remove product-reviews imports, teaser/reviews mounts, `syncProductReviews`, reviews CSS load, and `reviewLabels` if unused.
2. **`blocks/product-list-page/product-list-page.js`** — Remove import, `ProductName` slot rating mount, reviews CSS load.
3. Delete **`scripts/components/product-reviews/`** (folder).
4. Optionally delete **`icons/star.svg`** if nothing else uses it.

### Remove — full module

Do UI steps above, then:

1. **`scripts/commerce.js`** — Remove `initProductReviewsApi` import and call.
2. Delete **`scripts/product-reviews.js`**.
3. Remove **`product-reviews-api-base`** from **`config.json`** and **`default-site.json`** for each store.
4. Run **`npm run lint`** and verify no network calls to `get-ratings` / `create-review`.

---

## Local validation

1. Set `product-reviews-api-base` in `config.json`.
2. Start dev server (`npx @adobe/aem-cli up` or project equivalent).
3. Test PDP (teaser, Reviews tab, form toggle, submit, pagination) and PLP (stars when reviews exist).
4. Run `npm run lint` before commit.
