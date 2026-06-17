export default function decorate(block) {
  const slides = [...block.children];
  // Configuration from block classes (e.g., Home Slider (Arrows, Dots, Loop))
  const showArrows = block.classList.contains('arrows') || block.classList.contains('arrow');
  const showDots = block.classList.contains('dots') || block.classList.contains('dot');
  const isInfinite = block.classList.contains('loop') || block.classList.contains('infinite');

  // Create wrapper for slides to separate navigation
  const slidesWrapper = document.createElement('div');
  slidesWrapper.classList.add('slides-wrapper');

  slides.forEach((slide) => {
    slide.classList.add('slide');

    const [image, content] = slide.children;
    if (image) image.classList.add('slide-image');
    if (content) {
      content.classList.add('slide-content');
      const heading = content.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) heading.classList.add('title');

      const paragraphs = content.querySelectorAll('p');
      if (paragraphs[0]) paragraphs[0].classList.add('location');
      if (paragraphs[1]) paragraphs[1].classList.add('description');

      const ctaWrapper = content.querySelector('.button-wrapper') || (paragraphs[2] ? paragraphs[2] : null);
      if (ctaWrapper) ctaWrapper.classList.add('cta');
    }
    slidesWrapper.append(slide);
  });

  block.innerHTML = '';
  block.append(slidesWrapper);

  let currentSlideIndex = 0;

  // Dots
  if (showDots && slides.length > 1) {
    const dotsContainer = document.createElement('div');
    dotsContainer.classList.add('slider-dots');
    slides.forEach((_, idx) => {
      const dot = document.createElement('button');
      dot.classList.add('dot');
      dot.setAttribute('aria-label', `Go to slide ${idx + 1}`);
      if (idx === 0) dot.classList.add('active');
      dot.addEventListener('click', () => goToSlide(idx));
      dotsContainer.append(dot);
    });
    block.append(dotsContainer);
  }

  // Arrows
  if (showArrows && slides.length > 1) {
    const prevBtn = document.createElement('button');
    prevBtn.classList.add('slider-nav', 'prev');
    prevBtn.innerHTML = '&#10094;'; // Left arrow
    prevBtn.setAttribute('aria-label', 'Previous slide');
    prevBtn.addEventListener('click', () => goToSlide(currentSlideIndex - 1));

    const nextBtn = document.createElement('button');
    nextBtn.classList.add('slider-nav', 'next');
    nextBtn.innerHTML = '&#10095;'; // Right arrow
    nextBtn.setAttribute('aria-label', 'Next slide');
    nextBtn.addEventListener('click', () => goToSlide(currentSlideIndex + 1));

    block.append(prevBtn, nextBtn);
  }

  function goToSlide(index) {
    let targetIndex = index;
    if (targetIndex < 0) {
      targetIndex = isInfinite ? slides.length - 1 : 0;
    } else if (targetIndex >= slides.length) {
      targetIndex = isInfinite ? 0 : slides.length - 1;
    }
    currentSlideIndex = targetIndex;
    const scrollLeftPos = currentSlideIndex * slidesWrapper.clientWidth;
    slidesWrapper.scrollTo({ left: scrollLeftPos, behavior: 'smooth' });

    updateDots();
  }

  function updateDots() {
    const dots = block.querySelectorAll('.dot');
    if (dots.length) {
      dots.forEach((d) => d.classList.remove('active'));
      dots[currentSlideIndex].classList.add('active');
    }
  }

  // Intersection observer to update dots and current index on manual scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        currentSlideIndex = slides.indexOf(entry.target);
        updateDots();
      }
    });
  }, { threshold: 0.6 });
  slides.forEach((slide) => observer.observe(slide));

  // Auto-Slider Logic (Infinite Loop)
  if (slides.length > 1 && isInfinite) {
    setInterval(() => {
      goToSlide(currentSlideIndex + 1);
    }, 5000);
  }
}
