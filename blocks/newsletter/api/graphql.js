// Import directly from the core toolkit instead of proxying through commerce.js
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';

/**
 * Helper to dynamically resolve the Core GraphQL endpoint
 */
async function getGraphQlEndpoint() {
  try {
    // Read the configured core endpoint via the native tools framework
    const endpoint = await getConfigValue('commerce-core-endpoint') || await getConfigValue('commerce-endpoint');
    if (endpoint) return endpoint;
  } catch (e) {
    console.warn('[Newsletter Debug]: Could not read endpoint from core dropin tools, trying window fallback.');
  }

  // Fallback to global window configuration objects if tools mapping hasn't resolved yet
  return window.configs?.['commerce-core-endpoint']
    || window.configs?.['commerce-endpoint']
    || '/graphql';
}

/**
 * Subscribes an email to the Adobe Commerce newsletter.
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

  const endpoint = await getGraphQlEndpoint();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: { email },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    throw new Error(result.errors[0].message);
  }

  return result?.data?.subscribeEmailToNewsletter?.status;
}
