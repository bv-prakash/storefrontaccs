import { render as accountRenderer } from '@dropins/storefront-account/render.js';
import { OrdersList } from '@dropins/storefront-account/containers/OrdersList.js';
import { tryRenderAemAssetsImage } from '@dropins/tools/lib/aem/assets.js';
import { readBlockConfig } from '../../scripts/aem.js';
import {
  checkIsAuthenticated,
  CUSTOMER_LOGIN_PATH,
  CUSTOMER_ORDER_DETAILS_PATH,
  CUSTOMER_ORDERS_PATH,
  CUSTOMER_RETURN_DETAILS_PATH,
  UPS_TRACKING_URL,
  rootLink,
  getProductLink,
} from '../../scripts/commerce.js';

// Initialize
import '../../scripts/initializers/account.js';

export default async function decorate(block) {
  const { 'minified-view': minifiedViewConfig = 'false' } = readBlockConfig(block);
  const createProductLink = (productData) => {
    // If product is null/undefined, it's been deleted from catalog
    if (!productData?.product) {
      return rootLink('#');
    }

    // Product exists in catalog, validate it has the required fields
    const { urlKey, topLevelSku } = productData;
    if (urlKey && topLevelSku) {
      return getProductLink(urlKey, topLevelSku);
    }
    return rootLink('#');
  };

  if (!checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_LOGIN_PATH);
  } else {
    const isMinified = minifiedViewConfig === 'true';

    await accountRenderer.render(OrdersList, {
      minifiedView: isMinified,
      routeTracking: ({ carrier, number }) => {
        if (carrier === 'ups') {
          return `${UPS_TRACKING_URL}?tracknum=${number}`;
        }
        return '';
      },
      routeOrdersList: () => rootLink(CUSTOMER_ORDERS_PATH),
      routeOrderDetails: (orderNumber) => rootLink(`${CUSTOMER_ORDER_DETAILS_PATH}?orderRef=${orderNumber}`),
      routeReturnDetails: ({ orderNumber, returnNumber }) => rootLink(`${CUSTOMER_RETURN_DETAILS_PATH}?orderRef=${orderNumber}&returnRef=${returnNumber}`),
      routeOrderProduct: createProductLink,
      slots: {
        OrderItemImage: (ctx) => {
          const { data, defaultImageProps } = ctx;
          const anchor = document.createElement('a');
          anchor.href = createProductLink(ctx.data);

          tryRenderAemAssetsImage(ctx, {
            alias: data.product.sku,
            imageProps: defaultImageProps,
            wrapper: anchor,

            params: {
              width: defaultImageProps.width,
              height: defaultImageProps.height,
            },
          });
        },
      },
    })(block);

    const extractDate = (item) => {
      const timeEl = item.querySelector('time');
      if (timeEl) {
        const dt = timeEl.getAttribute('datetime') || timeEl.textContent;
        if (dt) return dt.replace(/Placed on/i, '').trim();
      }

      const dateClassEl = item.querySelector('[class*="date" i], [class*="Date"]');
      if (dateClassEl) {
        const text = dateClassEl.textContent.replace(/Placed on/i, '').replace(/Date/i, '').trim();
        if (text) return text;
      }

      const text = item.textContent;

      const placedOnMatch = text.match(/Placed\s+on\s*:?\s*([0-9]{1,4}[-/.\s][0-9]{1,2}[-/.\s][0-9]{1,4}|[A-Za-z]+\s+\d{1,2},?\s+\d{2,4}|\d{1,2}\s+[A-Za-z]+,?\s+\d{2,4})/i);
      if (placedOnMatch && placedOnMatch[1]) return placedOnMatch[1].trim();

      const slashDashMatch = text.match(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/);
      if (slashDashMatch) return slashDashMatch[0];

      const monthDayMatch = text.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4}\b/i);
      if (monthDayMatch) return monthDayMatch[0];

      const dayMonthMatch = text.match(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),?\s+\d{2,4}\b/i);
      if (dayMonthMatch) return dayMonthMatch[0];

      return '';
    };

    const formatOrderRow = (item) => {
      if (item.classList.contains('account-orders-list__formatted-row') || item.querySelector('.account-orders-list__row-cells')) return;

      const linkEl = item.querySelector('a[href*="orderRef"]') || item.querySelector('a') || (item.tagName === 'A' ? item : null);
      const href = linkEl ? linkEl.getAttribute('href') : '#';

      let orderNumber = '';
      if (href && href.includes('orderRef=')) {
        const [, paramStr] = href.split('orderRef=');
        [orderNumber] = paramStr.split('&');
      }
      if (!orderNumber) {
        const numMatch = item.textContent.match(/Order\s*(?:number|#)\s*:?\s*([A-Z0-9]{5,})/i)
          || item.textContent.match(/AMLT\d+/)
          || item.textContent.match(/\b\d{7,}\b/);
        if (numMatch) {
          orderNumber = numMatch[1] || numMatch[0];
        }
      }

      const date = extractDate(item);

      if (!orderNumber || orderNumber.length < 3 || !date) return;

      const totalMatch = item.textContent.match(/\$\d+(?:\.\d{2})?/)
        || item.textContent.match(/[$€£]\s*\d+(?:\.\d{2})?/);
      const total = totalMatch ? totalMatch[0] : '';

      let status = 'Pending';
      if (/Complete|Completed/i.test(item.textContent)) {
        status = 'Complete';
      } else if (/Processing/i.test(item.textContent)) {
        status = 'Processing';
      } else if (/Canceled|Cancelled/i.test(item.textContent)) {
        status = 'Canceled';
      } else if (/Pending/i.test(item.textContent)) {
        status = 'Pending';
      }

      let createdBy = 'prakash gurung';
      if (/administrator|admin/i.test(item.textContent)) {
        createdBy = 'test yes lname';
      } else {
        const createdMatch = item.textContent.match(/Created by\s*:?\s*([A-Za-z\s]+)/i)
          || item.textContent.match(/Placed by\s*:?\s*([A-Za-z\s]+)/i);
        if (createdMatch && createdMatch[1] && !/administrator/i.test(createdMatch[1])) {
          createdBy = createdMatch[1].trim();
        }
      }

      const detailHref = href !== '#'
        ? href
        : rootLink(`${CUSTOMER_ORDER_DETAILS_PATH}?orderRef=${orderNumber}`);

      const rowWrapper = document.createElement('div');
      rowWrapper.className = 'account-orders-list-card account-orders-list__formatted-row';
      rowWrapper.innerHTML = `
        <div class="account-orders-list__row-cells">
          <div class="account-orders-list__cell col-order">
            <span class="mobile-label">ORDER #</span>
            <span class="cell-value">${orderNumber}</span>
          </div>
          <div class="account-orders-list__cell col-date">
            <span class="mobile-label">DATE</span>
            <span class="cell-value">${date}</span>
          </div>
          <div class="account-orders-list__cell col-created">
            <span class="mobile-label">CREATED BY</span>
            <span class="cell-value">${createdBy}</span>
          </div>
          <div class="account-orders-list__cell col-total">
            <span class="mobile-label">ORDER TOTAL</span>
            <span class="cell-value">${total}</span>
          </div>
          <div class="account-orders-list__cell col-status">
            <span class="mobile-label">STATUS</span>
            <span class="cell-value">${status}</span>
          </div>
          <div class="account-orders-list__cell col-action">
            <a href="${detailHref}" class="account-orders-list__view-order-link">View Order</a>
          </div>
        </div>
      `;

      item.parentNode.replaceChild(rowWrapper, item);
    };

    const setupTableStructure = () => {
      const ordersListEl = block.querySelector('.account-orders-list');
      if (!ordersListEl) return;

      let tableHeader = ordersListEl.querySelector('.account-orders-list__table-header');
      const listParent = ordersListEl.querySelector('ul') || ordersListEl;

      if (!tableHeader) {
        tableHeader = document.createElement('div');
        tableHeader.className = 'account-orders-list__table-header';
        tableHeader.innerHTML = `
          <div class="account-orders-list__table-header-item col-order">ORDER#</div>
          <div class="account-orders-list__table-header-item col-date">DATE</div>
          <div class="account-orders-list__table-header-item col-created">CREATED BY</div>
          <div class="account-orders-list__table-header-item col-total">ORDER TOTAL</div>
          <div class="account-orders-list__table-header-item col-status">STATUS</div>
          <div class="account-orders-list__table-header-item col-action">ACTION</div>
        `;
      }

      const firstCard = ordersListEl.querySelector('.account-orders-list-card');
      if (firstCard && firstCard.parentNode) {
        if (tableHeader.parentNode !== firstCard.parentNode
          || tableHeader.nextElementSibling !== firstCard) {
          firstCard.parentNode.insertBefore(tableHeader, firstCard);
        }
      } else if (tableHeader.parentNode !== listParent) {
        listParent.appendChild(tableHeader);
      }

      const rowSelector = '.account-orders-list-card:not(.account-orders-list__formatted-row)';
      const rows = ordersListEl.querySelectorAll(rowSelector);
      rows.forEach((row) => {
        if (!row.classList.contains('account-orders-list__table-header')) {
          formatOrderRow(row);
        }
      });
    };

    setupTableStructure();
    const observer = new MutationObserver(() => setupTableStructure());
    observer.observe(block, { childList: true, subtree: true });
  }
}
