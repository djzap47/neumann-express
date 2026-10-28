# Neumann Express
  A local, interactive von Neumann architecture simulator with an illustrated railway theme. No build tools, backend, API keys, or package installation required.
## Open locally

Open `index.html` in a modern browser. All simulation logic and artwork are local. Google Fonts is optional; the page falls back to system fonts offline.

Alternatively, if Python is installed, run `py -m http.server 8080` from this folder and open `http://localhost:8080`.

## Files

- `index.html` — simulator, field guide, missions, and SVG railway.
- `styles.css` — responsive visual design and reduced-motion support.
- `map-live.css` — two distinct railway tracks and the live activity/output board beside the map.
- `engine.js` — assembler and deterministic CPU state machine; independent of the UI.
- `app.js` — controls, visualization, examples, mission checks, and program download.

## Teaching model

32 shared memory words, decimal values from -9999 to 9999, accumulator-based arithmetic. Supported operations: LOAD, STORE, ADD, SUB, JMP, JZ, IN, OUT, HALT; DAT is an assembler directive. Memory-address operands are 0–31. Instructions encode as opcode × 100 + address; opcodes 1–9 follow the order above. IN, OUT and HALT have a zero operand. Execution starts at address 00.

Each normal fetch, decode or execute stage takes one tick. Fetch and LOAD/STORE/ADD/SUB transactions may take 1, 3 or 6 ticks; extra ticks count as memory waits. There is only one pending transfer at a time. The phase indicator shows the next stage, or the stage awaiting its memory transaction. This abstract timing model is for teaching, not physical processor timing.

Back restores up to 1,000 prior CPU snapshots, including modified memory, consumed input and output. Reset restores the last successfully assembled program. Editor changes take effect only when assembled; changing the memory latency resets the run. Input changes take effect on Reset or Assemble. A running loop automatically pauses after 3,000 ticks. Further manual steps are available.

The built-in programs cover addition, a conditional countdown, input doubling, and self-modifying code. Missions check observable outcomes; they are learning exercises, not secure grading.

The blue track represents address/control requests to memory. The orange track represents the data bus, carrying both instruction words and numeric values, including writes back to memory. These are two visual parts of the connection to one unified memory. A live board immediately below the railway displays the current operation, arithmetic, accumulator and output arrivals.
