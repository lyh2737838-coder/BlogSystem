// 文章特效模块 — typewriter / snow / sakura / bgm
let _cleanup = [];

function cleanupEffects() {
  _cleanup.forEach((fn) => { try { fn(); } catch (_) {} });
  _cleanup = [];
}

function applyEffects(effectsCSV, bgmUrl, containerEl) {
  cleanupEffects();
  const keys = (effectsCSV || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (keys.includes('typewriter') && containerEl) applyTypewriter(containerEl);
  if (keys.includes('snow')) applyParticles('snow');
  if (keys.includes('sakura')) applyParticles('sakura');
  if (bgmUrl) applyBgm(bgmUrl);
}

function applyTypewriter(container) {
  const paras = [...container.querySelectorAll('p, li, h1, h2, h3, h4')];
  paras.forEach((el) => {
    const text = el.innerHTML;
    el.dataset.twOrig = text;
    el.innerHTML = '';
    el.style.visibility = 'hidden';
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      io.unobserve(el);
      el.style.visibility = '';
      const chars = [...(el.dataset.twOrig || '')];
      let i = 0;
      el.innerHTML = '';
      const tid = setInterval(() => {
        el.innerHTML += chars[i++] || '';
        if (i >= chars.length) clearInterval(tid);
      }, 18);
    });
  }, { threshold: 0.1 });
  paras.forEach((el) => io.observe(el));
  _cleanup.push(() => {
    io.disconnect();
    paras.forEach((el) => {
      if (el.dataset.twOrig != null) { el.innerHTML = el.dataset.twOrig; delete el.dataset.twOrig; }
      el.style.visibility = '';
    });
  });
}

function applyParticles(type) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;
  const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
  window.addEventListener('resize', onResize);

  const COUNT = 60;
  const particles = Array.from({ length: COUNT }, () => ({
    x: Math.random() * W,
    y: Math.random() * H - H,
    r: Math.random() * 4 + 2,
    speed: Math.random() * 1.5 + 0.5,
    drift: Math.random() * 0.8 - 0.4,
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.05,
  }));

  let raf;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p) => {
      p.y += p.speed;
      p.x += p.drift;
      p.angle += p.spin;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
      if (type === 'snow') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.font = `${p.r * 3}px serif`;
        ctx.fillStyle = 'rgba(255,150,180,0.8)';
        ctx.fillText('✿', 0, 0);
        ctx.restore();
      }
    });
    raf = requestAnimationFrame(draw);
  }
  draw();
  _cleanup.push(() => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    canvas.remove();
  });
}

function applyBgm(url) {
  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = 0.4;

  const btn = document.createElement('button');
  btn.id = 'bgm-btn';
  btn.title = '背景音乐';
  btn.innerHTML = '🎵';
  btn.style.cssText = 'position:fixed;bottom:80px;right:24px;z-index:10000;width:44px;height:44px;border-radius:50%;border:none;background:var(--surface,#222);box-shadow:0 2px 12px rgba(0,0,0,.4);font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  document.body.appendChild(btn);

  let playing = false;
  const tryPlay = () => {
    if (playing) return;
    audio.play().then(() => { playing = true; btn.innerHTML = '🔊'; }).catch(() => {});
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playing) { audio.pause(); playing = false; btn.innerHTML = '🎵'; }
    else tryPlay();
  });
  document.addEventListener('click', tryPlay, { once: true });

  _cleanup.push(() => {
    audio.pause();
    btn.remove();
    document.removeEventListener('click', tryPlay);
  });
}

window.applyEffects = applyEffects;
window.cleanupEffects = cleanupEffects;
