import {
  averageRatingToStars,
  createProductReview,
  fetchProductReviewSummary,
  fetchProductReviews,
  summarizeReviewItems,
} from '../../product-reviews.js';

const plpSummaryCache = new Map();
const REVIEWS_LIST_PAGE_SIZE = 5;
const REVIEWS_BREAKDOWN_FETCH_LIMIT = 100;

function formatReviewsLabel(count) {
  const total = Number(count) || 0;
  if (total <= 0) return '';
  return total === 1 ? '1 Review' : `${total} Reviews`;
}

/**
 * Stars + "N Review(s)" for PDP / PLP.
 * @param {{ stars: number, count: number, size?: 'xs'|'sm'|'md'|'lg' }} options
 */
function createReviewRatingSummary({ stars, count, size = 'sm' }) {
  const row = document.createElement('div');
  row.className = 'product-reviews__rating-summary';
  row.append(createStarRatingElement(stars, { size }));

  const reviewsLabel = formatReviewsLabel(count);
  if (reviewsLabel) {
    const text = document.createElement('span');
    text.className = 'product-reviews__rating-summary-text product-reviews__reviews-link';
    text.textContent = reviewsLabel;
    row.append(text);
  }

  return row;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {number} stars 0–5 (supports halves, e.g. 4.5)
 * @param {{ size?: 'xs'|'sm'|'md'|'lg', label?: string }} [options]
 */
function roundToHalfStar(value) {
  return Math.round(Math.min(5, Math.max(0, Number(value) || 0)) * 2) / 2;
}

/** Lucide-style star (see icons/star.svg). */
const STAR_ICON_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z';

/**
 * @param {{ filled?: boolean }} [options]
 * @returns {SVGElement}
 */
function createStarSvg({ filled = false } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('product-reviews__star-svg');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');

  if (filled) {
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('stroke', 'currentColor');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
  }
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', STAR_ICON_PATH);
  svg.append(path);
  return svg;
}

function appendStarGlyph(container, state) {
  if (state === 'half') {
    const half = document.createElement('span');
    half.className = 'product-reviews__star-half';
    half.setAttribute('aria-hidden', 'true');

    const empty = document.createElement('span');
    empty.className = 'product-reviews__star-half-bg';
    empty.append(createStarSvg({ filled: false }));

    const fillWrap = document.createElement('span');
    fillWrap.className = 'product-reviews__star-half-fill-wrap';

    const fill = document.createElement('span');
    fill.className = 'product-reviews__star-half-fill';
    fill.append(createStarSvg({ filled: true }));

    fillWrap.append(fill);
    half.append(empty, fillWrap);
    container.append(half);
    return;
  }

  const star = document.createElement('span');
  star.className = 'product-reviews__star';
  star.setAttribute('aria-hidden', 'true');
  if (state === 'full') {
    star.classList.add('is-filled');
  } else {
    star.classList.add('is-empty');
  }
  star.append(createStarSvg({ filled: state === 'full' }));
  container.append(star);
}

function applyStarSvgFill(svg, filled) {
  if (filled) {
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('stroke', 'currentColor');
  } else {
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
  }
}

function setStarInputButtonState(btn, active) {
  btn.classList.toggle('is-active', active);
  let svg = btn.querySelector('.product-reviews__star-svg');
  if (!svg) {
    svg = createStarSvg({ filled: active });
    btn.append(svg);
  } else {
    applyStarSvgFill(svg, active);
  }
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function createStarRatingElement(stars, options = {}) {
  const { size = 'md', label } = options;
  const clamped = roundToHalfStar(stars);
  const ariaLabel = label || `${clamped} out of 5 stars`;

  const root = document.createElement('div');
  root.className = `product-reviews__stars product-reviews__stars--${size}`;
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', ariaLabel);

  for (let index = 1; index <= 5; index += 1) {
    let state = 'empty';
    if (clamped >= index) {
      state = 'full';
    } else if (clamped >= index - 0.5) {
      state = 'half';
    }
    appendStarGlyph(root, state);
  }

  return root;
}

function createInteractiveStars(initialValue = 0) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'product-reviews__star-input';
  fieldset.innerHTML = '<legend class="product-reviews__star-input-legend">Your rating</legend>';

  let selected = initialValue;
  let hoverValue = 0;
  const buttons = [];

  const paintStars = (value) => {
    const level = Math.max(0, Math.min(5, Number(value) || 0));
    buttons.forEach((starBtn) => {
      setStarInputButtonState(starBtn, Number(starBtn.dataset.value) <= level);
    });
  };

  const clearHoverStyles = () => {
    buttons.forEach((starBtn) => starBtn.classList.remove('is-hover'));
  };

  const showDisplay = () => {
    paintStars(hoverValue > 0 ? hoverValue : selected);
  };

  const setStarValue = (value) => {
    selected = Math.max(0, Math.min(5, Number(value) || 0));
    hoverValue = 0;
    clearHoverStyles();
    paintStars(selected);
  };

  const handleStarPointer = (btn) => {
    hoverValue = Number(btn.dataset.value);
    showDisplay();
    buttons.forEach((starBtn) => {
      starBtn.classList.toggle('is-hover', starBtn === btn);
    });
  };

  fieldset.addEventListener('pointerleave', () => {
    hoverValue = 0;
    clearHoverStyles();
    paintStars(selected);
  });

  fieldset.addEventListener('focusin', (event) => {
    const btn = event.target.closest('.product-reviews__star-input-btn');
    if (!btn || !fieldset.contains(btn)) return;
    handleStarPointer(btn);
  });

  fieldset.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (next instanceof Node && fieldset.contains(next)) return;
    hoverValue = 0;
    clearHoverStyles();
    paintStars(selected);
  });

  for (let value = 1; value <= 5; value += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'product-reviews__star-input-btn';
    btn.dataset.value = String(value);
    btn.setAttribute('aria-label', `${value} star${value > 1 ? 's' : ''}`);
    setStarInputButtonState(btn, false);
    btn.addEventListener('pointerenter', (event) => {
      handleStarPointer(event.currentTarget);
    });
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      setStarValue(Number(event.currentTarget.dataset.value));
    });
    buttons.push(btn);
    fieldset.appendChild(btn);
  }

  paintStars(selected);

  fieldset.getValue = () => selected;
  fieldset.resetStars = () => setStarValue(0);
  return fieldset;
}

