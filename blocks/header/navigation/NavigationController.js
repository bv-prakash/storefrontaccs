// header/navigation/NavigationController.js
import { fetchCommerceCategories } from './categoryService.js';
import { parseCustomCategories, blendNavigationTrees, generateMenuMarkup } from './menuBuilder.js';
import { renderDesktopRenderer } from './renderers/desktop/desktopRenderer.js';
import { renderMobileRenderer } from './renderers/mobile/mobileRenderer.js';

export class NavigationController {
  constructor(headerElement, navUrl) {
    this.headerElement = headerElement;
    this.navUrl = navUrl;
  }

  async init() {
    try {
      // Load the layout trees simultaneously
      const [daLiveResponse, commerceTree] = await Promise.all([
        fetch(`${this.navUrl}.plain.html`),
        fetchCommerceCategories(), // No longer requires passing manual endpoint configurations
      ]);

      if (!daLiveResponse.ok) throw new Error('Could not pull da.live design markup');

      const daLiveRawHtml = await daLiveResponse.text();
      const daLivePlaceholder = document.createElement('div');
      daLivePlaceholder.innerHTML = daLiveRawHtml;

      // Extract custom items from da.live and stitch them into the commerce categories
      const customMap = parseCustomCategories(daLivePlaceholder);
      const fullyBlendedTree = blendNavigationTrees(commerceTree, customMap);
      const runtimeMenuDom = generateMenuMarkup(fullyBlendedTree);

      // Render the menu based on the current viewport layout
      if (window.matchMedia('(min-width: 900px)').matches) {
        renderDesktopRenderer(runtimeMenuDom, this.headerElement);
      } else {
        renderMobileRenderer(runtimeMenuDom, this.headerElement);
      }
    } catch (err) {
      console.error('Critical failure establishing unified menu framework:', err);
    }
  }
}
