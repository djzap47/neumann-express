(function (root) {
  'use strict';
  const OPS = { LOAD: 1, STORE: 2, ADD: 3, SUB: 4, JMP: 5, JZ: 6, IN: 7, OUT: 8, HALT: 9 };
  const NAMES = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
  const ADDRESS_OPS = new Set(['LOAD', 'STORE', 'ADD', 'SUB', 'JMP', 'JZ']);
  const clone = value => JSON.parse(JSON.stringify(value));
  function assemble(source) {
    const memory = Array(32).fill(0), used = new Set();
    let cursor = 0;
    source.split(/\r?\n/).forEach((raw, i) => {
      let line = raw.split(';')[0].trim().toUpperCase();
      if (!line) return;
      const fail = message => { throw new Error(`Line ${i + 1}: ${message}`); };
      const address = line.match(/^(\d+)\s*:\s*/);
      if (address) { cursor = Number(address[1]); line = line.slice(address[0].length); }
      if (cursor < 0 || cursor > 31) fail('address must be 0–31.');
      if (used.has(cursor)) fail(`address ${cursor} is already occupied.`);
      const parts = line.split(/\s+/), op = parts[0];
      let word;
      if (op === 'DAT') {
        if (parts.length !== 2 || !/^-?\d+$/.test(parts[1])) fail('use DAT followed by an integer.');
        word = Number(parts[1]);
        if (word < -9999 || word > 9999) fail('data must be between -9999 and 9999.');
      } else {
        if (!OPS[op]) fail(`unknown instruction “${op}”.`);
        if (ADDRESS_OPS.has(op)) {
          if (parts.length !== 2 || !/^\d+$/.test(parts[1]) || Number(parts[1]) > 31) fail(`${op} needs an address from 0 to 31.`);
          word = OPS[op] * 100 + Number(parts[1]);
        } else {
          if (parts.length !== 1) fail(`${op} takes no operand.`);
          word = OPS[op] * 100;
        }
      }
      memory[cursor] = word; used.add(cursor); cursor++;
    });
    if (!used.size) throw new Error('Add at least one instruction.');
    return memory;
  }
  function decode(word) {
    const op = NAMES[Math.floor(word / 100)], address = word % 100;
    if (!op || address < 0 || (ADDRESS_OPS.has(op) ? address > 31 : address !== 0)) return null;
    return { op, address, text: ADDRESS_OPS.has(op) ? `${op} ${String(address).padStart(2, '0')}` : op };
  }
  class Machine {
    constructor(memory, input = [], latency = 1) {
      this.s = { memory: memory.slice(), input: input.slice(), output: [], pc: 0, ir: 0, acc: 0, mar: 0, mdr: 0, phase: 'fetch', cycles: 0, instructions: 0, waits: 0, latency, pending: null, decoded: null, halted: false, error: '', route: '', active: 'cpu', touched: null, message: 'Ready at platform 00. Fetch the first instruction to begin.' };
      this.history = [];
    }
    back() { if (this.history.length) this.s = this.history.pop(); }
    transfer(kind, address) {
      const s = this.s;
      s.mar = address; s.touched = address; s.active = 'memory'; s.route = 'memory';
      s.pending = { kind, remaining: s.latency };
      this.advanceTransfer();
    }
    advanceTransfer() {
      const s = this.s, p = s.pending;
      p.remaining--;
      if (p.remaining > 0) {
        s.waits++;
        s.message = `Shared bus occupied: ${p.kind === 'fetch' ? 'instruction' : 'data'} transfer at address ${String(s.mar).padStart(2, '0')}. CPU waits (${p.remaining} ticks remaining).`;
        return;
      }
      s.pending = null;
      if (p.kind === 'fetch') {
        s.mdr = s.memory[s.mar]; s.ir = s.mdr; s.pc++; s.phase = 'decode';
        s.message = `FETCH · Memory[${s.mar}] → MDR → IR (${s.ir}). Program counter advances to ${s.pc}.`;
      } else {
        const op = s.decoded.op;
        if (op === 'STORE') { s.mdr = s.acc; s.memory[s.mar] = s.acc; }
        else {
          s.mdr = s.memory[s.mar];
          const before = s.acc;
          if (op === 'LOAD') s.acc = s.mdr;
          if (op === 'ADD') s.acc += s.mdr;
          if (op === 'SUB') s.acc -= s.mdr;
          if (s.acc < -9999 || s.acc > 9999) { s.acc = before; throw new Error('Arithmetic overflow: this teaching CPU supports -9999 to 9999.'); }
        }
        s.message = `EXECUTE · ${op} ${String(s.mar).padStart(2, '0')} · ${op === 'STORE' ? `Memory[${s.mar}] is now ${s.acc}.` : `ACC is now ${s.acc}.`}`;
        s.active = ['ADD', 'SUB'].includes(op) ? 'alu' : 'cpu';
        this.finish();
      }
    }
    finish() { this.s.instructions++; this.s.phase = 'fetch'; }
    tick() {
      const s = this.s;
      if (s.halted) return false;
      this.history.push(clone(s));
      if (this.history.length > 1000) this.history.shift();
      s.cycles++; s.route = ''; s.touched = null;
      try {
        if (s.pending) { s.route = 'memory'; s.touched = s.mar; this.advanceTransfer(); return true; }
        if (s.phase === 'fetch') {
          if (s.pc < 0 || s.pc > 31) throw new Error('Program counter left memory. Add HALT or a valid jump.');
          this.transfer('fetch', s.pc);
        } else if (s.phase === 'decode') {
          s.decoded = decode(s.ir);
          if (!s.decoded) throw new Error(`Word ${s.ir} is not a valid instruction. Check your jumps and shared memory.`);
          s.phase = 'execute'; s.active = 'cpu';
          s.message = `DECODE · Control unit reads ${s.decoded.text}. ${ADDRESS_OPS.has(s.decoded.op) ? `Operand selects memory address ${s.decoded.address}.` : 'No memory operand is needed.'}`;
        } else {
          const { op, address } = s.decoded;
          if (['LOAD', 'STORE', 'ADD', 'SUB'].includes(op)) this.transfer('data', address);
          else {
            s.active = 'cpu';
            if (op === 'JMP') { s.pc = address; s.message = `EXECUTE · JMP redirects the next fetch to address ${address}.`; }
            if (op === 'JZ') { if (s.acc === 0) s.pc = address; s.message = `EXECUTE · ACC is ${s.acc}. ${s.acc === 0 ? `Branch taken to ${address}.` : 'Branch not taken; continue in sequence.'}`; }
            if (op === 'IN') {
              if (!s.input.length) throw new Error('Input queue is empty. Reset and add input values before running.');
              s.acc = s.input.shift(); s.route = 'input'; s.active = 'input'; s.message = `EXECUTE · Input terminal sends ${s.acc} to ACC.`;
            }
            if (op === 'OUT') { s.output.push(s.acc); s.route = 'output'; s.active = 'output'; s.message = `EXECUTE · ACC delivers ${s.acc} to the output terminal.`; }
            if (op === 'HALT') { s.halted = true; s.message = 'HALT · Journey complete. The CPU has stopped.'; }
            this.finish();
          }
        }
      } catch (error) { s.error = error.message; s.halted = true; s.message = error.message; }
      return true;
    }
  }
  const api = { assemble, decode, Machine, OPS };
  root.Neumann = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
