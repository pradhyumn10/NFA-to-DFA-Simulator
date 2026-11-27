# NFA → DFA Simulator

A self-contained browser app for converting a user-defined NFA into an equivalent DFA with the subset construction. The application needs no installation, server, account, or build step.

## Run it

1. Open the `NFA-to-DFA-Simulator` folder.
2. Open `index.html` in a current browser (Chrome, Edge, Firefox, or Safari). Double-clicking the file is enough.
3. Edit the states, alphabet, start state, accepting states, and transitions. Each transition line uses `source, symbol, destination`. Multiple lines may share the same source and symbol to express nondeterminism.
4. Choose **Build equivalent DFA** to see both the entered NFA diagram and generated DFA diagram, the transition table, and the construction log, including the NFA transition contributions to each union.
5. Enter a string made from the alphabet and choose **Run test**. The simulator reports acceptance and the state path.

The included **Load example** button fills and builds the report's binary sample NFA, which accepts strings containing at least one `0`. Try `10` (accepted), `11` (rejected), or leave the string empty to test ε (rejected).

## Run the automated checks

The simulator itself does not need Node.js. To run the 22 regression checks, install Node.js 18 or later and run this from the project folder:

```sh
node tests/automata.test.cjs
```

The 22 checks cover transition determinism and nondeterminism, empty destinations, multiple and initial accepting states, unreachable states, accepted/rejected/empty strings, invalid state/alphabet references, explicit epsilon rejection, both examples' accepted/rejected strings, NFA and DFA graph output, and sample/reset button actions. See [docs/Project-Report.md](docs/Project-Report.md) for the M1/M2 project report and executed results.

User-supplied screenshots from the running browser are included in `docs/screenshots/` and embedded in the project report.

## Input rules and scope

- State names and alphabet symbols are comma-separated; symbols are single characters.
- Every transition is a separate `source, symbol, destination` line. Missing transitions go to the empty subset (∅), which loops to itself for every symbol.
- This project supports ordinary NFAs without ε-transitions. It rejects ε/eps as alphabet symbols to prevent silently incorrect conversions.
- DFA accepting subsets are exactly those that contain at least one NFA accepting state.
- All computation runs locally in the browser. The stylesheet may use Google Fonts when internet access is available; system fallbacks are used if it is offline.

## Files

- `index.html` — app entry point and interface
- `styles.css` — responsive styling
- `app.js` — input validation, subset construction, rendering, and string testing
- `tests/automata.test.cjs` — dependency-free automated regression tests (Node.js)
  

The JavaScript source is organized into named parsing, conversion, NFA/DFA diagram rendering, table/log rendering, and string-testing functions with comments on the algorithm and validation steps.

## Quick verification

Open `index.html`, press **Load example**, and confirm the diagram and table show `{q0}` and `{q0,q1}`. Test `10` for acceptance and `11` for rejection. To try the separate three-state NFA example, enter states `q0, q1, q2`, alphabet `a, b, c`, start `q0`, final `q2`, and these transitions:

```text
q0, a, q0
q0, a, q1
q0, b, q0
q1, c, q2
q2, b, q2
```

For that machine, `ac` and `bacb` accept, while `ab` and `abc` reject. The regression suite covers conversion, validation, string tests, diagram rendering, and the example/reset controls. No files need to be served over HTTP.
