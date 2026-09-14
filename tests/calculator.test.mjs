import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('calculator reads the field named length instead of the collection length', async () => {
  const source = await readFile(new URL('../site/assets/js/main.js', import.meta.url), 'utf8');
  const result = { textContent: 'Исходный текст' };
  const submit = { removeAttribute() {} };
  let onSubmit;
  const fields = new Map([
    ['length', { value: '10' }],
    ['height', { value: '1,5' }],
    ['depth', { value: '0,3' }],
  ]);
  const calculator = {
    elements: {
      length: fields.size,
      namedItem(name) { return fields.get(name); },
    },
    querySelector(selector) {
      if (selector === '[data-calc-submit]') return submit;
      if (selector === '[data-result]') return result;
      return null;
    },
    addEventListener(type, listener) {
      if (type === 'submit') onSubmit = listener;
    },
  };
  const classList = { add() {}, remove() {} };
  const document = {
    documentElement: { classList, dataset: {} },
    querySelector(selector) {
      return selector === '[data-calculator]' ? calculator : null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  const context = {
    document,
    window: { dispatchEvent() {} },
    location: { pathname: '/ceny/' },
    matchMedia() { return { addEventListener() {} }; },
    CustomEvent: class {},
    Intl,
    Number,
    setTimeout,
  };

  vm.runInNewContext(source, context);
  assert.equal(typeof onSubmit, 'function');
  onSubmit({ preventDefault() {} });
  assert.match(result.textContent, /4,5 м³/);
});
