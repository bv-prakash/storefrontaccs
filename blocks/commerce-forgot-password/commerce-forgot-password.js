import { ResetPassword } from '@dropins/storefront-auth/containers/ResetPassword.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import { events } from '@dropins/tools/event-bus.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';

// Initialize
import '../../scripts/initializers/auth.js';

export default async function decorate(block) {
  if (checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_ACCOUNT_PATH);
  } else {
    const picture = block.querySelector('picture');
    if (picture) {
      const img = picture.querySelector('img');
      if (img) {
        // Prefer the desktop-quality source (min-width: 600px)
        let bgUrl = img.src;
        picture.querySelectorAll('source').forEach((source) => {
          if (source.media && source.media.includes('600px') && source.srcset) {
            const [firstSrc] = source.srcset.split(',');
            [bgUrl] = firstSrc.trim().split(' ');
          }
        });

        // Apply background to the section so it covers the full viewport band
        const section = block.closest('.section');
        if (section) {
          section.style.setProperty('--forgot-password-bg-image', `url('${bgUrl}')`);
          section.classList.add('commerce-forgot-password-bg-section');
        }
      }
      // Remove the picture row — it is now the CSS background
      const pictureRow = picture.closest('div');
      if (pictureRow) {
        const pictureRowOuter = pictureRow.parentElement.closest('div');

        if (pictureRowOuter && pictureRowOuter.children.length === 1) {
          pictureRowOuter.remove();
        } else {
          pictureRow.remove();
        }
      } else {
        pictureRow.remove();
      }
    }
    await authRenderer.render(ResetPassword, {
      routeSignIn: () => rootLink(CUSTOMER_LOGIN_PATH),
    })(block);
  }

  events.on('authenticated', (authenticated) => {
    if (authenticated) window.location.href = rootLink(CUSTOMER_ACCOUNT_PATH);
  });
}
