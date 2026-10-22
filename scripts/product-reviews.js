import { getConfigValue, getHeaders } from '@dropins/tools/lib/aem/configs.js';

const summaryCache = new Map();

let reviewsApiBase = '';

/**
 * @returns {Record<string, string>}
 */
function getMeshRequestHeaders() {
  const headers = {
    Accept: 'application/json',
    ...getHeaders('all'),
    ...getHeaders('cs'),
  };
  Object.keys(headers).forEach((key) => {
    if (headers[key] == null) delete headers[key];
  });
  return headers;
}

function getReviewsApiBase() {
  if (!reviewsApiBase) {
    initProductReviewsApi();
  }
  return reviewsApiBase;
}

/**
 * Wire product reviews Mesh REST API from site config.
 *
 * config.json → public → {store}:
 * - product-reviews-api-base — e.g. https://…/api/v1/web/product-reviews
 *   GET  {base}/get-ratings?sku=&page=&limit=
 *   POST {base}/create-review  JSON body
 */
export function initProductReviewsApi() {
  const base = getConfigValue('product-reviews-api-base');
  if (!base) {
    reviewsApiBase = '';
    console.warn(
      'Product reviews: set product-reviews-api-base in config.json',
    );
    return;
  }
  reviewsApiBase = base.replace(/\/+$/, '');
}

/**
 * Normalizes Mesh (1–5) and legacy GraphQL-style (0–100) rating values to 0–5 stars.
 * @param {number|null|undefined} averageRating
 * @returns {number}
 */
export function averageRatingToStars(averageRating) {
  if (averageRating == null || Number.isNaN(Number(averageRating))) {
    return 0;
  }
  const value = Number(averageRating);
  if (value <= 5) {
    return Math.min(5, Math.max(0, value));
  }
  return Math.min(5, Math.max(0, value / 20));
}

/**
 * @param {object} review Mesh or normalized review
 */
function normalizeMeshReview(review) {
  if (!review) return review;
  const stars = averageRatingToStars(review.rating ?? review.average_rating);
  return {
    nickname: review.author ?? review.nickname,
    summary: review.title ?? review.summary,
    text: review.review ?? review.text,
    rating: stars,
    average_rating: stars,
    created_at: review.created_at ?? review.createdAt,
  };
}

/**
 * @param {Array<{ average_rating?: number, rating?: number }>} items
 * @param {number|null} [apiAverage]
 * @returns {{ count: number, stars: number, hasReviews: boolean }}
 */
export function summarizeReviewItems(items = [], apiAverage = null, totalCount = null) {
  const count = totalCount ?? items.length;
  if (!count && !items.length) {
    return { count: 0, stars: 0, hasReviews: false };
  }

  if (apiAverage != null && !Number.isNaN(Number(apiAverage))) {
    return {
      count,
      stars: Math.round(averageRatingToStars(apiAverage) * 10) / 10,
      hasReviews: count > 0,
    };
  }

  if (!items.length) {
    return { count, stars: 0, hasReviews: count > 0 };
  }

  const total = items.reduce(
    (sum, item) => sum + averageRatingToStars(item.rating ?? item.average_rating),
    0,
  );
  return {
    count,
    stars: Math.round((total / items.length) * 10) / 10,
    hasReviews: true,
  };
}

async function meshGetRatings(sku, { page = 1, limit = 20 } = {}) {
  const base = getReviewsApiBase();
  if (!base) {
    throw new Error('Product reviews API is not configured.');
  }

  const url = new URL(`${base}/get-ratings`);
  url.searchParams.set('sku', sku);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getMeshRequestHeaders(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Failed to load reviews (${response.status})`);
  }

  return data;
}

/**
 * @param {string} sku
 * @param {{ pageSize?: number, currentPage?: number, force?: boolean }} [options]
 */
export async function fetchProductReviews(sku, options = {}) {
  const {
    pageSize = 20,
    currentPage = 1,
    force = false,
  } = options;
  const cacheKey = `${sku}::${pageSize}::${currentPage}`;
  if (!force && summaryCache.has(cacheKey)) {
    return summaryCache.get(cacheKey);
  }

  const data = await meshGetRatings(sku, { page: currentPage, limit: pageSize });
  const items = (data.reviews || []).map(normalizeMeshReview);
  const payload = {
    items,
    page_info: {
      current_page: data.pagination?.page ?? currentPage,
      page_size: data.pagination?.limit ?? pageSize,
      total_pages: data.pagination?.totalPages ?? 0,
    },
    averageRating: data.averageRating != null ? Number(data.averageRating) : null,
    reviewCount: data.reviewCount ?? items.length,
  };

  summaryCache.set(cacheKey, payload);
  return payload;
}

export function invalidateProductReviewCache(sku) {
  [...summaryCache.keys()].forEach((key) => {
    if (key.startsWith(`${sku}::`)) {
      summaryCache.delete(key);
    }
  });
}

/**
 * @param {{
 *   sku: string;
 *   nickname: string;
 *   text: string;
 *   title?: string;
 *   summary?: string;
 *   stars: number;
 * }} input
 */
export async function createProductReview(input) {
  const base = getReviewsApiBase();
  if (!base) {
    throw new Error('Product reviews API is not configured.');
  }

  const title = (input.title || input.summary || '').trim().slice(0, 255)
    || 'Product review';
  const rating = Math.min(5, Math.max(1, Math.round(input.stars)));

  const response = await fetch(`${base}/create-review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getMeshRequestHeaders(),
    },
    body: JSON.stringify({
      sku: input.sku,
      author: input.nickname.trim(),
      title,
      review: input.text.trim(),
      rating,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Could not submit review (${response.status})`);
  }

  invalidateProductReviewCache(input.sku);
  return normalizeMeshReview(data.review);
}

/**
 * @param {string} sku
 */
export async function fetchProductReviewSummary(sku) {
  const data = await fetchProductReviews(sku, { pageSize: 20, currentPage: 1 });
  const items = data?.items ?? [];
  const reviewCount = data.reviewCount ?? items.length;
  const summary = summarizeReviewItems(items, data.averageRating, reviewCount);
  return {
    count: reviewCount,
    stars: summary.stars,
    hasReviews: reviewCount > 0,
  };
}
