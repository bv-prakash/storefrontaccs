import { SignIn } from '@dropins/storefront-auth/containers/SignIn.js';
import { render as authRenderer } from '@dropins/storefront-auth/render.js';
import {
  CUSTOMER_ACCOUNT_PATH,
  CUSTOMER_FORGOTPASSWORD_PATH,
  checkIsAuthenticated,
  rootLink,
} from '../../scripts/commerce.js';

// Initialize
import '../../scripts/initializers/auth.js';

// Path to the create-account page
const CUSTOMER_CREATE_ACCOUNT_PATH = '/customer/create';

export default async function decorate(block) {
  if (checkIsAuthenticated()) {
    window.location.href = rootLink(CUSTOMER_ACCOUNT_PATH);
  } else {
    // Extract the authored background image from the first row
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
          section.style.setProperty('--login-bg-image', `url('${bgUrl}')`);
          section.classList.add('commerce-login-bg-section');
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

    // Create a centered card wrapper for the form
    const card = document.createElement('div');
    card.classList.add('commerce-login-card');
    block.appendChild(card);

    // Render SignIn dropin into the card
    await authRenderer.render(SignIn, {
      routeForgotPassword: () => rootLink(CUSTOMER_FORGOTPASSWORD_PATH),
      routeRedirectOnSignIn: () => rootLink(CUSTOMER_ACCOUNT_PATH),
    })(card);

    // Add "Sign Up" link beneath the login form
    const signUpWrapper = document.createElement('p');
    signUpWrapper.classList.add('commerce-login-signup');
    signUpWrapper.innerHTML = `Don't have an account? <a href="${rootLink(CUSTOMER_CREATE_ACCOUNT_PATH)}">Create an Account</a>`;
    card.appendChild(signUpWrapper);
  }
}
