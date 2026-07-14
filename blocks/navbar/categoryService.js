import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
import { CATEGORY_TREE_QUERY } from './categoryQuery.js';
import { CS_FETCH_GRAPHQL } from '../../scripts/commerce.js';

function shouldShowCategory(category) {
  return category?.name && category?.urlPath;
}

function getSortedCategories(categories) {
  return [...categories].sort((a, b) => {
    if (Number.isFinite(a.position) && Number.isFinite(b.position)) {
      return a.position - b.position;
    }
    return a.name.localeCompare(b.name);
  });
}

function buildCategoryTree(categories, parentId) {
  return getSortedCategories(categories)
    .filter((category) => category.parentId === parentId && shouldShowCategory(category))
    .map((category) => ({
      id: category.id,
      name: category.name,
      url_path: category.urlPath,
      isCustom: false,
      children: buildCategoryTree(categories, category.id),
    }));
}

export async function fetchCommerceCategories() {
  try {
    const rootCategoryId = await getConfigValue('plugins.picker.rootCategory') || '2';
    const response = await CS_FETCH_GRAPHQL.fetchGraphQl(
      CATEGORY_TREE_QUERY,
      { variables: { rootCategoryIds: [rootCategoryId] } }
    );

    if (response.errors?.length) {
      console.error('Category navigation mesh query execution errors:', response.errors);
      return [];
    }

    return buildCategoryTree(response.data?.categories || [], rootCategoryId);
  } catch (error) {
    console.error('Critical operational failure pulling commerce metadata maps:', error);
    return [];
  }
}