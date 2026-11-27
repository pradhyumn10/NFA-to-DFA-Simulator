const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');

const ids = ['states', 'alphabet', 'start', 'finals', 'transitions', 'error', 'testResult', 'status', 'empty', 'results', 'summary', 'dfaTable', 'dfaDiagram', 'nfaDiagram', 'steps', 'stepCount', 'testString', 'convertBtn', 'testBtn', 'exampleBtn', 'clearBtn'];
const elements = Object.fromEntries(ids.map(id => [id, { value: '', textContent: '', innerHTML: '', hidden: false, className: '', style: {}, classList: { add() {}, remove() {} }, handlers: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener(type, fn) { this.handlers[type] = fn; }, querySelector() { return { innerHTML: '' }; } }]));
elements.dfaTable.querySelector = () => ({ innerHTML: '' });
const document = { getElementById(id) { return elements[id]; } };
const context = vm.createContext({ document, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), context);

function configure({ states = 's, f, dead, unused', alphabet = 'a, b', start = 's', finals = 'f, dead', transitions = 's, a, f\ns, a, dead\nf, b, f\ndead, b, dead' } = {}) {
  Object.assign(elements.states, { value: states });
  Object.assign(elements.alphabet, { value: alphabet });
  Object.assign(elements.start, { value: start });
  Object.assign(elements.finals, { value: finals });
  Object.assign(elements.transitions, { value: transitions });
  elements.error.hidden = true;
  elements.testResult.hidden = true;
}
function build(input) {
  configure(input);
  vm.runInContext('convert()', context);
  assert.equal(elements.error.hidden, true, elements.error.textContent);
  return vm.runInContext('machine', context);
}
function checkString(input, value, accepted) {
  elements.testString.value = value;
  vm.runInContext('runTest()', context);
  assert.equal(elements.testResult.className.includes('pass'), accepted, `${JSON.stringify(value)} result: ${elements.testResult.textContent}`);
  return elements.testResult.textContent;
}
const report = [];
function record(name, input, expected, actual, pass) { report.push({ name, input, expected, actual, status: pass ? 'PASS' : 'FAIL' }); }
function test(name, input, expected, action) {
  try { const actual = action(); assert.deepEqual(actual, expected); record(name, input, expected, actual, true); }
  catch (error) { record(name, input, expected, error.actual ?? error.message, false); }
}

