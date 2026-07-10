export function renderBreadcrumbs(container, categoryData, labels = {}) {
  container.innerHTML = '';

  const nav = document.createElement('nav');
  nav.className = 'plp-breadcrumbs';

  const ol = document.createElement('ol');

  // Add Home link
  const homeLi = document.createElement('li');
  const homeLink = document.createElement('a');
  homeLink.href = '/';
  homeLink.textContent = labels?.Home || 'Home';
  homeLi.append(homeLink);
  ol.append(homeLi);

  if (categoryData.breadcrumbs) {
    categoryData.breadcrumbs.forEach((item) => {
      const li = document.createElement('li');

      const link = document.createElement('a');
      link.href = `/${item.category_url_path}`;
      link.textContent = item.category_name;

      li.append(link);
      ol.append(li);
    });
  }

  // Add current category
  if (categoryData.name) {
    const currentLi = document.createElement('li');
    currentLi.textContent = categoryData.name;
    ol.append(currentLi);
  }

  nav.append(ol);

  container.append(nav);
}
