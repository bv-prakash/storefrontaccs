import { renderTemplate, updateStatus } from './ui/template.js';
import { subscribeEmail } from './api/graphql.js';

export default function decorate(block) {
  let titleText = '';
  let descText = '';

  // Extract the rows directly out of the generated block structure
  const rows = [...block.children];

  rows.forEach((row) => {
    const keyElement = row.children[0];
    const valueElement = row.children[1];

    if (keyElement && valueElement) {
      // Use clean lowercasing and trim whitespace to ensure key matches perfectly
      const key = keyElement.textContent.trim().toLowerCase();

      if (key === 'title') {
        // If the author passed raw text without headings, grab the clean innerHTML string
        titleText = valueElement.innerText.trim();
      } else if (key === 'description') {
        descText = valueElement.innerText.trim();
      }
    }
  });

  // Provide a safe dynamic fallback ONLY if title text is completely empty
  if (!titleText) {
    titleText = 'Stay Connected';
  }

  // Clear out layout tables and render
  block.textContent = '';
  const wrapper = document.createElement('div');
  wrapper.classList.add('newsletter-wrapper');

  wrapper.innerHTML = renderTemplate(titleText, descText);
  block.append(wrapper);

  // Setup elements for event interactions
  const form = wrapper.querySelector('.newsletter-form');
  const statusDiv = wrapper.querySelector('.newsletter-status');
  const submitBtn = wrapper.querySelector('button');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = form.querySelector('input[name="email"]').value;

    submitBtn.disabled = true;
    updateStatus(statusDiv, 'Submitting...', 'processing');

    try {
      const status = await subscribeEmail(emailInput);

      if (status === 'SUBSCRIBED') {
        updateStatus(statusDiv, 'Thank you for subscribing!', 'success');
        form.reset();
      } else if (status === 'NOT_ACTIVE') {
        updateStatus(statusDiv, 'Please check your email to confirm.', 'success');
        form.reset();
      } else {
        throw new Error('Unknown subscription status returned.');
      }
    } catch (error) {
      updateStatus(statusDiv, error.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}