test('Deterministic single destination', 's --a--> f; finals={f}; missing f --a--> ∅', 3, () => build({ states: 's, f', alphabet: 'a', start: 's', finals: 'f', transitions: 's, a, f' }).sets.length);
test('Nondeterministic multiple destinations', 's --a--> {f, dead}; finals={f,dead}', true, () => { const m = build(); return [...m.sets[m.trans[m.startId].a]].length === 2 && [...m.sets[m.trans[m.startId].a]].includes('f'); });
test('Empty destination set and complete sink', 'dead --a--> ∅', true, () => { const m = build({ states: 's, f', alphabet: 'a', start: 's', finals: 'f', transitions: '' }); const sink = m.trans[m.startId].a; return m.sets[sink].size === 0 && m.trans[sink].a === sink; });
test('Multiple accepting NFA states', 'finals={f,dead}; DFA subset {f,dead} accepting', true, () => { const m = build(); const id = m.trans[m.startId].a; return [...m.sets[id]].every(q => m.finals.has(q)); });
test('Initial state accepting', 'start=s; finals={s}; input ε accepted', true, () => { const m = build({ states: 's, f', alphabet: 'a', start: 's', finals: 's', transitions: '' }); checkString('', '', true); return m.sets[m.startId].has('s') && elements.testResult.className.includes('pass'); });
test('Unreachable state omitted', 'unused has no incoming path from s', false, () => build().sets.some(S => S.has('unused')));
test('Accepted string', 'NFA: s -a-> {f,dead}; input a', true, () => { checkString('a', 'a', true); return elements.testResult.className.includes('pass'); });
test('Rejected string', 'NFA: s -a-> {f,dead}; input b', true, () => { checkString('b', 'b', false); return elements.testResult.className.includes('fail'); });
test('Invalid state name', 'transition destination missing', true, () => { configure({ states: 's', alphabet: 'a', start: 's', finals: '', transitions: 's, a, missing' }); vm.runInContext('convert()', context); return !elements.error.hidden && /unknown destination/.test(elements.error.textContent); });
test('Invalid alphabet symbol', 'transition uses b outside alphabet {a}', true, () => { configure({ states: 's', alphabet: 'a', start: 's', finals: '', transitions: 's, b, s' }); vm.runInContext('convert()', context); return !elements.error.hidden && /not in the alphabet/.test(elements.error.textContent); });
test('Empty input string', 'input ε; start s is accepting', true, () => { build({ states: 's, f', alphabet: 'a', start: 's', finals: 's', transitions: '' }); checkString('', '', true); return elements.testResult.className.includes('pass'); });
test('Epsilon transition rejected explicitly', 'alphabet includes ε', true, () => { configure({ states: 's, f', alphabet: 'a, ε', start: 's', finals: 'f', transitions: 's, ε, f' }); vm.runInContext('convert()', context); return !elements.error.hidden && /without ε-transitions/.test(elements.error.textContent); });
test('Sample accepts a string containing 0', 'sample NFA; input 10', true, () => { elements.exampleBtn.handlers.click(); checkString('10', '10', true); return elements.testResult.className.includes('pass'); });
test('Sample rejects a string with no 0', 'sample NFA; input 11', true, () => { elements.exampleBtn.handlers.click(); checkString('11', '11', false); return elements.testResult.className.includes('fail'); });
const userNfa = { states: 'q0, q1, q2', alphabet: 'a, b, c', start: 'q0', finals: 'q2', transitions: 'q0, a, q0\nq0, a, q1\nq0, b, q0\nq1, c, q2\nq2, b, q2' };
test('User NFA accepts ac', 'q0 --a--> {q0,q1}; q1 --c--> q2; input ac', true, () => { build(userNfa); checkString('ac', 'ac', true); return elements.testResult.className.includes('pass'); });
test('User NFA accepts bacb', 'input bacb', true, () => { build(userNfa); checkString('bacb', 'bacb', true); return elements.testResult.className.includes('pass'); });
test('User NFA rejects ab', 'input ab', true, () => { build(userNfa); checkString('ab', 'ab', false); return elements.testResult.className.includes('fail'); });
test('User NFA rejects abc', 'input abc', true, () => { build(userNfa); checkString('abc', 'abc', false); return elements.testResult.className.includes('fail'); });
test('Load example button', 'click Load example', 2, () => { elements.exampleBtn.handlers.click(); return vm.runInContext('machine.sets.length', context); });
test('DFA diagram includes nodes, accepting markers, and unclipped start label', 'load sample and render generated graph', true, () => { elements.exampleBtn.handlers.click(); const svg = elements.dfaDiagram.innerHTML; return ['D0', 'D1', 'is-accepting', 'marker-end', 'text-anchor="start"', '>START</text>'].every(token => svg.includes(token)); });
test('NFA diagram draws source states, nondeterministic edges, and accepting state', 'load sample NFA and render input graph', true, () => { elements.exampleBtn.handlers.click(); const svg = elements.nfaDiagram.innerHTML; return ['>q0</text>', '>q1</text>', 'is-accepting', 'marker-end', '>0</text>', 'text-anchor="start"', '>START</text>'].every(token => svg.includes(token)); });
test('Reset button', 'click reset after loading sample', true, () => { elements.clearBtn.handlers.click(); return vm.runInContext('machine', context) === null && elements.results.hidden && !elements.empty.hidden; });

console.log(JSON.stringify(report, null, 2));
if (report.some(row => row.status !== 'PASS')) process.exitCode = 1;
