export function initMegaMenuPanel(subMenuUl) {
  const panelWrapper = document.createElement('div');
  panelWrapper.className = 'megamenu-dropdown-panel';

  const gridContainer = document.createElement('div');
  gridContainer.className = 'megamenu-grid-container';

  const categoryItems = subMenuUl.querySelectorAll(':scope > li');

  // Check if any items inside this menu container contain a third nested layer depth
  let hasDeepNesting = false;
  categoryItems.forEach((item) => {
    if (item.querySelector(':scope > ul > li')) {
      hasDeepNesting = true;
    }
  });

  // Assign clean contextual structural hooks based on content layout complexity
  if (hasDeepNesting) {
    gridContainer.classList.add('layout-deep-tier');
  } else {
    gridContainer.classList.add('layout-simple-application');
  }

  categoryItems.forEach((item) => {
    const colDiv = document.createElement('div');
    colDiv.className = 'megamenu-column';

    const parentLink = item.querySelector(':scope > a, :scope > span') || item.firstChild;
    const childUl = item.querySelector(':scope > ul');

    if (!parentLink || !parentLink.textContent.trim()) return;

    const colHeading = document.createElement('h3');
    colHeading.className = 'megamenu-column-heading';

    if (parentLink.tagName === 'A' && parentLink.getAttribute('href')) {
      const colTitleLink = document.createElement('a');
      colTitleLink.href = parentLink.href;
      colTitleLink.textContent = parentLink.textContent.trim();
      colHeading.appendChild(colTitleLink);
    } else {
      colHeading.textContent = parentLink.textContent.trim();
    }

    colDiv.appendChild(colHeading);

    // Process deep sub-levels cleanly if they exist
    if (childUl) {
      const standardList = document.createElement('ul');
      standardList.className = 'megamenu-links-list';

      childUl.querySelectorAll(':scope > li').forEach((childLi) => {
        const a = childLi.querySelector('a, span') || childLi.firstChild;
        if (!a || !a.textContent.trim()) return;

        const leafLi = document.createElement('li');
        leafLi.className = 'megamenu-leaf-item';

        if (a.tagName === 'A' && a.getAttribute('href')) {
          const leafLink = document.createElement('a');
          leafLink.href = a.href;
          leafLink.textContent = a.textContent.trim();
          leafLi.appendChild(leafLink);
        } else {
          leafLi.textContent = a.textContent.trim();
        }

        // Handle structural 4th tier rendering if sub-items also have items
        const deepGrandchildUl = childLi.querySelector(':scope > ul');
        if (deepGrandchildUl) {
          leafLi.classList.add('has-nested-children');
          const subTierUl = document.createElement('ul');
          subTierUl.className = 'megamenu-subtier-list';

          deepGrandchildUl.querySelectorAll(':scope > li').forEach((gLi) => {
            const gA = gLi.querySelector('a') || gLi.firstChild;
            if (gA && gA.textContent.trim()) {
              const subLi = document.createElement('li');
              const subLink = document.createElement('a');
              subLink.href = gA.href || '#';
              subLink.textContent = gA.textContent.trim();
              subLi.appendChild(subLink);
              subTierUl.appendChild(subLi);
            }
          });
          leafLi.appendChild(subTierUl);
        }

        standardList.appendChild(leafLi);
      });
      colDiv.appendChild(standardList);
    }

    gridContainer.appendChild(colDiv);
  });

  panelWrapper.appendChild(gridContainer);
  return panelWrapper;
}
