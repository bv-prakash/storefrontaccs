// eslint-disable-next-line import/no-unresolved
import { createFragment } from '@dropins/storefront-checkout/lib/utils.js';

import { CHECKOUT_BLOCK } from './constants.js';

/**
 * A frozen, nested object of CSS selectors
 * @readonly
 */
export const selectors = Object.freeze({
  checkout: {
    breadcrumbs: '.checkout__breadcrumbs',
    content: '.checkout__content',
    loader: '.checkout__loader',
    mergedCartBanner: '.checkout__merged-cart-banner',
    heading: '.checkout__heading',
    serverError: '.checkout__server-error',
    outOfStock: '.checkout__out-of-stock',
    login: '.checkout__login',
    shippingForm: '.checkout__shipping-form',
    billToShipping: '.checkout__bill-to-shipping',
    delivery: '.checkout__delivery',
    paymentMethods: '.checkout__payment-methods',
    billingForm: '.checkout__billing-form',
    orderSummary: '.checkout__order-summary',
    cartSummary: '.checkout__cart-summary',
    placeOrder: '.checkout__place-order',
    giftOptions: '.checkout__gift-options',
    termsAndConditions: '.checkout__terms-and-conditions',
    main: '.checkout__main',
    aside: '.checkout__aside',
    stepsNav: '.checkout-progress-bar',
    step1Panel: '.step-1-panel',
    step2Panel: '.step-2-panel',
    continueBtn: '.continue-to-payment-btn',
    backBtn: '.back-to-shipping-btn',
  },
});

/**
 * Creates the main checkout fragment with all checkout blocks.
 * @returns {DocumentFragment} The complete checkout fragment.
 */
export function createCheckoutFragment() {
  return createFragment(`
    <div class="checkout__breadcrumbs"></div>
    <!-- Step Navigation Indicator -->
    <ul class="checkout-progress-bar">
      <li class="checkout-step-btn active" data-step="1">
        <span class="step-label">Shipping</span>
      </li>
      <li class="checkout-step-btn" data-step="2">
        <span class="step-label">Payment</span>
      </li>
    </ul>
    <div class="checkout__wrapper">
      <div class="checkout__loader"></div>
      <div class="checkout__merged-cart-banner"></div>
      <div class="checkout__content">
        <div class="checkout__main">
          <div class="checkout__heading ${CHECKOUT_BLOCK}"></div>
          <div class="checkout__server-error ${CHECKOUT_BLOCK}"></div>
          <div class="checkout__out-of-stock ${CHECKOUT_BLOCK}"></div>
          <div class="checkout__login ${CHECKOUT_BLOCK}"></div>

          <!-- Step 1 Group -->
          <div class="checkout-step-panel step-1-panel active">
            <div class="checkout__shipping-form ${CHECKOUT_BLOCK}"></div>
            <div class="checkout__bill-to-shipping ${CHECKOUT_BLOCK}"></div>
            <div class="checkout__billing-form ${CHECKOUT_BLOCK}"></div>
            <div class="checkout__delivery ${CHECKOUT_BLOCK}"></div>
            <div class="checkout-step-actions">
              <button type="button" class="button primary continue-to-payment-btn">Continue to Payment</button>
            </div>
          </div>

          <!-- Step 2 Group -->
          <div class="checkout-step-panel step-2-panel">
            <div class="checkout__payment-methods ${CHECKOUT_BLOCK}"></div>
            <div class="checkout__terms-and-conditions ${CHECKOUT_BLOCK}"></div>
            <div class="checkout-step-actions">
              <button type="button" class="button secondary back-to-shipping-btn">Back to Shipping</button>
            </div>
            <div class="checkout__place-order ${CHECKOUT_BLOCK}"></div>
          </div>
        </div>
        <div class="checkout__aside">
          <div class="checkout__order-summary ${CHECKOUT_BLOCK}"></div>
          <div class="checkout__gift-options ${CHECKOUT_BLOCK}"></div>
          <div class="checkout__cart-summary ${CHECKOUT_BLOCK}"></div>
        </div>
      </div>
    </div>
  `);
}
