import { CS_FETCH_GRAPHQL } from '../../../scripts/commerce.js';

const CATEGORY_QUERY = `
query CategoryByUrlPath($urlPath: [String!]!) {
  categoryTree(slugs: $urlPath) {
    name
    slug
    parentSlug
  }
}
`;

export async function getCategory(urlPath) {
  try {
    if (!CS_FETCH_GRAPHQL.getFetchGraphQlHeader('Magento-Store-View-Code') && !CS_FETCH_GRAPHQL.getFetchGraphQlHeader('AC-Scope-Locale')) {
      CS_FETCH_GRAPHQL.setFetchGraphQlHeader('Magento-Store-View-Code', 'default');
    }

    const response = await CS_FETCH_GRAPHQL.fetchGraphQl(
      CATEGORY_QUERY,
      { variables: { urlPath: [urlPath] } },
    );

    const category = response?.data?.categoryTree?.[0];

    if (!category) {
      return {
        name: urlPath.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        url_path: urlPath,
        breadcrumbs: [],
      };
    }

    category.breadcrumbs = [];
    category.url_path = category.slug;

    return category;
  } catch (e) {
    console.error('Unable to fetch category', e);
    return null;
  }
}
