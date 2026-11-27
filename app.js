const $ = (id) => document.getElementById(id);
let machine = null;

function parseList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

// Validate the form before constructing any DFA state.
function parseNfa() {
  const states = parseList($('states').value);
  const alphabet = parseList($('alphabet').value);
  const start = $('start').value.trim();
  const finals = parseList($('finals').value);
  const lines = $('transitions').value.split(/\r?\n/)
    .map((value, index) => ({ value: value.trim(), line: index + 1 }))
    .filter(({ value }) => value);

  if (!states.length) throw Error('Enter at least one state.');
  if (new Set(states).size !== states.length) throw Error('State names must be unique.');
  if (!alphabet.length) throw Error('Enter at least one input symbol.');
  if (new Set(alphabet).size !== alphabet.length) throw Error('Alphabet symbols must be unique.');
  if (alphabet.some((symbol) => [...symbol].length !== 1)) {
    throw Error('Use one character per alphabet symbol.');
  }
  if (alphabet.includes('ε') || alphabet.includes('eps')) {
    throw Error('This version handles ordinary NFAs without ε-transitions.');
  }
  if (!states.includes(start)) throw Error(`Start state “${start}” is not in the states list.`);
  for (const finalState of finals) {
    if (!states.includes(finalState)) {
      throw Error(`Accepting state “${finalState}” is not in the states list.`);
    }
  }

  // A missing state-symbol pair stays an empty set, as required for an NFA.
  const transitions = Object.create(null);
  states.forEach((state) => { transitions[state] = Object.create(null); });
  for (const { value, line } of lines) {
    const parts = value.split(',').map((part) => part.trim());
    if (parts.length !== 3 || parts.some((part) => !part)) {
      throw Error(`Line ${line}: use state, symbol, destination.`);
    }
    const [from, symbol, to] = parts;
    if (!states.includes(from)) throw Error(`Line ${line}: unknown source state “${from}”.`);
    if (!alphabet.includes(symbol)) throw Error(`Line ${line}: “${symbol}” is not in the alphabet.`);
    if (!states.includes(to)) throw Error(`Line ${line}: unknown destination state “${to}”.`);
    (transitions[from][symbol] ??= new Set()).add(to);
  }

  return { states, alphabet, start, finals: new Set(finals), transitions };
}

function subsetName(subset) {
  return subset.size ? `{${[...subset].join(',')}}` : '∅';
}

// Breadth-first subset construction visits every reachable subset exactly once.
function convert() {
  $('error').hidden = true;
  $('testResult').hidden = true;
  machine = null;
  $('results').hidden = true;
  $('empty').hidden = false;
  $('status').textContent = 'AWAITING INPUT';
  $('status').classList.remove('ready');

  try {
    const nfa = parseNfa();
    const sets = [];
    const known = new Map();
    const queue = [];
    const steps = [];

    function addSubset(subset) {
      // JSON encoding avoids collisions between state names containing separators.
      const key = JSON.stringify([...subset].sort(
        (left, right) => nfa.states.indexOf(left) - nfa.states.indexOf(right),
      ));
      if (!known.has(key)) {
        const id = sets.length;
        known.set(key, id);
        sets.push(new Set(subset));
        queue.push(id);
        steps.push({ kind: 'new', id, name: subsetName(subset), members: [...subset] });
      }
      return known.get(key);
    }

    const startId = addSubset(new Set([nfa.start]));
    const dfaTransitions = [];
    while (queue.length) {
      const fromId = queue.shift();
      const subset = sets[fromId];
      dfaTransitions[fromId] = Object.create(null);

      for (const symbol of nfa.alphabet) {
        const destination = new Set();
        const contributions = [];
        for (const state of subset) {
          const reached = nfa.transitions[state][symbol] || new Set();
          contributions.push(`${state}→${subsetName(reached)}`);
          for (const next of reached) destination.add(next);
        }
        const toId = addSubset(destination);
        dfaTransitions[fromId][symbol] = toId;
        steps.push({
          kind: 'move', from: fromId, symbol, to: toId,
          contributions, destination: [...destination],
        });
      }
    }

    machine = { ...nfa, nfaTransitions: nfa.transitions, sets, transitions: dfaTransitions, trans: dfaTransitions, startId };
    render(steps);
    $('status').textContent = 'DFA BUILT';
    $('status').classList.add('ready');
  } catch (error) {
    $('error').textContent = error.message;
    $('error').hidden = false;
  }
}

