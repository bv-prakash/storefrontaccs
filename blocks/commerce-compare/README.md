# Commerce Compare Block

A modular, browser-persisted product comparison system developed for Adobe Commerce Storefront architectures utilizing Edge Delivery Services and B2C Drop-in components. This feature allows users to select items directly from listing pages and analyze them side-by-side on a dedicated landing page route.

---

## 📂 Repository File Architecture

```text
├── blocks/
│   ├── commerce-compare/
│   │   ├── commerce-compare.js    # Matrix rendering engine & action routers
│   │   └── commerce-compare.css   # Responsive matrix layouts & sticky columns
│   ├── header/
│   │   └── header.js              # Header panel utility injection & badge counter
│   └── product-list-page/
│       └── product-list-page.js   # PLP SearchResults action slot integration
└── scripts/
    └── compare-service.js         # LocalStorage abstraction layer & state rules