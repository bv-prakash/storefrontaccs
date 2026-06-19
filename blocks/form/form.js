import { toCamelCase } from '../../scripts/aem.js';

/**
 * Creates an HTML element with an optional class name
 */
function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function generateId(name, option = null) {
  const id = toCamelCase(name);
  return option ? `${id}-${toCamelCase(option)}` : id;
}

function buildLabel(text, type = 'label', id = null, required = false) {
  const label = createElement(type);
  label.textContent = text;
  if (id && type === 'label') label.setAttribute('for', id);
  if (required) label.dataset.required = 'true';
  return label;
}

function buildInput(field) {
  const { type, field: fieldName, placeholder } = field;
  const input = createElement('input');
  input.type = type || 'text';
  input.id = generateId(fieldName);
  input.name = input.id;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

function buildButton(field) {
  const { type, label } = field;
  const button = createElement('button', 'button');
  button.type = type;
  button.textContent = label;
  return button;
}

function generatePayload(form) {
  const payload = {};
  [...form.elements].forEach((field) => {
    if (field.name && !field.disabled) {
      payload[field.name] = field.value;
    }
  });
  return payload;
}

/**
 * Intercepts submission layout local view updates
 */
async function handleSubmit(form) {
  try {
    const payload = generatePayload(form);

    const resultBlock = createElement('div', 'form-submission-success');

    const title = createElement('h3');
    title.textContent = 'Form Captured Successfully!';
    resultBlock.append(title);

    const description = createElement('p');
    description.textContent = 'Below are the locally processed data details:';
    resultBlock.append(description);

    const dataList = createElement('dl', 'submission-data-list');
    Object.entries(payload).forEach(([key, value]) => {
      const dt = createElement('dt');
      dt.style.fontWeight = 'bold';
      dt.textContent = key;

      const dd = createElement('dd');
      dd.textContent = value || '(empty)';
      dd.style.marginBottom = '10px';

      dataList.append(dt, dd);
    });

    resultBlock.append(dataList);

    const block = form.closest('.block') || form.parentElement;
    block.replaceChildren(resultBlock);
  } catch (error) {
    console.error(error);
  }
}

function buildField(field) {
  const { type, label, field: fieldName } = field;

  if (type === 'submit') {
    return buildButton(field);
  }

  // Matches CSS structure: .form .form-field.text-field
  const wrapper = createElement('div', `form-field ${type}-field`);
  const inputId = generateId(fieldName);

  wrapper.append(buildLabel(label, 'label', inputId, false));
  const input = buildInput(field);
  wrapper.append(input);

  return wrapper;
}

/**
 * Main decorating rendering entry loop
 */
export default function decorate(block) {
  // Add base structural style hook class to top element to fire your layout sheets setup
  block.classList.add('form');

  const rows = [...block.children];
  const fields = [];

  rows.forEach((row) => {
    const textContent = row.textContent.trim();

    // Completely bypasses handling external API links or block titles safely
    if (textContent.toLowerCase() === 'form' || textContent.includes('httpbin.org')) {
      return;
    }

    if (textContent) {
      fields.push({
        type: 'text',
        field: textContent,
        label: textContent,
        placeholder: `Enter your ${textContent.toLowerCase()}...`,
      });
    }
  });

  // Append functional submission button field configuration
  fields.push({ type: 'submit', label: 'Submit' });

  const form = createElement('form');
  form.setAttribute('novalidate', '');

  const buttonWrapper = createElement('div', 'button-wrapper');

  fields.forEach((field) => {
    const generatedField = buildField(field);
    if (field.type === 'submit') {
      buttonWrapper.append(generatedField);
    } else {
      form.append(generatedField);
    }
  });

  // Nest actions container block properly targeting your button rules
  form.append(buttonWrapper);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit(form);
  });

  block.replaceChildren(form);
  block.style.visibility = 'visible';
}
