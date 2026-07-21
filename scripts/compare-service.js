const STORAGE_KEY = 'commerce_compare_list';
const MAX_COMPARE_ITEMS = 4;

export const CompareService = {
  getProducts() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  },

  addProduct(product) {
    const list = this.getProducts();

    if (list.some((item) => item.sku === product.sku)) {
      return {
        success: false,
        reason: 'exists',
        products: list,
      };
    }

    if (list.length >= MAX_COMPARE_ITEMS) {
      return {
        success: false,
        reason: 'limit',
        message: `You can only compare up to ${MAX_COMPARE_ITEMS} products.`,
        products: list,
      };
    }

    list.push(product);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));

    return {
      success: true,
      products: list,
    };
  },

  removeProduct(sku) {
    const list = this.getProducts().filter((item) => item.sku !== sku);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return list;
  },
};
