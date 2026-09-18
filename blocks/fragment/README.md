# Fragment Block

## Overview

The Fragment block includes content from another page or fragment into the current page. Authors specify a fragment URL via a link or plain text path inside the block. The referenced fragment is fetched as `.plain.html`, its sections are decorated and loaded, and the resulting content replaces the block's own content.

## Integration

### Block Configuration

No block configuration is read via `readBlockConfig()`.

### URL Parameters

No URL parameters are directly read. The fragment path is extracted from the first `<a>` element within the block, or from the block's trimmed text content when no link is present.

### Local Storage

No localStorage keys are used by this block.

### Events

#### Event Listeners

No event listeners are implemented in this block.

#### Event Emitters

No events are emitted by this block.

## Behavior Patterns

### Fragment Loading

- **Link-based path**: When the block contains an `<a>` element, its `href` attribute is used as the fragment path.
- **Text-based path**: When no link is present, the block's text content (trimmed) is used as the fragment path.
- **Absolute paths**: Only paths starting with `/` and not starting with `//` are fetched (relative to the root path).
- **Fetch URL**: The fragment is fetched from `${rootPath}${path}.plain.html`.
- **Fallback**: If the path is empty, malformed, or the fetch fails, the block remains empty (the function returns `null`).

### Fragment Processing

- The fetched HTML is injected into a temporary `<main>` element.
- `resetMediaBasePaths` adjusts media asset URLs relative to the fragment path.
- `decorateMain` decorates the fragment content into sections and blocks.
- `loadSections` loads and initializes all sections and blocks within the fragment.
- The processed fragment content replaces the block's children via `block.replaceChildren()`.

## Error Handling

- **Invalid path**: If the path does not start with `/`, the function returns `null` without fetching.
- **Network errors**: Fetch failures are not explicitly caught; the caller (`decorate`) should handle a `null` result gracefully.
- **Non-OK responses**: If the fetch response is not OK, the function returns `null`.
- **Missing content**: If the fragment resolves to an empty document, the block's content is replaced with nothing.
