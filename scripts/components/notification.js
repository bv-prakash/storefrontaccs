/**
 * Global Notification Toast / Message Component
 * Displays banner notifications at top of page for Cart, Wishlist, Compare, and errors.
 */

/**
 * Show a notification message at the top of the page.
 * @param {Object} options
 * @param {string} [options.type='success'] - 'success' | 'error' | 'info' | 'warning'
 * @param {string} options.message - The text message to display
 * @param {string} [options.linkText] - Text for redirect link (e.g. "View Cart")
 * @param {string} [options.linkUrl] - URL to redirect on click
 * @param {number} [options.duration=5000] - Duration in ms before auto dismissal (0 to disable)
 */
export function showNotification({
  type = 'success',
  message = '',
  linkText = '',
  linkUrl = '',
  duration = 5000,
} = {}) {
  let container = document.getElementById('global-notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'global-notification-container';
    container.className = 'global-notification-container';
    const header = document.querySelector('header');
    if (header) {
      header.insertAdjacentElement('afterend', container);
    } else {
      document.body.prepend(container);
    }
  } else {
    // Clear previous notifications so only one message displays at a time
    container.innerHTML = '';
  }

  const toast = document.createElement('div');
  toast.className = `global-notification-toast global-notification-toast--${type}`;
  toast.setAttribute('role', 'alert');

  let contentHtml = `<span class="global-notification-message">${message}</span>`;
  if (linkText && linkUrl) {
    contentHtml += `<a href="${linkUrl}" class="global-notification-link">${linkText}</a>`;
  }

  toast.innerHTML = `
    <div class="global-notification-content">
      ${contentHtml}
    </div>
    <button type="button" class="global-notification-close" aria-label="Close notification">&times;</button>
  `;

  const removeToast = () => {
    toast.remove();
    if (container && container.children.length === 0) {
      container.remove();
    }
  };

  const closeBtn = toast.querySelector('.global-notification-close');
  closeBtn.addEventListener('click', removeToast);

  container.appendChild(toast);

  // Trigger entering animation
  requestAnimationFrame(() => {
    toast.classList.add('is-visible');
  });

  if (duration > 0) {
    setTimeout(() => {
      removeToast();
    }, duration);
  }

  return toast;
}
