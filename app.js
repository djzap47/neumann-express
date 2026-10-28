(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { Machine, assemble, decode } = Neumann;
  const programs = {
    addition: { description: 'Pick up 7, add 9, and deliver 16. Your first trip through fetch, decode and execute.', source: '; The first delivery: 7 + 9\n00: LOAD 20\n01: ADD 21\n02: STORE 22\n03: OUT\n04: HALT\n\n20: DAT 7\n21: DAT 9\n22: DAT 0' },
    countdown: { description: 'Deliver 3, 2, 1, then stop. Follow the program counter as it loops and branches.', source: '; Countdown express\n00: LOAD 20\n01: OUT\n02: SUB 21\n03: JZ 05\n04: JMP 01\n05: HALT\n\n20: DAT 3\n21: DAT 1' },
    double: { description: 'Take a number from the input queue, double its value, and deliver the result.', source: '; Double the incoming cargo\n00: IN\n01: STORE 20\n02: ADD 20\n03: OUT\n04: HALT\n\n20: DAT 0' },
    rewrite: { description: 'Instructions are stored words too. Watch STORE replace OUT at address 03 with HALT.', source: '; A program can change its own instructions\n00: LOAD 20\n01: STORE 03\n02: LOAD 21\n03: OUT\n04: HALT\n\n20: DAT 900 ; HALT encoded as a word\n21: DAT 42' },
    repair: { description: 'Something is wrong with the timetable. It should deliver 16. Repair the instruction and assemble again.', source: '; Mission: deliver 16, not -2\n00: LOAD 20\n01: SUB 21 ; is this the right operation?\n02: OUT\n03: HALT\n\n20: DAT 7\n21: DAT 9' }
  };
  let machine, loadedMemory, timer = null, words = false, selected = null, mission = null, animation = null;
  const rates = [0.5, 1, 2, 4];
  const regInfo = [['pc', 'PC', 'Next instruction'], ['ir', 'IR', 'Current instruction'], ['acc', 'ACC', 'Working value'], ['mar', 'MAR', 'Memory address'], ['mdr', 'MDR', 'Transferred word']];
  function parseInput() {
    const raw = $('input-values').value.trim();
    if (!raw) return [];
    const values = raw.split(',').map(x => x.trim());
    if (values.some(x => !/^-?\d+$/.test(x) || Number(x) < -9999 || Number(x) > 9999)) throw new Error('Input must be comma-separated integers between -9999 and 9999.');
    return values.map(Number);
  }
  function feedback(message, error = false) { $('editor-feedback').textContent = message; $('editor-feedback').classList.toggle('error-text', error); }
  function pause() { if (timer) clearInterval(timer); timer = null; }
  function reset() {
    pause();
    if (animation) { animation.cancel(); animation = null; }
    try { machine = new Machine(loadedMemory, parseInput(), Number($('latency').value)); feedback('Ready. The assembled timetable is loaded.'); }
    catch (e) { feedback(e.message, true); }
    render();
  }
  function loadProgram(key) {
    pause(); $('source').value = programs[key].source; $('route-description').textContent = programs[key].description;
    $('program-select').value = key; loadedMemory = assemble(programs[key].source); selected = null;
    reset();
  }
  function animateTrain() {
    if (animation) animation.cancel();
    const s = machine.s, previous = machine.history[machine.history.length - 1];
    if (!s.route || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const duration = Math.min(900, 900 / rates[Number($('speed').value) - 1]);
    const running = [];
    const move = (id, path, fraction = 1, delay = 0) => running.push($(id).animate(path.map(transform => ({ transform })), { duration: duration * fraction, delay: duration * delay, easing: 'ease-in-out', fill: 'both' }));
    if (s.route === 'memory') {
      const starting = !previous?.pending;
      const kind = s.pending?.kind || previous?.pending?.kind || (previous?.phase === 'fetch' ? 'fetch' : 'data');
      const writing = kind === 'data' && s.decoded?.op === 'STORE';
      if (starting) move('request-train', ['translate(411px, 154px)', 'translate(245px, 154px)'], s.pending ? 1 : .42);
      if (!s.pending) {
        const path = ['translate(245px, 209px)', 'translate(411px, 209px)'];
        move('train', writing ? path.reverse() : path, starting ? .52 : 1, starting ? .48 : 0);
      }
    }
    if (s.route === 'input') move('train', ['translate(130px, 327px)', 'translate(545px, 327px)', 'translate(545px, 275px)']);
    if (s.route === 'output') move('train', ['translate(635px, 275px)', 'translate(635px, 327px)', 'translate(690px, 327px)']);
    animation = { cancel: () => running.forEach(item => item.cancel()) };
  }
  function renderMap() {
    const s = machine.s, previous = machine.history[machine.history.length - 1];
    const memoryTransfer = s.route === 'memory';
    const kind = s.pending?.kind || previous?.pending?.kind || (previous?.phase === 'fetch' ? 'fetch' : 'data');
    const writing = memoryTransfer && kind === 'data' && s.decoded?.op === 'STORE';
    const address = String(s.mar).padStart(2, '0');
    $('map-request').textContent = memoryTransfer ? `${writing ? 'WRITE' : 'READ'} address ${address}` : 'Waiting for dispatch';
    $('map-cargo').textContent = memoryTransfer ? s.pending ? `Waiting · ${s.pending.remaining} ticks left` : `${writing ? '←' : '→'} ${s.mdr}${kind === 'fetch' ? ` · ${decode(s.mdr)?.text || 'unknown word'}` : ' · value'}` : 'Cargo track clear';
    $('request-track').classList.toggle('track-active', memoryTransfer);
    $('data-track').classList.toggle('track-active', memoryTransfer && !s.pending);
    $('request-train').style.opacity = memoryTransfer ? '1' : '.4';
    $('request-train').setAttribute('transform', `translate(${memoryTransfer ? 245 : 365} 154)`);
    $('train').style.opacity = s.route && !s.pending ? '1' : '.4';
    $('train').setAttribute('transform', s.route === 'output' ? 'translate(690 327)' : s.route === 'input' ? 'translate(545 275)' : `translate(${memoryTransfer && !s.pending ? writing ? 245 : 411 : 270} 209)`);
    let title = 'Ready to depart', detail = 'Press Step or Depart to follow the first instruction.';
    if (s.error) { title = 'Signal error'; detail = s.error; }
    else if (s.halted) { title = 'Journey complete'; detail = 'HALT has stopped the CPU. Your deliveries stay on the output platform.'; }
    else if (s.pending) { title = `Memory is preparing ${kind === 'fetch' ? 'an instruction' : 'a data transfer'}`; detail = `Request: ${writing ? 'write to' : 'read from'} platform ${address}. The CPU waits ${s.pending.remaining} more ticks.`; }
    else if (memoryTransfer && kind === 'fetch') { title = `Fetched ${decode(s.ir)?.text || s.ir}`; detail = `Word ${s.ir} arrived from platform ${address}. The control unit will decode it next.`; }
    else if (previous?.phase === 'decode') { title = `Decoded ${s.decoded.text}`; detail = 'The dispatcher has identified the operation. Execute is next.'; }
    else if (s.cycles) {
      const op = s.decoded?.op;
      if (op === 'ADD' || op === 'SUB') { title = `${previous.acc} ${op === 'ADD' ? '+' : '−'} ${s.mdr} = ${s.acc}`; detail = `The ALU ${op === 'ADD' ? 'added' : 'subtracted'} the value from platform ${address}. ACC now holds ${s.acc}.`; }
      else if (op === 'LOAD') { title = `Loaded ${s.acc} into the CPU`; detail = `Platform ${address} → cargo track → ACC.`; }
      else if (op === 'STORE') { title = `Stored ${s.acc} at platform ${address}`; detail = 'The working value travelled from the CPU to memory on the cargo track.'; }
      else if (op === 'OUT') { title = `Delivered ${s.acc} to output`; detail = 'A new arrival is now visible on the output platform beside this message.'; }
      else if (op === 'IN') { title = `Received input ${s.acc}`; detail = 'The input terminal sent its next number into ACC.'; }
      else if (op === 'JMP' || op === 'JZ') { title = `Next stop: platform ${String(s.pc).padStart(2, '0')}`; detail = s.message; }
    }
    $('map-operation').textContent = title; $('map-detail').textContent = detail;
    $('map-operation').classList.toggle('error-text', Boolean(s.error));
    $('map-working-value').textContent = s.acc;
    $('map-output-values').innerHTML = s.output.length ? s.output.map((value, i) => `<span class="arrival${i === s.output.length - 1 ? ' latest' : ''}"><small>#${i + 1}</small>${value}</span>`).join('') : '<span class="empty-output">No deliveries yet</span>';
    $('map-output-count').textContent = s.output.length ? `${s.output.length} ${s.output.length === 1 ? 'delivery' : 'deliveries'} · latest: ${s.output[s.output.length - 1]}` : s.halted ? 'This journey produced no output' : 'Waiting at the platform';
    $('map-output-values').classList.toggle('just-delivered', s.route === 'output');
    $('map-output-values').scrollTop = $('map-output-values').scrollHeight;
  }
  function tick() {
    if (!machine || machine.s.halted) { pause(); render(); return; }
    machine.tick();
    if (machine.s.halted) pause();
    if (machine.s.cycles >= 3000 && !machine.s.halted) { pause(); feedback('Paused after 3000 ticks. Check for an infinite loop; you can continue with Step.', true); }
    render(); animateTrain();
  }
  function render() {
    if (!machine) return;
    const s = machine.s;
    $('play').innerHTML = timer ? 'Ⅱ <span>Pause</span>' : '▶ <span>Depart</span>';
    $('play').disabled = s.halted; $('step').disabled = s.halted; $('back').disabled = machine.history.length === 0;
    $('narration').textContent = s.message;
    $('narration').classList.toggle('error-text', Boolean(s.error));
    $('machine-status').textContent = s.error ? 'SIGNAL ERROR' : s.halted ? 'JOURNEY COMPLETE' : s.pending ? 'WAITING FOR MEMORY' : timer ? 'ON THE MOVE' : s.cycles ? 'AT A SIGNAL' : 'READY TO DEPART';
    $('machine-status').classList.toggle('error', Boolean(s.error));
    document.querySelectorAll('.phase').forEach(el => el.classList.toggle('current', el.dataset.phase === s.phase && !s.halted));
    ['cycles', 'instructions', 'waits'].forEach(k => $(k).textContent = s[k]);
    $('map-acc').textContent = `PC ${String(s.pc).padStart(2, '0')} · ACC ${s.acc}`;
    $('cu-room').setAttribute('fill', s.active === 'cpu' && s.cycles ? '#a6c78c' : '#c7d5be');
    $('alu-room').setAttribute('fill', s.active === 'alu' ? '#e9ae52' : '#e5c788');
    const grid = $('memory-grid');
    if (!grid.children.length) for (let i = 0; i < 32; i++) {
      const button = document.createElement('button'); button.className = 'memory-cell'; button.dataset.address = i;
      button.innerHTML = `<small>${String(i).padStart(2, '0')}</small><b></b>`;
      button.addEventListener('click', () => { selected = i; render(); }); grid.append(button);
    }
    [...grid.children].forEach((button, i) => {
      const decoded = decode(s.memory[i]);
      button.querySelector('b').textContent = words ? s.memory[i] : decoded ? decoded.text : s.memory[i];
      button.classList.toggle('next', s.pc === i && !s.halted); button.classList.toggle('touched', s.touched === i); button.classList.toggle('selected', selected === i);
      button.setAttribute('aria-label', `Address ${i}, word ${s.memory[i]}${decoded ? `, decodes as ${decoded.text}` : ', data'}`);
      button.setAttribute('aria-pressed', String(selected === i));
    });
    if (selected !== null) {
      const decoded = decode(s.memory[selected]);
      $('memory-inspector').textContent = `Platform ${String(selected).padStart(2, '0')} stores ${s.memory[selected]}. ${decoded ? `If fetched as an instruction: ${decoded.text}. It can also be read as numeric data.` : 'This is numeric data, not a valid instruction in this CPU.'} Edit the timetable and assemble to change the initial memory.`;
    } else $('memory-inspector').textContent = 'Select a platform to inspect its stored word. Labels show how words decode, not separate kinds of storage.';
    $('registers').innerHTML = regInfo.map(([key, name, help]) => `<div class="register ${key}"><div class="register-top"><b>${name}</b><strong>${s[key]}</strong></div><small>${help}</small></div>`).join('');
    $('output-values').innerHTML = s.output.length ? s.output.map(x => `<span class="cargo">${x}</span>`).join('') : '<span class="empty-output">Awaiting delivery…</span>';
    $('input-queue').innerHTML = s.input.length ? s.input.map(x => `<span class="cargo">${x}</span>`).join('') : '<span class="empty-output">Queue empty</span>';
    renderMap();
    renderMission();
  }
  function renderMission() {
    const banner = $('mission-banner'), s = machine.s;
    banner.hidden = !mission;
    if (!mission) return;
    const finished = s.halted && !s.error;
    let success = false, message = '';
    if (mission === 'repair') { success = finished && s.output.length === 1 && s.output[0] === 16; message = 'MISSION 01 · Repair the timetable and deliver exactly 16, then HALT.'; }
    if (mission === 'bottleneck') { success = finished && s.output[0] === 16 && s.latency === 6 && s.waits > 0; message = 'MISSION 02 · Choose a 6-tick memory transfer, then deliver 16. Compare clock ticks with the 1-tick run.'; }
    if (mission === 'rewrite') { success = finished && s.memory[3] === 900 && s.output.length === 0 && s.pc === 4; message = 'MISSION 03 · Watch address 03 become HALT. Run to the end without delivering output.'; }
    banner.classList.toggle('success', success);
    banner.textContent = success ? `✓ MISSION COMPLETE · ${mission === 'bottleneck' ? `${s.waits} of ${s.cycles} ticks were spent waiting for memory.` : mission === 'rewrite' ? 'A stored instruction changed, and the CPU followed the new route.' : 'The repaired timetable delivered 16.'}` : message;
  }
  function switchTab(tab) {
    pause();
    document.querySelectorAll('.tab-panel').forEach(el => el.hidden = el.id !== tab);
    document.querySelectorAll('.nav-link').forEach(el => { el.classList.toggle('active', el.dataset.tab === tab); if (el.dataset.tab === tab) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    render();
  }
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  document.querySelectorAll('[data-mission]').forEach(button => button.addEventListener('click', () => { mission = button.dataset.mission; loadProgram(mission === 'bottleneck' ? 'addition' : mission); switchTab('simulator'); $('simulator').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }));
  $('program-select').addEventListener('change', e => { mission = e.target.value === 'repair' ? 'repair' : null; loadProgram(e.target.value); });
  $('play').addEventListener('click', () => { if (timer) pause(); else timer = setInterval(tick, 1000 / rates[Number($('speed').value) - 1]); render(); });
  $('step').addEventListener('click', () => { pause(); tick(); });
  $('back').addEventListener('click', () => { pause(); if (animation) animation.cancel(); machine.back(); render(); });
  $('reset').addEventListener('click', () => { if (animation) animation.cancel(); reset(); });
  $('latency').addEventListener('change', reset);
  $('speed').addEventListener('input', () => { $('speed-value').textContent = `${rates[Number($('speed').value) - 1]}×`; if (timer) { pause(); timer = setInterval(tick, 1000 / rates[Number($('speed').value) - 1]); } });
  $('memory-format').addEventListener('click', () => { words = !words; $('memory-format').textContent = words ? 'Show instructions' : 'Show words'; render(); });
  $('assemble').addEventListener('click', () => {
    pause();
    if (animation) { animation.cancel(); animation = null; }
    try { const memory = assemble($('source').value); const input = parseInput(); loadedMemory = memory; machine = new Machine(memory, input, Number($('latency').value)); feedback('Assembled successfully. Your new timetable is ready.'); }
    catch (e) { feedback(e.message, true); }
    render();
  });
  $('download').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([$('source').value], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = 'neumann-route.asm'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  $('tour-button').addEventListener('click', () => $('tour').showModal());
  $('close-tour').addEventListener('click', () => $('tour').close());
  $('start-tour').addEventListener('click', () => $('tour').close());
  $('tour').addEventListener('click', e => { if (e.target === $('tour')) { const r = $('tour').getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) $('tour').close(); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); render(); } });
  loadProgram('addition');
})();