// Draw states in discovery order; group symbols that share the same directed edge.
function renderNfaDiagram() {
  const { states, start, finals, alphabet, nfaTransitions } = machine;
  const count = states.length;
  const width = Math.max(680, 190 + Math.max(0, count - 1) * 165);
  const height = 330;
  const centerY = 174;
  const radius = 35;
  const xPositions = count === 1
    ? [width / 2]
    : states.map((_, index) => 95 + index * (width - 190) / (count - 1));
  const stateIndex = new Map(states.map((state, index) => [state, index]));
  const edgeGroups = new Map();

  for (const fromState of states) {
    for (const symbol of alphabet) {
      for (const toState of nfaTransitions[fromState][symbol] || []) {
        const from = stateIndex.get(fromState);
        const to = stateIndex.get(toState);
        const key = `${from}:${to}`;
        if (!edgeGroups.has(key)) edgeGroups.set(key, { from, to, symbols: [] });
        edgeGroups.get(key).symbols.push(symbol);
      }
    }
  }

  const edges = [...edgeGroups.values()].map(({ from, to, symbols }) => {
    const fromX = xPositions[from];
    const toX = xPositions[to];
    const label = symbols.map(escapeHtml).join(', ');
    if (from === to) {
      return `<path class="dfa-edge nfa-edge" d="M ${fromX - radius * 0.7} ${centerY - radius * 0.55} C ${fromX - 58} ${centerY - 112}, ${fromX + 58} ${centerY - 112}, ${fromX + radius * 0.7} ${centerY - radius * 0.55}" marker-end="url(#nfaArrow)"/><text class="dfa-edge-label" x="${fromX}" y="${centerY - 84}" text-anchor="middle">${label}</text>`;
    }

    const forward = from < to;
    const startX = fromX + (forward ? radius : -radius);
    const endX = toX + (forward ? -radius : radius);
    const controlY = centerY + (forward ? -58 : 58);
    const controlX = (startX + endX) / 2;
    const labelY = (centerY + 2 * controlY + centerY) / 4 - 5;
    return `<path class="dfa-edge nfa-edge" d="M ${startX} ${centerY} Q ${controlX} ${controlY} ${endX} ${centerY}" marker-end="url(#nfaArrow)"/><text class="dfa-edge-label" x="${controlX}" y="${labelY}" text-anchor="middle">${label}</text>`;
  }).join('');

  const nodes = states.map((state, id) => {
    const x = xPositions[id];
    const accepting = finals.has(state);
    const isStart = state === start;
    const startLabelX = Math.max(4, x - 68);
    const startArrow = isStart
      ? `<path class="dfa-start-arrow" d="M ${startLabelX} ${centerY} H ${x - radius - 4}" marker-end="url(#nfaArrow)"/><text class="dfa-start-label" x="${startLabelX}" y="${centerY - 11}" text-anchor="start">START</text>`
      : '';
    return `${startArrow}<g class="dfa-node${accepting ? ' is-accepting' : ''}${isStart ? ' is-start' : ''}"><circle class="dfa-node-ring" cx="${x}" cy="${centerY}" r="${radius}"/>${accepting ? `<circle class="dfa-node-inner" cx="${x}" cy="${centerY}" r="${radius - 5}"/>` : ''}<text class="dfa-node-id" x="${x}" y="${centerY + 4}" text-anchor="middle">${escapeHtml(state)}</text></g>`;
  }).join('');

  const diagram = $('nfaDiagram');
  diagram.setAttribute('viewBox', `0 0 ${width} ${height}`);
  diagram.style.minWidth = `${width}px`;
  diagram.innerHTML = `<defs><marker id="nfaArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>${edges}${nodes}`;
}

