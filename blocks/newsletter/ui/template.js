/**
 * Generates the structural inner HTML for the newsletter block.
 */
export function renderTemplate(title, description) {
  return `
    <div class="newsletter-content">
      ${title ? `<div class="newsletter-title">${title}</div>` : ''}
      ${description ? `<p class="newsletter-description">${description}</p>` : ''}
    </div>
    <form class="newsletter-form">
      <div class="newsletter-input-group">
        <input type="email" name="email" placeholder="Your email address" required aria-label="Email Address" />
        <button class="action subscribe" type="submit">Join</button>
      </div>
      <div class="newsletter-status" aria-live="polite"></div>
    </form>
  `;
}

/**
 * Updates the visual submission feedback state for the user.
 */
export function updateStatus(statusElement, message, stateClass) {
  statusElement.textContent = message;
  statusElement.className = `newsletter-status ${stateClass}`;
}
