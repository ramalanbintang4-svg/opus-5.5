// On-screen controls for touch devices: d-pad, jump, mine, place, drag-to-look.
export function setupTouch(api) {
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!isTouch) return;
  document.body.classList.add('touch-device');
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="dpad">
      <button data-key="KeyW" class="t-up" aria-label="Move forward">&#9650;</button>
      <button data-key="KeyA" class="t-left" aria-label="Move left">&#9664;</button>
      <button data-key="KeyD" class="t-right" aria-label="Move right">&#9654;</button>
      <button data-key="KeyS" class="t-down" aria-label="Move back">&#9660;</button>
    </div>
    <div class="actions">
      <button data-act="mine" aria-label="Mine or attack">Mine</button>
      <button data-act="place" aria-label="Place block">Place</button>
      <button data-key="Space" class="t-jump" aria-label="Jump">Jump</button>
      <button data-key="ShiftLeft" aria-label="Sneak">Sneak</button>
    </div>
    <div class="top">
      <button data-act="inv" aria-label="Inventory">Inv</button>
      <button data-act="pause" aria-label="Pause">II</button>
    </div>`;
  document.body.appendChild(root);

  for (const b of root.querySelectorAll('button')) {
    const down = (e) => {
      e.preventDefault();
      b.classList.add('down');
      if (b.dataset.key) api.keys.add(b.dataset.key);
      const a = b.dataset.act;
      if (a === 'mine') { api.mouse.left = true; api.onMine(); }
      if (a === 'place') { api.mouse.right = true; api.onPlace(); }
      if (a === 'inv') api.onInventory();
      if (a === 'pause') api.onPause();
    };
    const up = (e) => {
      e.preventDefault();
      b.classList.remove('down');
      if (b.dataset.key) api.keys.delete(b.dataset.key);
      if (b.dataset.act === 'mine') api.mouse.left = false;
      if (b.dataset.act === 'place') api.mouse.right = false;
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  }

  // drag to look on the canvas
  const looks = new Map();
  api.canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  api.canvas.addEventListener('pointermove', (e) => {
    const p = looks.get(e.pointerId);
    if (!p) return;
    api.look(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY;
  });
  const end = (e) => looks.delete(e.pointerId);
  api.canvas.addEventListener('pointerup', end);
  api.canvas.addEventListener('pointercancel', end);
}
