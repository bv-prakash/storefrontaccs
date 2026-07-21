import { events } from '@dropins/tools/event-bus.js';
import * as cartApi from '@dropins/storefront-cart/api.js';
import { CompareService } from '../../scripts/compare-service.js';
import { getProductLink } from '../../scripts/commerce.js';
import { readBlockConfig } from '../../scripts/aem.js';

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const startShoppingUrl = config['start-shopping-url'] || '/';

  const pageTitle = document.querySelector('meta[name="title"]')?.content || 'Compare Products';

  if (!document.title.includes(pageTitle)) {
    document.title = pageTitle;
  }

  const renderComparisonGrid = () => {
    const items = CompareService.getProducts();

    if (items.length === 0) {
      block.innerHTML = `
        <div class="search__header">
          <h1 class="plp-title">${pageTitle}</h1>
          <div class="plp-breadcrumbs-container">
            <a href="/">Home</a> / <span>Compare</span>
          </div>
        </div>
        <div class="compare-empty-state">
          <h2>Your comparison list is empty</h2>
          <p>Go back to the catalog to select items for review.</p>
          <a href="${startShoppingUrl}" class="button primary">Start Shopping</a>
        </div>
      `;
      return;
    }

    block.innerHTML = `
      <div class="search__header">
        <h1 class="plp-title">${pageTitle}</h1>
        <div class="plp-breadcrumbs-container">
          <a href="/">Home</a> / <span>Compare</span>
        </div>
      </div>
      
      <div class="compare-matrix-container">
        <table class="compare-matrix-table">
          <thead>
            <tr>
              <th class="matrix-sticky-header">Product Details</th>
              ${items.map((product) => {
    // Determine if it needs to link out to PDP or can be added instantly
    const isComplex = product.typename === 'ComplexProductView';
    const actionButtonHtml = isComplex
      ? `<a href="${getProductLink(product.urlKey, product.sku)}" class="button primary matrix-add-to-cart-btn">
                      View Options
                     </a>`
      : `<button type="button" class="button primary matrix-add-to-cart-btn" data-sku="${product.sku}">
                      Add to Cart
                     </button>`;

    return `
                  <th data-sku="${product.sku}">
                    <div class="matrix-product-card">
                      <button class="matrix-remove-trigger" data-sku="${product.sku}">Remove ×</button>
                      <img src="${product.image}" alt="${product.name}" class="matrix-thumb">
                      <a href="${getProductLink(product.urlKey, product.sku)}" class="matrix-title">${product.name}</a>
                      
                      <!-- Standard Frame Matrix Action Slot Insertion -->
                      <div class="matrix-cart-action-wrapper">
                        ${actionButtonHtml}
                      </div>
                    </div>
                  </th>
                `;
  }).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="matrix-sticky-header attribute-title">SKU ID</td>
              ${items.map((product) => `<td><code>${product.sku}</code></td>`).join('')}
            </tr>
            <tr>
              <td class="matrix-sticky-header attribute-title">Price</td>
              ${items.map((product) => `<td><span class="matrix-price">$${product.price || 'N/A'}</span></td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;

    // Bind item deletion handlers
    block.querySelectorAll('.matrix-remove-trigger').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetSku = e.target.getAttribute('data-sku');
        CompareService.removeProduct(targetSku);
        events.emit('compare/update');
      });
    });

    // Bind Add to Cart action events mapping to matching native framework loader pipelines
    block.querySelectorAll('button.matrix-add-to-cart-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const targetButton = e.target;
        const sku = targetButton.getAttribute('data-sku');

        // Apply structural loading properties native to dropin modules
        targetButton.setAttribute('aria-busy', 'true');
        targetButton.setAttribute('disabled', 'true');
        const originalText = targetButton.textContent;
        targetButton.textContent = 'Adding...';

        try {
          // Direct API calls fire event triggers automatically updating minicart elements
          await cartApi.addProductsToCart([{ sku, quantity: 1 }]);

          // Dispatch native 'cart/data' listener notification hooks to force minicart updates
          const cartData = await cartApi.getCartData();
          events.emit('cart/data', cartData);

          targetButton.textContent = 'Added!';
          setTimeout(() => {
            targetButton.removeAttribute('aria-busy');
            targetButton.removeAttribute('disabled');
            targetButton.textContent = originalText;
          }, 2000);
        } catch (err) {
          console.error('Failed to add product directly from matrix sheet:', err);
          targetButton.removeAttribute('aria-busy');
          targetButton.removeAttribute('disabled');
          targetButton.textContent = originalText;
        }
      });
    });
  };

  renderComparisonGrid();
  events.on('compare/update', renderComparisonGrid);
}