export function activateProductReviewsTab() {
  const tabsWrapper = document.querySelector(
    '.product-details .product-details__tabs-wrapper',
  );
  if (!tabsWrapper) return;

  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  if (isDesktop) {
    const tabBtn = tabsWrapper.querySelector('.pdp-tab-btn[data-tab="reviews"]');
    tabBtn?.click();
    return;
  }

  const accordion = tabsWrapper.querySelector('.pdp-accordion-header[data-tab="reviews"]');
  if (accordion && !accordion.classList.contains('active')) {
    accordion.click();
  }
}

function syncWriteCtaExpanded(formId = 'product-review-form') {
  const open = document.getElementById(formId)?.classList.contains('product-reviews__form--open');
  document.querySelectorAll('.product-reviews__write-cta').forEach((btn) => {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function closeReviewForm(formId = 'product-review-form') {
  document.getElementById(formId)?.classList.remove('product-reviews__form--open');
  syncWriteCtaExpanded(formId);
}

function scrollToReviewsSection() {
  activateProductReviewsTab();
  window.setTimeout(() => {
    const section = document.getElementById('product-reviews');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 180);
}

function toggleReviewForm(formId = 'product-review-form') {
  activateProductReviewsTab();
  window.setTimeout(() => {
    const target = document.getElementById(formId);
    if (!target) return;

    if (target.classList.contains('product-reviews__form--open')) {
      closeReviewForm(formId);
      return;
    }

    target.classList.add('product-reviews__form--open');
    syncWriteCtaExpanded(formId);
    window.setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const firstField = target.querySelector('.product-reviews__star-input-btn, input, textarea');
      if (firstField instanceof HTMLElement) {
        firstField.focus({ preventScroll: true });
      }
    }, 320);
  }, 180);
}

function bindReviewFormTabBehavior(formId = 'product-review-form') {
  const block = document.querySelector('.product-details');
  if (!block || block.dataset.reviewFormTabsBound) return;
  block.dataset.reviewFormTabsBound = 'true';

  block.addEventListener('click', (event) => {
    const tab = event.target.closest('.pdp-tab-btn, .pdp-accordion-header');
    if (tab && tab.getAttribute('data-tab') !== 'reviews') {
      closeReviewForm(formId);
    }
  });
}

/**
 * Compact teaser: stars or “Be the first reviewer” — scrolls to review form.
 * @param {HTMLElement} container
 * @param {string} sku
 * @param {{ labels?: Record<string, string>, formId?: string }} [options]
 */
export async function renderProductReviewTeaser(container, sku, options = {}) {
  if (!container || !sku) return;

  const { labels = {}, formId = 'product-review-form' } = options;
  const renderId = String(Number(container.dataset.teaserRenderId || 0) + 1);
  container.dataset.teaserRenderId = renderId;
  container.classList.add('product-reviews__teaser');
  container.innerHTML = '';

  try {
    const summary = await fetchProductReviewSummary(sku);
    if (container.dataset.teaserRenderId !== renderId) {
      return;
    }
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'product-reviews__teaser-action';

    if (summary.hasReviews) {
      action.classList.add('product-reviews__teaser-action--rated');
      action.append(createReviewRatingSummary({
        stars: summary.stars,
        count: summary.count,
        size: 'lg',
      }));
      action.addEventListener('click', () => scrollToReviewsSection());
      action.setAttribute(
        'aria-label',
        labels.viewReviews || `View ${formatReviewsLabel(summary.count)}`,
      );
    } else {
      action.textContent = labels.beFirstReviewer || 'Be the first reviewer';
      action.classList.add('product-reviews__teaser-action--first');
      action.addEventListener('click', () => toggleReviewForm(formId));
    }

    container.append(action);
  } catch {
    container.hidden = true;
  }
}

function getReviewerInitial(name) {
  const trimmed = String(name || 'A').trim();
  return trimmed.charAt(0).toUpperCase() || 'A';
}

function buildRatingBreakdown(items) {
  const counts = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  };
  items.forEach((item) => {
    const stars = Math.round(averageRatingToStars(item.rating ?? item.average_rating));
    if (stars >= 1 && stars <= 5) {
      counts[stars] += 1;
    }
  });
  const total = items.length || 0;
  return [5, 4, 3, 2, 1].map((level) => ({
    level,
    count: counts[level],
    percent: total ? (counts[level] / total) * 100 : 0,
  }));
}

function renderRatingBreakdown(items) {
  const breakdown = document.createElement('div');
  breakdown.className = 'product-reviews__breakdown';
  breakdown.setAttribute('aria-label', 'Rating breakdown');

  buildRatingBreakdown(items).forEach(({ level, count, percent }) => {
    const row = document.createElement('div');
    row.className = 'product-reviews__breakdown-row';

    const starsCell = document.createElement('div');
    starsCell.className = 'product-reviews__breakdown-stars';
    starsCell.append(createStarRatingElement(level, { size: 'sm' }));

    const countCell = document.createElement('span');
    countCell.className = 'product-reviews__breakdown-count';
    countCell.textContent = `(${count})`;

    const barCell = document.createElement('div');
    barCell.className = 'product-reviews__breakdown-bar';
    const fill = document.createElement('span');
    fill.style.width = `${percent}%`;
    barCell.append(fill);

    row.append(starsCell, countCell, barCell);
    breakdown.append(row);
  });

  return breakdown;
}

function renderReviewHero(stars, count, items, labels) {
  const hero = document.createElement('div');
  hero.className = 'product-reviews__hero product-reviews__hero--rating-overview';
  hero.setAttribute('role', 'region');
  hero.setAttribute('aria-label', labels.reviewsHeading || 'Customer rating overview');

  const score = document.createElement('div');
  score.className = 'product-reviews__hero-score';
  score.append(createStarRatingElement(stars, { size: 'lg' }));
  const countText = document.createElement('p');
  countText.className = 'product-reviews__hero-count';
  countText.textContent = count ? formatReviewsLabel(count) : '0 Reviews';
  score.append(countText);

  const breakdownWrap = document.createElement('div');
  breakdownWrap.className = 'product-reviews__hero-breakdown';
  breakdownWrap.append(renderRatingBreakdown(items));

  const summaryWrap = document.createElement('div');
  summaryWrap.className = 'product-reviews__hero-summary';
  summaryWrap.append(score, breakdownWrap);

  const ctaWrap = document.createElement('div');
  ctaWrap.className = 'product-reviews__hero-cta';
  const writeBtn = document.createElement('button');
  writeBtn.type = 'button';
  writeBtn.className = 'product-reviews__write-cta';
  writeBtn.textContent = labels.writeReviewCta || labels.writeReview || 'Write a Review';
  writeBtn.setAttribute('aria-expanded', 'false');
  writeBtn.setAttribute('aria-controls', 'product-review-form');
  writeBtn.addEventListener('click', () => toggleReviewForm());
  ctaWrap.append(writeBtn);

  hero.append(summaryWrap, ctaWrap);
  return hero;
}

function renderReviewListItem(review) {
  const item = document.createElement('article');
  item.className = 'product-reviews__item';

  const authorName = review.nickname || 'Anonymous';
  const stars = averageRatingToStars(review.average_rating ?? review.rating);

  const inner = document.createElement('div');
  inner.className = 'product-reviews__item-inner';

  const avatar = document.createElement('div');
  avatar.className = 'product-reviews__item-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = getReviewerInitial(authorName);

  const body = document.createElement('div');
  body.className = 'product-reviews__item-body';

  const author = document.createElement('p');
  author.className = 'product-reviews__item-author';
  author.textContent = authorName;

  const ratingRow = document.createElement('div');
  ratingRow.className = 'product-reviews__item-rating';
  ratingRow.append(
    createStarRatingElement(stars, { size: 'md', label: `${stars} stars` }),
  );

  body.append(author, ratingRow);

  if (review.summary) {
    const title = document.createElement('h4');
    title.className = 'product-reviews__item-title';
    title.textContent = review.summary;
    body.append(title);
  }

  const text = document.createElement('p');
  text.className = 'product-reviews__item-text';
  text.textContent = review.text || '';
  body.append(text);

  if (review.created_at) {
    const date = document.createElement('time');
    date.className = 'product-reviews__item-date';
    date.dateTime = review.created_at;
    date.textContent = review.created_at;
    body.append(date);
  }

  inner.append(avatar, body);
  item.append(inner);
  return item;
}

function getReviewListTotalPages(reviewCount, pageInfo) {
  const fromApi = Number(pageInfo?.total_pages);
  if (fromApi > 0) return fromApi;
  return Math.max(1, Math.ceil(reviewCount / REVIEWS_LIST_PAGE_SIZE));
}

function renderReviewPagination({
  currentPage, totalPages, onPageChange, labels,
}) {
  if (totalPages <= 1) return null;

  const nav = document.createElement('nav');
  nav.className = 'product-reviews__pagination';
  nav.setAttribute('aria-label', labels.reviewsPagination || 'Reviews pagination');

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'product-reviews__pagination-btn';
  prev.textContent = labels.reviewsPrevious || 'Previous';
  prev.disabled = currentPage <= 1;
  prev.addEventListener('click', () => onPageChange(currentPage - 1));

  const status = document.createElement('span');
  status.className = 'product-reviews__pagination-status';
  status.textContent = (labels.reviewsPageOf || 'Page {current} of {total}')
    .replace('{current}', String(currentPage))
    .replace('{total}', String(totalPages));

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'product-reviews__pagination-btn';
  next.textContent = labels.reviewsNext || 'Next';
  next.disabled = currentPage >= totalPages;
  next.addEventListener('click', () => onPageChange(currentPage + 1));

  nav.append(prev, status, next);
  return nav;
}

/**
 * Full PDP block: summary, submit form, review list.
 * @param {HTMLElement} container
 * @param {string} sku
 * @param {{ labels?: Record<string, string> }} [options]
 */
export async function mountProductReviewsSection(container, sku, options = {}) {
  if (!container || !sku) return;

  if (container.dataset.mountedSku === sku) {
    return;
  }
  container.dataset.mountedSku = sku;

  const labels = options.labels || {};
  container.classList.add('product-reviews');
  container.id = 'product-reviews';
  container.innerHTML = `
    <div class="product-reviews__panel-inner">
    <h2 class="product-reviews__heading">${labels.reviewsHeading || 'Review'}</h2>
    <div class="product-reviews__hero-mount" data-ref="hero"></div>
    <form class="product-reviews__form" id="product-review-form" data-ref="form" novalidate>
      <div class="product-reviews__form-inner">
        <h3 class="product-reviews__form-heading">${labels.writeReview || 'Write a review'}</h3>
        <div class="product-reviews__form-status" data-ref="status" role="status"></div>
        <div data-ref="star-input"></div>
        <label class="product-reviews__field">
          <span>${labels.author || 'Your name'}</span>
          <input name="nickname" type="text" required maxlength="128" autocomplete="name" />
        </label>
        <label class="product-reviews__field">
          <span>${labels.reviewTitle || 'Review title'}</span>
          <input name="title" type="text" required maxlength="255" autocomplete="off" />
        </label>
        <label class="product-reviews__field">
          <span>${labels.review || 'Your review'}</span>
          <textarea name="text" rows="5" required maxlength="2000"></textarea>
        </label>
        <button type="submit" class="product-reviews__submit">${labels.submitReview || 'Submit review'}</button>
      </div>
    </form>
    <div class="product-reviews__list-section">
      <h3 class="product-reviews__list-heading" data-ref="list-heading"></h3>
      <div class="product-reviews__list" data-ref="list" aria-live="polite"></div>
      <div class="product-reviews__pagination-mount" data-ref="pagination"></div>
    </div>
    </div>
  `;

  let $heroRegion = container.querySelector('[data-ref="hero"]');
  const $listHeading = container.querySelector('[data-ref="list-heading"]');
  const $list = container.querySelector('[data-ref="list"]');
  const $pagination = container.querySelector('[data-ref="pagination"]');
  const $form = container.querySelector('[data-ref="form"]');
  const $status = container.querySelector('[data-ref="status"]');
  const $starMount = container.querySelector('[data-ref="star-input"]');

  const starInput = createInteractiveStars(0);
  $starMount.append(starInput);
  bindReviewFormTabBehavior();

  let currentReviewPage = 1;
  let reviewCountTotal = 0;

  async function refreshReviewHero() {
    const payload = await fetchProductReviews(sku, {
      pageSize: REVIEWS_BREAKDOWN_FETCH_LIMIT,
      currentPage: 1,
      force: true,
    });
    const items = payload?.items ?? [];
    reviewCountTotal = payload.reviewCount ?? items.length;
    const { stars } = reviewCountTotal
      ? summarizeReviewItems(items, payload.averageRating, reviewCountTotal)
      : { stars: 0 };

    const heroEl = renderReviewHero(stars, reviewCountTotal, items, labels);
    heroEl.dataset.ref = 'hero';
    $heroRegion.replaceWith(heroEl);
    $heroRegion = heroEl;
    syncWriteCtaExpanded();

    const listTitle = labels.reviewsListHeading || 'Reviews';
    $listHeading.textContent = `${listTitle.toUpperCase()} (${reviewCountTotal})`;
  }

  async function loadReviewListPage(page) {
    const payload = await fetchProductReviews(sku, {
      pageSize: REVIEWS_LIST_PAGE_SIZE,
      currentPage: page,
      force: true,
    });
    const items = payload?.items ?? [];
    const reviewCount = payload.reviewCount ?? reviewCountTotal ?? items.length;
    const totalPages = getReviewListTotalPages(reviewCount, payload.page_info);

    currentReviewPage = Math.min(Math.max(1, page), totalPages);

    $list.innerHTML = '';
    items.forEach((review) => {
      $list.append(renderReviewListItem(review));
    });

    $pagination.replaceChildren();
    const paginationNav = renderReviewPagination({
      currentPage: currentReviewPage,
      totalPages,
      labels,
      onPageChange: async (nextPage) => {
        await loadReviewListPage(nextPage);
        $listHeading.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      },
    });
    if (paginationNav) {
      $pagination.append(paginationNav);
    }
  }

  async function refreshReviews() {
    currentReviewPage = 1;
    await refreshReviewHero();
    await loadReviewListPage(1);
  }

  $form.addEventListener('submit', async (event) => {
    event.preventDefault();
    $status.textContent = '';

    const formData = new FormData($form);
    const nickname = String(formData.get('nickname') || '').trim();
    const title = String(formData.get('title') || '').trim();
    const text = String(formData.get('text') || '').trim();
    const stars = starInput.getValue() || 0;

    if (!stars) {
      $status.textContent = labels.ratingRequired || 'Please select a star rating.';
      return;
    }
    if (!nickname || !title || !text) {
      $status.textContent = labels.fieldsRequired || 'Please fill in all fields.';
      return;
    }

    const submitBtn = $form.querySelector('.product-reviews__submit');
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = true;
    }

    try {
      await createProductReview({
        sku, nickname, title, text, stars,
      });
      plpSummaryCache.delete(sku);
      $status.textContent = labels.reviewSubmitted || 'Thank you. Your review was submitted for approval.';
      $form.reset();
      starInput.resetStars?.();
      await refreshReviews();

      const teaser = document.querySelector('.product-details .product-reviews__teaser');
      if (teaser) {
        teaser.dataset.teaserRenderId = '0';
        await renderProductReviewTeaser(teaser, sku, { labels, formId: 'product-review-form' });
      }
    } catch (error) {
      $status.textContent = error.message || labels.reviewError || 'Could not submit your review.';
    } finally {
      if (submitBtn instanceof HTMLButtonElement) {
        submitBtn.disabled = false;
      }
    }
  });

  try {
    await refreshReviews();
  } catch {
    $list.innerHTML = `<p class="product-reviews__error">${escapeHtml(labels.reviewsUnavailable || 'Reviews are unavailable right now.')}</p>`;
  }
}

function applyPlpReviewRating(container, summary) {
  if (!summary.hasReviews) {
    container.remove();
    return;
  }
  container.className = 'product-reviews__plp-rating';
  container.replaceChildren(createReviewRatingSummary({
    stars: summary.stars,
    count: summary.count,
    size: 'md',
  }));
}

/** PLP card rating (only when reviews exist). */
export async function renderPlpProductReviewRating(container, sku) {
  if (!container || !sku) return;

  const cached = plpSummaryCache.get(sku);
  if (cached) {
    applyPlpReviewRating(container, cached);
    return;
  }

  try {
    const summary = await fetchProductReviewSummary(sku);
    plpSummaryCache.set(sku, summary);
    if (!container.isConnected) return;
    applyPlpReviewRating(container, summary);
  } catch {
    if (container.isConnected) container.remove();
  }
}