function renderDiagram() {
  const count = machine.sets.length;
  const width = Math.max(680, 150 + Math.max(0, count - 1) * 165);
  const height = 330;
  const centerY = 174;
  const radius = 39;
  const xPositions = count === 1
    ? [width / 2]
    : machine.sets.map((_, index) => 75 + index * (width - 150) / (count - 1));
  const edgeGroups = new Map();

  for (let from = 0; from < count; from += 1) {
    for (const symbol of machine.alphabet) {
      const to = machine.transitions[from][symbol];
      const key = `${from}:${to}`;
      if (!edgeGroups.has(key)) edgeGroups.set(key, { from, to, symbols: [] });
      edgeGroups.get(key).symbols.push(symbol);
    }
  }

  const edges = [...edgeGroups.values()].map(({ from, to, symbols }) => {
    const fromX = xPositions[from];
    const toX = xPositions[to];
    const label = symbols.map(escapeHtml).join(', ');
    if (from === to) {
      return `<path class="dfa-edge" d="M ${fromX - radius * 0.7} ${centerY - radius * 0.55} C ${fromX - 60} ${centerY - 112}, ${fromX + 60} ${centerY - 112}, ${fromX + radius * 0.7} ${centerY - radius * 0.55}" marker-end="url(#dfaArrow)"/><text class="dfa-edge-label" x="${fromX}" y="${centerY - 84}" text-anchor="middle">${label}</text>`;
    }

    const forward = from < to;
    const startX = fromX + (forward ? radius : -radius);
    const endX = toX + (forward ? -radius : radius);
    const controlY = centerY + (forward ? -60 : 60);
    const controlX = (startX + endX) / 2;
    const labelY = (centerY + 2 * controlY + centerY) / 4 - 5;
    return `<path class="dfa-edge" d="M ${startX} ${centerY} Q ${controlX} ${controlY} ${endX} ${centerY}" marker-end="url(#dfaArrow)"/><text class="dfa-edge-label" x="${controlX}" y="${labelY}" text-anchor="middle">${label}</text>`;
  }).join('');

  const nodes = machine.sets.map((subset, id) => {
    const x = xPositions[id];
    const start = id === machine.startId;
    const accepting = [...subset].some((state) => machine.finals.has(state));
    const classes = `dfa-node${accepting ? ' is-accepting' : ''}${start ? ' is-start' : ''}`;
    const startArrowX = Math.max(4, x - 68);
    const startArrow = start
      ? `<path class="dfa-start-arrow" d="M ${startArrowX} ${centerY} H ${x - radius - 4}" marker-end="url(#dfaArrow)"/><text class="dfa-start-label" x="${startArrowX}" y="${centerY - 11}" text-anchor="start">START</text>`
      : '';
    return `${startArrow}<g class="${classes}"><circle class="dfa-node-ring" cx="${x}" cy="${centerY}" r="${radius}"/>${accepting ? `<circle class="dfa-node-inner" cx="${x}" cy="${centerY}" r="${radius - 5}"/>` : ''}<text class="dfa-node-id" x="${x}" y="${centerY + 4}" text-anchor="middle">D${id}</text><text class="dfa-node-set" x="${x}" y="${centerY + radius + 19}" text-anchor="middle">${escapeHtml(subsetName(subset))}</text></g>`;
  }).join('');

  const diagram = $('dfaDiagram');
  diagram.setAttribute('viewBox', `0 0 ${width} ${height}`);
  diagram.style.minWidth = `${width}px`;
  diagram.innerHTML = `<defs><marker id="dfaArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>${edges}${nodes}`;
}

