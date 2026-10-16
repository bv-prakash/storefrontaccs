import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-account/api.js';
import { initializeDropin } from './index.js';
import {
  CORE_FETCH_GRAPHQL,
  fetchPlaceholders,
  getLangDefinitions,
} from '../commerce.js';

await initializeDropin(async () => {
  // Set Fetch GraphQL (Core)
  setEndpoint(CORE_FETCH_GRAPHQL);

  // Fetch placeholders
  const labels = await fetchPlaceholders('placeholders/account.json');
  const langDefinitions = getLangDefinitions(labels);

  // Initialize account
  return initializers.mountImmediately(initialize, {
    langDefinitions,
  });
})();
