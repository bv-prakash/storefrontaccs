import { Render } from '@dropins/tools/lib.js';
import { loadCSS } from '../../scripts/aem.js';

function createCloseButton() {
  const closeButton = document.createElement('button');
  closeButton.classList.add('close-button');
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.setAttribute('data-dismiss', 'modal');
  closeButton.type = 'button';
  closeButton.innerHTML = '<span class="icon icon-close"></span>';
  return closeButton;
}

/**
 * Shared modal header (title + close).
 * @param {string} [title]
 * @returns {HTMLElement}
 */
export function createModalHeader(title = '') {
  const header = document.createElement('header');
  header.className = 'modal-header';

  const titleEl = document.createElement('p');
  titleEl.className = 'modal-header__title';
  if (title) {
    titleEl.textContent = title;
  } else {
    titleEl.classList.add('modal-header__title--empty');
    titleEl.setAttribute('aria-hidden', 'true');
  }

  header.append(titleEl, createCloseButton());
  return header;
}

/**
 * @param {HTMLElement[]} contentNodes
 * @param {{
 *   header?: HTMLElement | null,
 *   title?: string,
 *   size?: 'compact' | 'default' | 'wide',
 * }} [options]
 */
export default async function createModal(contentNodes, options = {}) {
  await loadCSS(`${window.hlx.codeBasePath}/blocks/modal/modal.css`);
  const dialog = document.createElement('dialog');
  dialog.setAttribute('tabindex', 1);
  dialog.setAttribute('role', 'dialog');

  const size = options.size ?? 'default';
  dialog.dataset.modalSize = size;

  const dialogContent = document.createElement('div');
  dialogContent.classList.add('modal-content');
  dialogContent.append(...contentNodes);

  const closeModal = () => {
    dialog.close();
    dialog.querySelectorAll('[data-dropin-container]').forEach(Render.unmount);
  };

  const modalHeader = options.header instanceof HTMLElement
    ? options.header
    : createModalHeader(options.title ?? '');

  modalHeader.classList.add('modal-header');
  let headerClose = modalHeader.querySelector('.close-button');
  if (!headerClose) {
    headerClose = createCloseButton();
    modalHeader.append(headerClose);
  }
  headerClose.addEventListener('click', closeModal);

  dialog.append(modalHeader);
  dialog.append(dialogContent);

  dialog.addEventListener('click', (event) => {
    if (event.pointerType !== 'mouse') return;

    const dialogDimensions = dialog.getBoundingClientRect();
    if (
      event.clientX < dialogDimensions.left
      || event.clientX > dialogDimensions.right
      || event.clientY < dialogDimensions.top
      || event.clientY > dialogDimensions.bottom
    ) {
      closeModal();
    }
  });

  const block = document.createElement('div');
  block.classList.add('modal');
  document.querySelector('main').append(block);

  dialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    block.remove();
  });

  block.append(dialog);

  return {
    block,
    removeModal: () => closeModal(),
    showModal: () => {
      dialog.showModal();
      setTimeout(() => {
        dialogContent.scrollTop = 0;
      }, 0);

      const observer = new MutationObserver(() => {
        const firstInput = dialogContent.querySelector('input');
        if (firstInput) {
          firstInput.focus();
          observer.disconnect();
        }
      });

      observer.observe(dialogContent, { childList: true, subtree: true });

      document.body.classList.add('modal-open');
    },
  };
}
