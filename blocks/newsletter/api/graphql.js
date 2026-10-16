import { getConfigValue, getHeaders } from '@dropins/tools/lib/aem/configs.js';
import { CORE_FETCH_GRAPHQL } from '../../../scripts/commerce.js';

/**
 * Subscribes an email to the Adobe Commerce newsletter for the active store view.
 * @param {string} email
 * @returns {Promise<string>} Status: 'SUBSCRIBED', 'NOT_ACTIVE', or throws error
 */
export async function subscribeEmail(email) {
  const query = `
    mutation Subscribe($email: String!) {
      subscribeEmailToNewsletter(email: $email) {
        status
      }
    }
  `;

  if (CORE_FETCH_GRAPHQL.endpoint) {
    const result = await CORE_FETCH_GRAPHQL.fetchGraphQl(query, {
      method: 'POST',
      variables: { email },
    });

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result?.data?.subscribeEmailToNewsletter?.status;
  }

  const endpoint = await getConfigValue('commerce-core-endpoint')
    || await getConfigValue('commerce-endpoint')
    || window.configs?.['commerce-core-endpoint']
    || window.configs?.['commerce-endpoint']
    || '/graphql';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getHeaders('all'),
    },
    body: JSON.stringify({
      query,
      variables: { email },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }

  return result?.data?.subscribeEmailToNewsletter?.status;
}
