import { SignUp } from '@dropins/storefront-auth/containers/SignUp.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_LOGIN_PATH,
  checkIsAuthenticated,
  authPrivacyPolicyConsentSlot,
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
          section.style.setProperty('--signup-bg-image', `url('${bgUrl}')`);
          section.classList.add('commerce-signup-bg-section');
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

    await authRenderer.render(SignUp, {
      hideCloseBtnOnEmailConfirmation: true,
      routeSignIn: () => rootLink(CUSTOMER_LOGIN_PATH),
      routeRedirectOnSignIn: () => rootLink(CUSTOMER_ACCOUNT_PATH),
      slots: {
        ...authPrivacyPolicyConsentSlot,
      },
    })(block);
  }
}
