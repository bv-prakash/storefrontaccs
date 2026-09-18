import { getRootPath } from '@dropins/tools/lib/aem/configs.js';
import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  sampleRUM,
} from './aem.js';
import {
  loadCommerceEager,
  loadCommerceLazy,
  initializeCommerce,
  applyTemplates,
  decorateLinks,
  getLocaleRootPath,
  loadErrorPage,
  decorateSections,
  IS_UE,
  IS_DA,
} from './commerce.js';

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    if (h1.closest('.hero, .home-slider') || picture.closest('.hero, .home-slider') || h1.closest('div[class]') || picture.closest('div[class]')) {
      return;
    }
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  const styles = [
    'font.css',
    'icomoon.css',
  ];

  const results = await Promise.allSettled(
    styles.map((file) => loadCSS(`${window.hlx.codeBasePath}/styles/${file}`)),
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`Failed to load ${styles[index]}`, result.reason);
    }
  });

  try {
    if (!window.location.hostname.includes('localhost')) {
      sessionStorage.setItem('fonts-loaded', 'true');
    }
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }

    if (!main.querySelector('.hero')) buildHeroBlock(main);
  } catch (error) {
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    // quick structural checks
    if (a.querySelector('img') || p.textContent.trim() !== text) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // require authored formatting for buttonization
    const strong = a.closest('strong');
    const em = a.closest('em');
    if (!strong && !em) return;

    p.className = 'button-wrapper';
    a.className = 'button';
    if (strong && em) { // high-impact call-to-action
      a.classList.add('accent');
      const outer = strong.contains(em) ? strong : em;
      outer.replaceWith(a);
    } else if (strong) {
      a.classList.add('primary');
      strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      em.replaceWith(a);
    }
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
export function decorateMain(main) {
  decorateLinks(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
}
function createGlobalBreadcrumbsContainer(doc = document) {
  const rootPath = getRootPath().replace(/\/$/, '') || '/';
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';

  // 1. Exit early if on the home page
  if (pathname === rootPath) return null;

  const header = doc.querySelector('header');
  if (!header) return null;

  const isPlpPage = pathname.startsWith('/categories/');

  // 2. Select existing container based on page type
  let container = isPlpPage
    ? doc.querySelector('.category-banner-wrapper')
    : doc.querySelector('.breadcrumbs-container');

  // 3. Only create and construct DOM elements if container doesn't exist yet
  if (!container) {
    if (isPlpPage) {
      container = document.createElement('div');
      container.className = 'category-banner-wrapper';

      const breadcrumbsEl = document.createElement('div');
      breadcrumbsEl.className = 'breadcrumbs-container';

      const pageTitleEl = document.createElement('h1');
      pageTitleEl.className = 'page-title';

      container.appendChild(pageTitleEl);
      container.appendChild(breadcrumbsEl);
    } else {
      container = document.createElement('div');
      container.className = 'breadcrumbs-container';
    }

    // Insert newly created container directly after header
    header.insertAdjacentElement('afterend', container);
  }

  return container;
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  // Reflect the active locale on the <html> element (e.g. "fr" for /fr pages)
  const localeRoot = getLocaleRootPath();
  document.documentElement.lang = localeRoot ? localeRoot.slice(1) : 'en';
  decorateTemplateAndTheme();
  createGlobalBreadcrumbsContainer(doc);

  const main = doc.querySelector('main');
  if (main) {
    try {
      await initializeCommerce();
      decorateMain(main);
      applyTemplates(doc);
      await loadCommerceEager();
    } catch (e) {
      console.error('Error initializing commerce configuration:', e);
      loadErrorPage(418);
    }
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCommerceLazy();

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

/**
 * Fetches the template page of a commerce folder ("categories" or "products")
 * for the active store and returns it as a parsed document.
 *
 * The localized template (e.g. "/fr/categories/default") is preferred and the
 * default-store template is used as a fallback, so a store view renders even
 * when it does not have a template of its own. The whole document is fetched
 * (rather than just ".plain.html") so its metadata can be reused when the
 * template is rendered in place.
 *
 * @param {string} localeRoot The active locale root ("" or "/fr", ...)
 * @param {string} folder The commerce folder ("categories" or "products")
 * @returns {Promise<{path: string, doc: Document}|null>} The template page, or
 * null when none of the candidates could be fetched
 */
async function fetchCommerceTemplate(localeRoot, folder) {
  const candidates = [...new Set([`${localeRoot}/${folder}/default`, `/${folder}/default`])];

  const tryCandidate = async (index) => {
    if (index >= candidates.length) return null;

    const path = candidates[index];
    try {
      const response = await fetch(path);
      if (response.ok) {
        const html = await response.text();
        return { path, doc: new DOMParser().parseFromString(html, 'text/html') };
      }
    } catch {
      // try the next candidate
    }
    return tryCandidate(index + 1);
  };

  return tryCandidate(0);
}

/**
 * Meta values the error shell sets for every 404 page ("Page not found"), which
 * must always be replaced by the rendered page instead of being kept.
 */
const ERROR_PAGE_META_KEYS = new Set([
  'og:title',
  'twitter:title',
  'og:description',
  'description',
  'twitter:description',
]);

/**
 * Creates or updates a meta tag in the document head.
 * @param {string} attr The meta attribute to use ("name" or "property")
 * @param {string} key The name/property of the meta tag
 * @param {string} content The value to set
 */
function setHeadMeta(attr, key, content) {
  let meta = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

/**
 * Aligns the document metadata with the template page that is rendered in
 * place, so the result matches what the delivery layer serves at a deep URL:
 * URL specific tags describe the deep URL that stays in the address bar, the
 * error shell's values are replaced and missing template metadata is copied.
 * @param {Document} templateDoc The parsed template page
 */
function syncHeadFromTemplate(templateDoc) {
  const currentUrl = `${window.location.origin}${window.location.pathname}`;

  const templateTitle = templateDoc.querySelector('title')?.textContent;
  if (templateTitle) document.title = templateTitle;

  setHeadMeta('property', 'og:url', currentUrl);
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = currentUrl;

  templateDoc.head.querySelectorAll('meta').forEach((meta) => {
    const attr = ['name', 'property'].find((name) => meta.hasAttribute(name));
    if (!attr) return;

    const key = meta.getAttribute(attr);
    // og:url is handled above, it must describe the requested URL
    if (!key || key === 'og:url') return;

    if (ERROR_PAGE_META_KEYS.has(key)) {
      setHeadMeta(attr, key, meta.getAttribute('content'));
    } else if (!document.head.querySelector(`meta[${attr}="${key}"]`)) {
      document.head.appendChild(meta.cloneNode(true));
    }
  });
}

/**
 * Renders a commerce template page in place of the error shell that is
 * currently displayed. The address bar is left untouched, so the deep link -
 * and therefore the SKU/category that is read from the path - keeps working,
 * while the template markup is handed over to the regular decoration pipeline.
 * @param {{path: string, doc: Document}} template The template to render
 * @returns {boolean} true when the template could be rendered in place
 */
function renderCommerceTemplateInPlace(template) {
  const currentMain = document.querySelector('main');
  const templateMain = template.doc.querySelector('main');
  if (!currentMain || !templateMain) return false;

  // Relative media ("media_...") has to resolve against the template page
  const resetMediaBase = (tag, attr) => {
    templateMain.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
      elem[attr] = new URL(elem.getAttribute(attr), new URL(template.path, window.location)).href;
    });
  };
  resetMediaBase('img', 'src');
  resetMediaBase('source', 'srcset');

  currentMain.replaceWith(document.importNode(templateMain, true));
  template.doc.body.classList.forEach((name) => document.body.classList.add(name));
  syncHeadFromTemplate(template.doc);

  // The document now holds real content, so it must not be handled as an error
  // page any more (e.g. it should not be reported as a 404 in RUM).
  window.isErrorPage = false;
  return true;
}

async function loadPage() {
  const { pathname, search } = window.location;
  const localeRoot = getLocaleRootPath();

  // Deep commerce links (categories + products) are served by the delivery
  // layer at the deep URL itself (HTTP 200) as soon as the store's folder
  // mapping is registered, in which case there is nothing to do here. When the
  // delivery layer cannot resolve the URL, the 404 shell is served instead
  // (window.isErrorPage): render the store's template page in place so the
  // product listing/product details appear in the same page view - no 404
  // screen, no extra navigation and the deep link (hence the SKU) is preserved.
  // The client-side redirect with the ?cp= param below is only used as a last
  // resort when the template markup cannot be rendered in place.
  const folderMatch = /^\/(categories|products)\//.exec(pathname.slice(localeRoot.length));
  if (window.isErrorPage && folderMatch) {
    const [, folder] = folderMatch;
    let pendingRedirect = `${localeRoot}/${folder}/default`;

    try {
      const template = await fetchCommerceTemplate(localeRoot, folder);
      if (template) {
        pendingRedirect = template.path;
        // The template markup replaces the error shell in the same page view
        if (renderCommerceTemplateInPlace(template)) pendingRedirect = null;
      }
    } catch {
      // Fall through to the redirect (or the error content) below
    }

    if (pendingRedirect && pathname !== pendingRedirect) {
      // Last resort when the template cannot be rendered in place: send the
      // visitor to the store's template page, deep link kept in the ?cp= param.
      window.location.replace(`${pendingRedirect}?cp=${encodeURIComponent(pathname + search)}`);
      return;
    }

    if (window.isErrorPage) {
      // Nothing could be rendered in place or reached: show the error content
      // that the error shell hides for commerce URLs.
      document.querySelector('main.error')?.style.setProperty('display', 'block', 'important');
    }
  }

  // Whatever is still flagged as an error page is a genuine 404: report it from
  // here (instead of from the error shell) so deep commerce links that were
  // rendered in place above are not counted as 404s in RUM.
  if (window.isErrorPage) {
    sampleRUM('404', { source: document.referrer });
  }

  // Keep parameter restoration for legacy bookmarks/backwards compatibility
  if (search.includes('cp=')
    && /^\/(categories|products)\/default$/.test(pathname.slice(localeRoot.length))) {
    const urlParams = new URLSearchParams(search);
    const cp = urlParams.get('cp');
    if (cp) {
      const restored = new URL(decodeURIComponent(cp), window.location.origin);
      window.history.replaceState({}, '', `${restored.pathname}${restored.search}`);
    }
  }

  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

// UE Editor support before page load
if (IS_UE) {
  // eslint-disable-next-line import/no-unresolved
  await import(`${window.hlx.codeBasePath}/scripts/ue.js`).then(({ default: ue }) => ue());
}

loadPage();

(async function loadDa() {
  if (!IS_DA) return;
  // eslint-disable-next-line import/no-unresolved
  import('https://da.live/scripts/dapreview.js').then(({ default: daPreview }) => daPreview(loadPage));
}());
