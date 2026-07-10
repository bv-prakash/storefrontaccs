import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { CATEGORY_TREE_QUERY } from './categoryQuery.js';

// Cleaned up and grouped imports via the correct relative path structure
import {
  CS_FETCH_GRAPHQL,
} from '../../../scripts/commerce.js';

/**
 * Step 2: Validate Categories
 * Ensures invalid or incomplete data branches do not crash render cycles
 */
function shouldShowCategory(category) {
  return category?.name && category?.urlPath;
}

/**
 * Step 3: Sort Categories
 * Sorts layout trees sequentially by commerce workspace weight positions
 */
function getSortedCategories(categories) {
  return [...categories].sort((a, b) => {
    if (Number.isFinite(a.position) && Number.isFinite(b.position)) {
      return a.position - b.position;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Step 4: Build Category Tree (Recursively)
 * Translates flat parentId arrays into fully nested child arrays
 */
function buildCategoryTree(categories, parentId) {
  return getSortedCategories(categories)
    .filter(
      (category) => category.parentId === parentId
        && shouldShowCategory(category),
    )
    .map((category) => ({
      id: category.id,
      name: category.name,
      url_path: category.urlPath, // Keep field alignment uniform for menuBuilder
      isCustom: false,
      children: buildCategoryTree(categories, category.id),
    }));
}

/**
 * Step 5: Fetch Categories from Commerce Mesh Gateway via Drop-in Client
 */
export async function fetchCommerceCategories() {
  try {
    // Read the root identifier configured globally inside config.json
    const rootCategoryId = await getConfigValue('plugins.picker.rootCategory') || '2';

    // Execute via the authorized instance to automatically append all Magento headers
    const response = await CS_FETCH_GRAPHQL.fetchGraphQl(
      CATEGORY_TREE_QUERY,
      {
        variables: {
          rootCategoryIds: [rootCategoryId],
        },
      },
    );

    if (response.errors?.length) {
      console.error('Category navigation mesh query execution errors:', response.errors);
      return [];
    }

    const flatCategories = response.data?.categories || [];

    // Transform the flat database list into a deeply nested hierarchy loop
    return buildCategoryTree(flatCategories, rootCategoryId);
  } catch (error) {
    console.error('Critical operational failure pulling commerce metadata maps:', error);
    return [];
  }
}
