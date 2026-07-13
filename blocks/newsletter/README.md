# Newsletter Block Component (Adobe Commerce EDS)

This component implements a highly performant, decoupled newsletter subscription block for Adobe Commerce storefronts powered by Adobe Edge Delivery Services (EDS). It captures user emails natively via document-based authoring and submits them asynchronously to the Adobe Commerce GraphQL gateway.

The block architecture has been modularized into distinct subfolders to ensure clear separation of concerns, high reliability, and effortless modification/debugging.

---

## 📁 Directory Structure

```text
📁 blocks/newsletter
├── 📁 api
│   └── graphql.js       # Handles communication with Adobe Commerce GraphQL API
├── 📁 ui
│   └── template.js      # Manages DOM structures, structural HTML, and visual feedback
├── newsletter.css       # Core presentation and responsive layout rules
└── newsletter.js        # Main component orchestrator and event binding lifecycle