function render(steps) {
  $('empty').hidden = true;
  $('results').hidden = false;
  $('summary').innerHTML = `<span class="chip">NFA states <b>${machine.states.length}</b></span><span class="chip">DFA states <b>${machine.sets.length}</b></span><span class="chip">Alphabet <b>${machine.alphabet.map(escapeHtml).join(', ')}</b></span>`;
  renderNfaDiagram();
  renderDiagram();

  const head = $('dfaTable').querySelector('thead');
  const body = $('dfaTable').querySelector('tbody');
  head.innerHTML = `<tr><th>DFA STATE</th>${machine.alphabet.map((symbol) => `<th>ON ${escapeHtml(symbol)}</th>`).join('')}<th>TYPE</th></tr>`;
  body.innerHTML = machine.sets.map((subset, id) => {
    const accepting = [...subset].some((state) => machine.finals.has(state));
    const cells = machine.alphabet.map((symbol) => {
      const destination = machine.sets[machine.transitions[id][symbol]];
      return `<td>${escapeHtml(subsetName(destination))}</td>`;
    }).join('');
    return `<tr><td>${id === machine.startId ? '→ ' : ''}${escapeHtml(subsetName(subset))}</td>${cells}<td>${accepting ? '<span class="accepting">ACCEPT</span>' : '—'}</td></tr>`;
  }).join('');

  $('steps').innerHTML = steps.map((step) => {
    if (step.kind === 'new') {
      const accepting = step.members.some((state) => machine.finals.has(state));
      return `<li>Discover DFA state <span class="set">D${step.id} = ${escapeHtml(step.name)}</span>${step.id === machine.startId ? ' — start state' : ''}${accepting ? ' — accepting state (contains an NFA final state)' : ''}.</li>`;
    }
    const contributionText = step.contributions.map(escapeHtml).join(', ') || 'no NFA states to inspect';
    const union = escapeHtml(subsetName(new Set(step.destination)));
    return `<li>From <span class="set">D${step.from} = ${escapeHtml(subsetName(machine.sets[step.from]))}</span> on <b>${escapeHtml(step.symbol)}</b>: ${contributionText}; union = <span class="set">${union}</span>. Therefore δ(D${step.from}, ${escapeHtml(step.symbol)}) = <span class="set">D${step.to}</span>.</li>`;
  }).join('');
  $('stepCount').textContent = `${steps.length} STEPS`;
}

function runTest() {
  if (!machine) {
    $('error').textContent = 'Build the DFA first.';
    $('error').hidden = false;
    return;
  }
  const input = $('testString').value;
  const invalidSymbol = [...input].find((symbol) => !machine.alphabet.includes(symbol));
  const output = $('testResult');
  output.hidden = false;
  if (invalidSymbol) {
    output.className = 'test-result fail';
    output.textContent = `Symbol “${invalidSymbol}” is outside the alphabet {${machine.alphabet.join(', ')}}.`;
    return;
  }

  let stateId = machine.startId;
  const path = [stateId];
  for (const symbol of input) {
    stateId = machine.transitions[stateId][symbol];
    path.push(stateId);
  }
  const accepted = [...machine.sets[stateId]].some((state) => machine.finals.has(state));
  output.className = `test-result ${accepted ? 'pass' : 'fail'}`;
  output.innerHTML = `<b>${accepted ? 'ACCEPTED ✓' : 'REJECTED ×'}</b> — ${input ? `“${escapeHtml(input)}”` : 'ε (empty string)'}<br><span style="opacity:.8">Path: ${path.map((id) => `D${id} ${escapeHtml(subsetName(machine.sets[id]))}`).join(' → ')}<br>Final state: D${stateId} = ${escapeHtml(subsetName(machine.sets[stateId]))}</span>`;
}

$('convertBtn').addEventListener('click', convert);
$('testBtn').addEventListener('click', runTest);
$('testString').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') runTest();
});
$('exampleBtn').addEventListener('click', () => {
  $('states').value = 'q0, q1';
  $('alphabet').value = '0, 1';
  $('start').value = 'q0';
  $('finals').value = 'q1';
  $('transitions').value = 'q0, 0, q0\nq0, 0, q1\nq0, 1, q0\nq1, 1, q1';
  convert();
});
$('clearBtn').addEventListener('click', () => {
  machine = null;
  $('results').hidden = true;
  $('empty').hidden = false;
  $('status').textContent = 'AWAITING INPUT';
  $('status').classList.remove('ready');
  $('error').hidden = true;
  $('testResult').hidden = true;
});
