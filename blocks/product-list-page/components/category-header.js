export function renderCategoryHeader(container, category) {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'plp-category';

    const title = document.createElement('h1');
    title.className = 'plp-category__title';
    title.textContent = category.name;

    const description = document.createElement('div');
    description.className = 'plp-category__description';
    description.innerHTML = category.description || '';

    wrapper.append(title);
    wrapper.append(description);

    container.append(wrapper);
}
