# Product reviews (PLP + PDP)

## API configuration (Adobe I/O Mesh / App Builder)

Reviews call your **REST web actions**, not storefront GraphQL.

In `config.json` → `public` → store key (e.g. `default`):

```json
{
  "product-reviews-api-base": "https://748062-106maroongoat-stage.adobeioruntime.net/api/v1/web/product-reviews"
}
```

| Action | Method | URL |
| --- | --- | --- |
| Get ratings & reviews | `GET` | `{product-reviews-api-base}/get-ratings?sku={sku}&page=1&limit=20` |
| Create review | `POST` | `{product-reviews-api-base}/create-review` |

### GET `get-ratings` response (example)

```json
{
  "success": true,
  "sku": "24-MB01",
  "averageRating": 4.5,
  "reviewCount": 2,
  "reviews": [
    {
      "id": "...",
      "sku": "24-MB01",
      "author": "Roni",
      "title": "Nice",
      "review": "hello world review",
      "rating": 5
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 2, "totalPages": 1 }
}
```

### POST `create-review` body

| Field | Required | Notes |
| --- | --- | --- |
| `sku` | Yes | Product SKU |
| `author` | Yes | Reviewer name (PDP form “Your name”) |
| `title` | Yes | Review title (PDP form field; max 255 characters) |
| `review` | Yes | Review body |
| `rating` | Yes | Integer 1–5 |

Storefront sends Commerce `headers.all` and `headers.cs` on both requests when present.

Initialization: `scripts/commerce.js` → `initializeCommerce()` → `initProductReviewsApi()` in `scripts/product-reviews.js`.

## UI behavior

| Surface | Behavior |
| --- | --- |
| PDP (under price) | Stars + count, or **Be the first reviewer** (smooth scroll to form) |
| PDP (reviews section) | Write-review form above review list |
| PLP (under title) | Stars when `reviewCount` > 0 |

## Files

| File | Role |
| --- | --- |
| `scripts/product-reviews.js` | Mesh REST client |
| `scripts/components/product-reviews/product-reviews.js` | DOM / forms |
| `blocks/product-details/product-details.js` | PDP |
| `blocks/product-list-page/product-list-page.js` | PLP |
