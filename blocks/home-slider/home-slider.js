import { loadCSS } from '../../scripts/aem.js';

/**
 * Load slider-specific custom CSS
 */
async function loadSliderStyles() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/font.css`);
  try {
    if (!window.location.hostname.includes('localhost')) {
      sessionStorage.setItem('slider-styles-loaded', 'true');
    }
  } catch (e) { /* do nothing */ }
}

export default async function decorate(block) {
  const stylesReady = loadSliderStyles(); // fire in parallel, don't await yet

  const slides = [...block.children];
  if (!slides.length) return;

  const showArrows = block.classList.contains('arrows') || block.classList.contains('arrow');
  const showDots = block.classList.contains('dots') || block.classList.contains('dot');
  const isInfinite = block.classList.contains('loop') || block.classList.contains('infinite');

  // Build slides wrapper
  const slidesWrapper = document.createElement('div');
  slidesWrapper.classList.add('slides-wrapper');
  const fragment = document.createDocumentFragment();

  slides.forEach((slide) => {
    slide.classList.add('slide');
    const [image, content] = slide.children;
    if (image) image.classList.add('slide-image');
    if (content) {
      content.classList.add('slide-content');
      content.querySelector('h1,h2,h3,h4,h5,h6')?.classList.add('title');

      const paragraphs = [...content.querySelectorAll('p')];

      const [location, ...restParagraphs] = paragraphs;

      let description;
      let ctaWrapper;

      location?.classList.add('location');

      restParagraphs.forEach((p) => {
        const isCTA = p.childNodes.length === 1
          && p.firstElementChild?.tagName === 'A';

        if (isCTA && !ctaWrapper) {
          ctaWrapper = p;
        } else if (!description) {
          description = p;
        }
      });

      description?.classList.add('description');
      ctaWrapper?.classList.add('cta');
    }
    fragment.append(slide);
  });

  slidesWrapper.append(fragment);

  // Batch all DOM writes into one fragment — single reflow
  const newContent = document.createDocumentFragment();
  newContent.append(slidesWrapper);

  let currentSlideIndex = 0;

  // Dots
  let dotsContainer = null;
  if (showDots && slides.length > 1) {
    dotsContainer = document.createElement('div');
    dotsContainer.classList.add('slider-dots');
    slides.forEach((_, idx) => {
      const dot = document.createElement('button');
      dot.classList.add('dot');
      dot.setAttribute('aria-label', `Go to slide ${idx + 1}`);
      if (idx === 0) dot.classList.add('active');
      dot.addEventListener('click', () => goToSlide(idx));
      dotsContainer.append(dot);
    });
    newContent.append(dotsContainer);
  }

  // Arrows
  if (showArrows && slides.length > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.classList.add('slider-nav', 'prev');
    prevBtn.innerHTML = '&#10094;';
    prevBtn.setAttribute('aria-label', 'Previous slide');
    prevBtn.addEventListener('click', () => goToSlide(currentSlideIndex - 1));

    const nextBtn = document.createElement('button');
    nextBtn.classList.add('slider-nav', 'next');
    nextBtn.innerHTML = '&#10095;';
    nextBtn.setAttribute('aria-label', 'Next slide');
    nextBtn.addEventListener('click', () => goToSlide(currentSlideIndex + 1));

    newContent.append(prevBtn, nextBtn);
  }

  block.innerHTML = '';
  block.append(newContent); // single DOM write

  // Navigation
  function goToSlide(index) {
    let targetIndex = index;
    if (targetIndex < 0) targetIndex = isInfinite ? slides.length - 1 : 0;
    else if (targetIndex >= slides.length) targetIndex = isInfinite ? 0 : slides.length - 1;

    currentSlideIndex = targetIndex;
    slidesWrapper.scrollTo({ left: currentSlideIndex * slidesWrapper.clientWidth, behavior: 'smooth' });
    updateDots();
  }

  function updateDots() {
    if (!dotsContainer) return;
    dotsContainer.querySelector('.dot.active')?.classList.remove('active');
    dotsContainer.children[currentSlideIndex]?.classList.add('active');
  }

  // Intersection Observer — tracks manual scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        currentSlideIndex = slides.indexOf(entry.target);
        updateDots();
      }
    });
  }, { threshold: 0.6, root: slidesWrapper });

  slides.forEach((slide) => observer.observe(slide));

  // Auto-play with pause on hover
  if (slides.length > 1 && isInfinite) {
    let autoPlay = setInterval(() => goToSlide(currentSlideIndex + 1), 5000);
    block.addEventListener('mouseenter', () => clearInterval(autoPlay));
    block.addEventListener('mouseleave', () => {
      autoPlay = setInterval(() => goToSlide(currentSlideIndex + 1), 5000);
    });
  }

  await stylesReady; // CSS awaited last — slider is already rendered by this point
}
