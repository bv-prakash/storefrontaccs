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
  resetMediaBasePaths,
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

const COMMERCE_FOLDERS = ['categories', 'products'];
const COMMERCE_FOLDER_RE = new RegExp(`^/(${COMMERCE_FOLDERS.join('|')})/`);
const COMMERCE_TEMPLATE_RE = new RegExp(`^/(${COMMERCE_FOLDERS.join('|')})/default$`);

function getLocaleRelativePath() {
  return window.location.pathname.slice(getLocaleRootPath().length);
}

/**
 * Fetches the template page of a commerce folder for the active store,
 * preferring the localized one (e.g. "/fr/products/default").
 */
async function fetchCommerceTemplate(localeRoot, folder) {
  const paths = [...new Set([`${localeRoot}/${folder}/default`, `/${folder}/default`])];
  const tryFetch = async (index) => {
    if (index >= paths.length) return null;
    const path = paths[index];
    try {
      const response = await fetch(path);
      if (response.ok) {
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        return { path, doc };
      }
    } catch {
      // try the next candidate
    }
    return tryFetch(index + 1);
  };
  return tryFetch(0);
}

/**
 * Returns an element in the document head, creating it when missing.
 * @param {string} selector The selector of the element
 * @param {() => Element} create Factory for a missing element
 * @returns {Element} The existing or newly created element
 */
function upsertHeadElement(selector, create) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  return element;
}

/**
 * Sets a meta tag in the document head, replacing any existing value.
 * @param {string} attr The meta attribute ("name" or "property")
 * @param {string} key The meta key
 * @param {string} content The value to set
 */
function setHeadMeta(attr, key, content) {
  upsertHeadElement(`meta[${attr}="${key}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute(attr, key);
    return meta;
  }).setAttribute('content', content);
}

/**
 * Applies the template page metadata to the current document: the title and
 * the template meta tags win over the error shell values, while URL-specific
 * tags describe the deep URL that stays in the address bar.
 * @param {Document} templateDoc The parsed template page
 */
function syncHeadFromTemplate(templateDoc) {
  const currentUrl = `${window.location.origin}${window.location.pathname}`;

  const templateTitle = templateDoc.querySelector('title')?.textContent;
  if (templateTitle) document.title = templateTitle;

  upsertHeadElement('link[rel="canonical"]', () => {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    return canonical;
  }).href = currentUrl;
  setHeadMeta('property', 'og:url', currentUrl);

  templateDoc.head.querySelectorAll('meta').forEach((meta) => {
    const attr = ['name', 'property'].find((name) => meta.hasAttribute(name));
    const key = attr && meta.getAttribute(attr);
    const content = meta.getAttribute('content');
    // og:url is handled above, it must describe the requested URL
    if (!key || key === 'og:url' || content === null) return;
    setHeadMeta(attr, key, content);
  });
}

/**
 * Renders a commerce template page in place of the error shell. The address
 * bar is left untouched, so the deep link - and the SKU/category read from
 * the path - keeps working.
 * @param {{path: string, doc: Document}} template The template to render
 * @returns {boolean} true when the template could be rendered in place
 */
function renderCommerceTemplateInPlace(template) {
  const currentMain = document.querySelector('main');
  const templateMain = template.doc.querySelector('main');
  if (!currentMain || !templateMain) return false;

  resetMediaBasePaths(templateMain, template.path);
  currentMain.replaceWith(document.importNode(templateMain, true));
  syncHeadFromTemplate(template.doc);

  // The document now holds real content and must not be handled as an error page.
  window.isErrorPage = false;
  return true;
}

async function loadPage() {
  const { pathname, search } = window.location;
  const localeRoot = getLocaleRootPath();
  const relativePath = getLocaleRelativePath();

  // Commerce deep links the delivery layer cannot resolve are served as the
  // 404 shell (window.isErrorPage): render the store template in place so the
  // listing/details appear with no 404 screen and no extra navigation.
  const folderMatch = COMMERCE_FOLDER_RE.exec(relativePath);
  if (window.isErrorPage && folderMatch) {
    const [, folder] = folderMatch;
    let pendingRedirect = `${localeRoot}/${folder}/default`;

    try {
      const template = await fetchCommerceTemplate(localeRoot, folder);
      if (template) {
        pendingRedirect = template.path;
        if (renderCommerceTemplateInPlace(template)) pendingRedirect = null;
      }
    } catch {
      // Fall through to the redirect below
    }

    if (pendingRedirect && pathname !== pendingRedirect) {
      // Last resort when the template cannot be rendered in place.
      window.location.replace(`${pendingRedirect}?cp=${encodeURIComponent(pathname + search)}`);
      return;
    }

    if (window.isErrorPage) {
      // Neither rendering nor redirecting worked: reveal the error content.
      document.querySelector('main.error')?.style.setProperty('display', 'block', 'important');
    }
  }

  // Whatever is still flagged as an error page is a genuine 404: report it
  // from here so in-place rendered commerce links are not counted as 404s.
  if (window.isErrorPage) {
    sampleRUM('404', { source: document.referrer });
  }

  // Restore the deep link kept in ?cp= by the redirect above.
  if (search.includes('cp=') && COMMERCE_TEMPLATE_RE.test(relativePath)) {
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
