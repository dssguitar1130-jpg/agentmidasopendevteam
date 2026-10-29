/* Local QA only: dependencies are resolved from an isolated directory, not this repo.
 * FAQ_QA_DIR=/absolute/qa-directory node --test bounties/23-faq-manager/FAQManager.test.cjs
 */
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
if (!process.env.FAQ_QA_DIR) throw new Error('Set FAQ_QA_DIR to an isolated React 19 / esbuild / jsdom QA directory. See README.');
const qa = path.resolve(process.env.FAQ_QA_DIR);
const req = createRequire(path.join(qa, 'package.json'));
const { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://qa.invalid' });
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = req('react');
const { act } = React;
const { createRoot } = req('react-dom/client');
const { renderToString } = req('react-dom/server');
const compiled = path.join(qa, 'FAQManager.test-build.cjs');
req('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'FAQManager.tsx')], outfile: compiled, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], nodePaths: [path.join(qa, 'node_modules')] });
const { FAQManager } = require(compiled);
const entries = [
  { id: 'a', question: 'How do I begin?', answer: 'Read the setup guide.', category: 'Getting started' },
  { id: 'b', question: 'Where is my invoice?', answer: 'Contact the billing team.', category: 'Billing' },
  { id: 'c', question: 'Can I change my password?', answer: 'Open account security.', category: 'Account' },
];
let roots = [];
function mount(props = {}) {
  const node = document.createElement('div'); document.body.append(node);
  let root; act(() => { root = createRoot(node); root.render(React.createElement(FAQManager, { entries, ...props })); });
  roots.push(root);
  return { node, update(next) { act(() => root.render(React.createElement(FAQManager, { entries, ...next }))); } };
}
function buttons(node) { return [...node.querySelectorAll('button[aria-expanded]')]; }
function click(node) { act(() => node.click()); }
function search(node, value) {
  const input = node.querySelector('input');
  act(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}
function category(node, label) { return [...node.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent === label); }
afterEach(() => { act(() => roots.forEach((root) => root.unmount())); roots = []; document.body.replaceChildren(); });

test('renders all supplied FAQ entries without fabricated product answers', () => {
  const { node } = mount(); assert.equal(buttons(node).length, 3); assert.match(node.textContent, /3 answers found/);
});
test('searches answer content case-insensitively and trims surrounding whitespace', () => {
  const { node } = mount(); search(node, '  BILLING TEAM  '); assert.equal(buttons(node).length, 1); assert.match(buttons(node)[0].textContent, /invoice/);
});
test('normalizes compatibility Unicode during search', () => {
  const { node } = mount(); search(node, 'ｉｎｖｏｉｃｅ'); assert.equal(buttons(node).length, 1);
});
test('matches Turkish dotted I in either the published text or query', () => {
  for (const text of ['İstanbul', 'I\u0307STANBUL', 'istanbul']) {
    const { node } = mount({ entries: [{ ...entries[0], question: text }] });
    for (const query of ['istanbul', 'İSTANBUL', 'I\u0307stanbul']) {
      search(node, query); assert.equal(buttons(node).length, 1, `${text} / ${query}`);
    }
  }
});
test('preserves accents other than the dotted-I case fold', () => {
  const { node } = mount({ entries: [{ ...entries[0], question: 'résumé' }] });
  search(node, 'RESUME'); assert.equal(buttons(node).length, 0);
  search(node, 'RÉSUMÉ'); assert.equal(buttons(node).length, 1);
});
test('arbitrary UTF-16 identifiers render with unique ARIA targets and support keyboard focus', () => {
  const ids = ['\ud800', '\udc00', '\ufffd', '😀', 'd800', '', 'a /?#한글'];
  const unusual = ids.map((id, i) => ({ ...entries[0], id, question: `Question ${i}` }));
  const { node } = mount({ entries: unusual });
  const list = buttons(node); assert.equal(list.length, ids.length);
  const domIds = [...node.querySelectorAll('[id]')].map((element) => element.id);
  assert.equal(new Set(domIds).size, domIds.length);
  for (const button of list) {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    assert.ok(panel); assert.equal(panel.getAttribute('aria-labelledby'), button.id);
    click(button); assert.equal(panel.hidden, false);
  }
  list[0].focus();
  act(() => list[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  assert.equal(document.activeElement, list[1]);
  act(() => list[1].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  assert.equal(document.activeElement, list[list.length - 1]);
  assert.doesNotThrow(() => renderToString(React.createElement(FAQManager, { entries: unusual })));
});
test('combines category and search rather than replacing either', () => {
  const { node } = mount(); click(category(node, 'Billing')); search(node, 'password'); assert.equal(buttons(node).length, 0); assert.match(node.textContent, /No matching FAQs/);
});
test('clear filters restores the full list', () => {
  const { node } = mount(); search(node, 'absent'); click([...node.querySelectorAll('button')].find((b) => b.textContent === 'Clear filters')); assert.equal(buttons(node).length, 3); assert.equal(node.querySelector('input').value, '');
});
test('real All categories category never collides with the all-categories sentinel', () => {
  const { node } = mount({ entries: [...entries, { id: 'all', question: 'Specific category', answer: 'Only one.', category: 'All categories' }] });
  const choices = [...node.querySelectorAll('button[aria-pressed]')].filter((b) => b.textContent === 'All categories');
  assert.equal(choices.length, 2); click(choices[1]); assert.equal(buttons(node).length, 1);
});
test('every aria-controls target exists while collapsed and expanded', () => {
  const { node } = mount(); for (const button of buttons(node)) { const target = document.getElementById(button.getAttribute('aria-controls')); assert.ok(target); assert.equal(target.hidden, true); click(button); assert.equal(target.hidden, false); assert.equal(button.getAttribute('aria-expanded'), 'true'); }
});
test('supports collapsing and independently expanding answers', () => {
  const { node } = mount(); const [a, b] = buttons(node); click(a); click(b); assert.equal(a.getAttribute('aria-expanded'), 'true'); click(a); assert.equal(a.getAttribute('aria-expanded'), 'false'); assert.equal(b.getAttribute('aria-expanded'), 'true');
});
test('multiple instances and unusual item identifiers never duplicate DOM ids', () => {
  mount({ entries: [{ ...entries[0], id: 'a /?#한글' }] }); mount({ entries: [{ ...entries[0], id: 'a /?#한글' }] });
  const ids = [...document.querySelectorAll('[id]')].map((el) => el.id); assert.equal(new Set(ids).size, ids.length);
  for (const el of document.querySelectorAll('[aria-controls]')) assert.ok(document.getElementById(el.getAttribute('aria-controls')));
});
test('keyboard ArrowUp, ArrowDown, Home and End navigate visible question buttons', () => {
  const { node } = mount(); const list = buttons(node);
  function key(el, value) { act(() => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true }))); }
  list[0].focus(); key(list[0], 'ArrowUp'); assert.equal(document.activeElement, list[2]); key(list[2], 'ArrowDown'); assert.equal(document.activeElement, list[0]); key(list[0], 'End'); assert.equal(document.activeElement, list[2]); key(list[2], 'Home'); assert.equal(document.activeElement, list[0]);
});
test('controlled data refresh cannot strand a removed category', () => {
  const view = mount(); click(category(view.node, 'Billing')); view.update({ entries: [entries[0]] }); assert.equal(buttons(view.node).length, 1); assert.equal(category(view.node, 'All categories').getAttribute('aria-pressed'), 'true');
});
test('controlled data refresh reflects updated answers without remounting', () => {
  const view = mount(); view.update({ entries: [{ ...entries[0], answer: 'Updated answer.' }] }); assert.match(view.node.textContent, /Updated answer/); assert.equal(buttons(view.node).length, 1);
});
test('empty published content has a distinct empty state', () => {
  const { node } = mount({ entries: [] }); assert.match(node.textContent, /No FAQs published yet/); assert.equal(buttons(node).length, 0);
});
test('loading state suppresses stale answers and announces busy status', () => {
  const { node } = mount({ loading: true }); assert.equal(node.querySelector('section').getAttribute('aria-busy'), 'true'); assert.match(node.textContent, /Loading FAQs/); assert.equal(buttons(node).length, 0); assert.equal(node.querySelector('input').disabled, true);
});
test('error state announces the error and invokes explicit retry callback', () => {
  let called = 0; const { node } = mount({ error: 'Unavailable', onRetry: () => { called++; } }); assert.equal(node.querySelector('[role=alert]').textContent.includes('Unavailable'), true); click([...node.querySelectorAll('button')].find((b) => b.textContent === 'Try again')); assert.equal(called, 1); assert.equal(buttons(node).length, 0);
});
test('untrusted text is rendered as text, never executable HTML', () => {
  const { node } = mount({ entries: [{ ...entries[0], answer: '<img src=x onerror=alert(1)><script>alert(1)</script>' }], error: null }); assert.equal(node.querySelectorAll('img,script').length, 0); assert.match(node.textContent, /<script>/);
});
test('server rendering requires no browser or localStorage access', () => {
  const oldWindow = global.window; const oldDocument = global.document; delete global.window; delete global.document;
  try { const markup = renderToString(React.createElement(FAQManager, { entries })); assert.match(markup, /How do I begin/); assert.match(markup, /aria-controls/); } finally { global.window = oldWindow; global.document = oldDocument; }
});
