// header/navigation/navigation.js
import { fetchCommerceCategories } from './categoryService.js';
import { parseCustomCategories, createMarkupFromTree, blendNavigationTrees } from './menuBuilder.js';

/**
 * Entry point inside your navigation module block.
 * Intercepts the default da.live nav elements and merges them dynamically.
 */
export async function initNavigationHook(navSectionsContainer) {
  const commerceEndpoint = 'https://your-commerce-instance.com/graphql';

  try {
    // 1. Parse the standard lists out of the markup header.js just rendered
    const customMap = parseCustomCategories(navSectionsContainer);

    // 2. Load external commerce paths
    const commerceCategories = await fetchCommerceCategories(commerceEndpoint);

    // 3. Blend them (treating Commerce as base, attaching da.live lookups)
    const unifiedTree = blendNavigationTrees(commerceCategories, customMap);

    // 4. Build the final rich element node structures
    const runtimeMegaMenuDom = createMarkupFromTree(unifiedTree);

    // 5. Clean out the simple boilerplate list and drop in the mega structure
    navSectionsContainer.textContent = '';
    navSectionsContainer.appendChild(runtimeMegaMenuDom);

    // Add dropdown hover visibility classes
    navSectionsContainer.querySelectorAll('.nav-item-top.has-megamenu').forEach((item) => {
      item.addEventListener('mouseenter', () => item.setAttribute('aria-expanded', 'true'));
      item.addEventListener('mouseleave', () => item.setAttribute('aria-expanded', 'false'));
    });
  } catch (error) {
    console.error('Failed processing navigation sub-module interceptor pipeline:', error);
  }
}
