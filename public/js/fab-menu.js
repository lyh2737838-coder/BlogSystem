// BlogSystem · 右下角快速菜单 (Speed Dial FAB)
(function () {
  // ---------- 菜单项 ----------
  const items = [
    { icon: '✏️', label: '写文章', action: () => { location.hash = '#/write'; } },
    { icon: '✉️', label: '私信',   action: () => { location.hash = '#/messages'; } },
    { icon: '🔍', label: '搜索',   action: () => { const i = document.getElementById('search-input'); if (i) { i.focus(); i.select(); } } },
    { icon: '🔔', label: '通知',   action: () => { location.hash = '#/notifications'; } },
    { icon: '🏠', label: '首页',   action: () => { location.hash = '#/'; } },
    { icon: '👤', label: '个人',   action: () => { location.hash = '#/me'; } },
  ];

  // ---------- 渲染 ----------
  const root = document.createElement('div');
  root.id = 'fab-root';
  root.innerHTML = `
    <div class="fab-items" id="fab-items">
      ${items.map((it, i) => `
        <div class="fab-slot" data-i="${i}">
          <span class="fab-label">${it.label}</span>
          <div class="fab-circle">${it.icon}</div>
        </div>
      `).join('')}
    </div>
    <div class="fab-toggle" id="fab-toggle">
      <span class="fab-plus">＋</span>
    </div>
  `;
  document.body.appendChild(root);

  // ---------- 展开/收起 ----------
  const toggle = document.getElementById('fab-toggle');
  const slots = [...document.querySelectorAll('.fab-slot')];
  let open = false;
  const GAP = 64; // 每个项目间距

  function setOpen(state) {
    open = state;
    toggle.classList.toggle('fab-open', open);
    slots.forEach((el, i) => {
      const offset = (slots.length - i) * GAP;
      if (open) {
        el.style.transitionDelay = (i * 0.04) + 's';
        el.style.transform = `translateY(-${offset}px)`;
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      } else {
        el.style.transitionDelay = ((slots.length - i) * 0.03) + 's';
        el.style.transform = 'translateY(0)';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }
    });
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });

  slots.forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(false);
      const idx = parseInt(el.dataset.i);
      items[idx]?.action();
    });
  });

  document.addEventListener('click', () => { if (open) setOpen(false); });

  // ---------- 样式 ----------
  const style = document.createElement('style');
  style.textContent = `
    #fab-root {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .fab-items {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      margin-bottom: 8px;
    }
    .fab-slot {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: -10px;
      cursor: pointer;
      user-select: none;
      opacity: 0;
      pointer-events: none;
      transform: translateY(0);
      transition: transform .45s cubic-bezier(.34,1.56,.64,1),
                  opacity .25s ease;
    }
    .fab-label {
      background: rgba(0,0,0,.7);
      backdrop-filter: blur(8px);
      color: #fff;
      font-size: 13px;
      padding: 5px 12px;
      border-radius: 8px;
      white-space: nowrap;
      border: 1px solid rgba(255,255,255,.1);
      pointer-events: none;
    }
    .fab-circle {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ff2d75, #ff6a3d);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 18px;
      box-shadow: 0 4px 16px rgba(255,45,117,.35);
      transition: transform .2s, box-shadow .2s;
      flex-shrink: 0;
    }
    .fab-slot:hover .fab-circle {
      transform: scale(1.12);
      box-shadow: 0 6px 24px rgba(255,45,117,.5);
    }
    .fab-slot:hover .fab-label {
      background: rgba(0,0,0,.85);
    }
    .fab-toggle {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #7b2ff7, #f107a3);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(123,47,247,.4);
      transition: transform .4s, box-shadow .3s;
      border: 2px solid rgba(255,255,255,.15);
      position: relative;
      z-index: 5;
    }
    .fab-toggle:hover {
      box-shadow: 0 6px 28px rgba(123,47,247,.55);
    }
    .fab-plus {
      color: #fff;
      font-size: 28px;
      line-height: 1;
      transition: transform .4s;
    }
    .fab-open .fab-plus {
      transform: rotate(135deg);
    }
    @media (max-width: 640px) {
      #fab-root { bottom: 20px; right: 16px; }
      .fab-circle { width: 42px; height: 42px; font-size: 16px; }
      .fab-toggle { width: 48px; height: 48px; }
      .fab-plus { font-size: 24px; }
      .fab-label { font-size: 12px; padding: 4px 10px; }
      .fab-slot { gap: 8px; margin-top: -8px; }
    }
  `;
  document.head.appendChild(style);
})();
