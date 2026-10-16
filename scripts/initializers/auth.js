import { initializers } from '@dropins/tools/initializer.js';
import { initialize, setEndpoint } from '@dropins/storefront-auth/api.js';
import { getConfigValue } from '@dropins/tools/lib/aem/configs.js';
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
  const labels = await fetchPlaceholders('placeholders/auth.json');
  const langDefinitions = getLangDefinitions(labels);

  // Auth initializer has no defaultLocale prop (see api/initialize/initialize.d.ts),
  // but passing the active locale key (fr_FR) in langDefinitions lets the render
  // provider resolve it. Keep `default` = active locale labels as the fallback.
  // Initialize auth
  return initializers.mountImmediately(initialize, {
    langDefinitions,
    adobeCommerceOptimizer: getConfigValue('adobe-commerce-optimizer'),
  });
})();
