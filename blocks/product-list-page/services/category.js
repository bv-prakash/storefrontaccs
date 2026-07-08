import { CORE_FETCH_GRAPHQL } from '../../../scripts/commerce.js';

const CATEGORY_QUERY = `
query CategoryByUrlPath($urlPath: String!) {
  categories(
    filters: {
      url_path: {
        eq: $urlPath
      }
    }
  ) {
    items {
      id
      uid
      name
      description
      image
      url_path

      breadcrumbs {
        category_name
        category_url_path
      }
    }
  }
}
`;

export async function getCategory(urlPath) {
    try {
        const response = await CORE_FETCH_GRAPHQL.fetchGraphQL(
            CATEGORY_QUERY,
            {
                variables: {
                    urlPath,
                },
            },
        );

        return response.data.categories.items[0] ?? null;
    } catch (e) {
        console.error('Unable to fetch category', e);
        return null;
    }
}