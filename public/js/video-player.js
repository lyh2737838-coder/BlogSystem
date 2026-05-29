// 自定义视频播放器
// 用法: VideoPlayer.mount(hostEl, { src, poster })
// 返回 { destroy() } 用于路由切换时清理

(function () {
  const ICON = {
    play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    volHigh: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.23v2.06A7 7 0 0 1 19 12a7 7 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12a9 9 0 0 0-7-8.77z"/></svg>',
    volMute: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45a4.4 4.4 0 0 0 .05-.63zM19 12a7 7 0 0 1-.7 3.04l1.5 1.5A8.96 8.96 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06A7 7 0 0 1 19 12zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25a7 7 0 0 1-2.25 1.2v2.07a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    pip: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 7h-8v6h8V7zm2-4H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H3V4.97h18V19z"/></svg>',
    fsOpen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    fsClose: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>',
    speed: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.46 10A8 8 0 1 0 4 14a8 8 0 0 0 15.46-4zM12 18a6 6 0 1 1 6-6 6 6 0 0 1-6 6zm.86-9.86L9 14l6-3.86z"/></svg>',
  };

  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(sec).padStart(2, '0');
  };

  function mount(host, { src, poster }) {
    host.innerHTML = `
      <div class="vplayer" tabindex="0">
        <video class="vp-video" preload="metadata" ${poster ? `poster="${poster}"` : ''} src="${src}"></video>
        <button class="vp-big-play" aria-label="播放">${ICON.play}</button>
        <div class="vp-controls">
          <div class="vp-progress">
            <div class="vp-progress-track">
              <div class="vp-progress-buffered"></div>
              <div class="vp-progress-played"></div>
              <div class="vp-progress-thumb"></div>
            </div>
            <div class="vp-progress-tip">0:00</div>
          </div>
          <div class="vp-bar">
            <button class="vp-btn vp-play-btn" aria-label="播放/暂停">${ICON.play}</button>
            <div class="vp-volume">
              <button class="vp-btn vp-mute-btn" aria-label="静音">${ICON.volHigh}</button>
              <input class="vp-vol-slider" type="range" min="0" max="1" step="0.01" value="1" />
            </div>
            <div class="vp-time"><span class="vp-cur">0:00</span> / <span class="vp-dur">0:00</span></div>
            <div class="vp-spacer"></div>
            <div class="vp-speed">
              <button class="vp-btn vp-speed-btn" aria-label="倍速">1×</button>
              <div class="vp-speed-menu">
                ${[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => `<button data-rate="${r}" class="${r === 1 ? 'active' : ''}">${r}×</button>`).join('')}
              </div>
            </div>
            <button class="vp-btn vp-pip-btn" aria-label="画中画" title="画中画">${ICON.pip}</button>
            <button class="vp-btn vp-fs-btn" aria-label="全屏">${ICON.fsOpen}</button>
          </div>
        </div>
      </div>
    `;

    const root = host.querySelector('.vplayer');
    const video = host.querySelector('.vp-video');
    const bigPlay = host.querySelector('.vp-big-play');
    const playBtn = host.querySelector('.vp-play-btn');
    const muteBtn = host.querySelector('.vp-mute-btn');
    const volSlider = host.querySelector('.vp-vol-slider');
    const curEl = host.querySelector('.vp-cur');
    const durEl = host.querySelector('.vp-dur');
    const progress = host.querySelector('.vp-progress');
    const track = host.querySelector('.vp-progress-track');
    const buffered = host.querySelector('.vp-progress-buffered');
    const played = host.querySelector('.vp-progress-played');
    const thumb = host.querySelector('.vp-progress-thumb');
    const tip = host.querySelector('.vp-progress-tip');
    const speedBtn = host.querySelector('.vp-speed-btn');
    const speedMenu = host.querySelector('.vp-speed-menu');
    const pipBtn = host.querySelector('.vp-pip-btn');
    const fsBtn = host.querySelector('.vp-fs-btn');

    // ---- 播放/暂停 ----
    const togglePlay = () => video.paused ? video.play() : video.pause();
    bigPlay.addEventListener('click', togglePlay);
    playBtn.addEventListener('click', togglePlay);
    video.addEventListener('click', togglePlay);
    video.addEventListener('play', () => {
      root.classList.add('is-playing');
      playBtn.innerHTML = ICON.pause;
      bigPlay.innerHTML = ICON.pause;
    });
    video.addEventListener('pause', () => {
      root.classList.remove('is-playing');
      playBtn.innerHTML = ICON.play;
      bigPlay.innerHTML = ICON.play;
    });

    // ---- 时间 / 进度 ----
    const updateProgress = () => {
      const d = video.duration || 0;
      const c = video.currentTime || 0;
      const pct = d > 0 ? (c / d) * 100 : 0;
      played.style.width = pct + '%';
      thumb.style.left = pct + '%';
      curEl.textContent = fmtTime(c);
    };
    const updateBuffered = () => {
      const d = video.duration || 0;
      if (d <= 0 || !video.buffered.length) return;
      const end = video.buffered.end(video.buffered.length - 1);
      buffered.style.width = ((end / d) * 100) + '%';
    };
    video.addEventListener('loadedmetadata', () => { durEl.textContent = fmtTime(video.duration); updateProgress(); });
    video.addEventListener('timeupdate', updateProgress);
    video.addEventListener('progress', updateBuffered);

    // ---- 进度条 点击 / 拖拽 / hover tooltip ----
    let dragging = false;
    const seekFromEvent = (e) => {
      const r = track.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
      const ratio = r.width > 0 ? x / r.width : 0;
      if (isFinite(video.duration)) video.currentTime = ratio * video.duration;
    };
    const showTip = (e) => {
      const r = track.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX - r.left, 0), r.width);
      const ratio = r.width > 0 ? x / r.width : 0;
      tip.style.left = x + 'px';
      tip.textContent = fmtTime((video.duration || 0) * ratio);
    };
    progress.addEventListener('mousemove', showTip);
    track.addEventListener('mousedown', (e) => {
      dragging = true;
      seekFromEvent(e);
    });
    window.addEventListener('mousemove', (e) => { if (dragging) { seekFromEvent(e); showTip(e); } });
    window.addEventListener('mouseup', () => { dragging = false; });

    // ---- 音量 ----
    volSlider.addEventListener('input', () => {
      video.volume = parseFloat(volSlider.value);
      video.muted = video.volume === 0;
    });
    muteBtn.addEventListener('click', () => {
      video.muted = !video.muted;
    });
    video.addEventListener('volumechange', () => {
      const muted = video.muted || video.volume === 0;
      muteBtn.innerHTML = muted ? ICON.volMute : ICON.volHigh;
      volSlider.value = muted ? 0 : video.volume;
    });

    // ---- 倍速 ----
    speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      speedMenu.classList.toggle('open');
    });
    speedMenu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-rate]');
      if (!b) return;
      const rate = parseFloat(b.dataset.rate);
      video.playbackRate = rate;
      speedBtn.textContent = rate + '×';
      speedMenu.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      speedMenu.classList.remove('open');
    });
    document.addEventListener('click', () => speedMenu.classList.remove('open'));

    // ---- 画中画 ----
    if (document.pictureInPictureEnabled) {
      pipBtn.addEventListener('click', async () => {
        try {
          if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
          else await video.requestPictureInPicture();
        } catch (_) {}
      });
    } else {
      pipBtn.style.display = 'none';
    }

    // ---- 全屏 ----
    const isFs = () => document.fullscreenElement === root;
    fsBtn.addEventListener('click', () => {
      if (isFs()) document.exitFullscreen();
      else root.requestFullscreen?.();
    });
    document.addEventListener('fullscreenchange', () => {
      fsBtn.innerHTML = isFs() ? ICON.fsClose : ICON.fsOpen;
      root.classList.toggle('is-fullscreen', isFs());
    });

    // ---- 控件自动隐藏 ----
    let hideTimer;
    const showControls = () => {
      root.classList.remove('hide-controls');
      clearTimeout(hideTimer);
      if (!video.paused) hideTimer = setTimeout(() => root.classList.add('hide-controls'), 2500);
    };
    root.addEventListener('mousemove', showControls);
    root.addEventListener('mouseleave', () => {
      if (!video.paused) root.classList.add('hide-controls');
    });
    video.addEventListener('pause', () => { clearTimeout(hideTimer); root.classList.remove('hide-controls'); });
    video.addEventListener('play', showControls);

    // ---- 键盘 ----
    const onKey = (e) => {
      if (!root.contains(document.activeElement) && !isFs()) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') { video.currentTime = Math.min((video.currentTime || 0) + 5, video.duration || 0); }
      else if (e.key === 'ArrowLeft') { video.currentTime = Math.max((video.currentTime || 0) - 5, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); }
      else if (e.key === 'm') { video.muted = !video.muted; }
      else if (e.key === 'f') { fsBtn.click(); }
    };
    document.addEventListener('keydown', onKey);

    return {
      destroy() {
        try { video.pause(); } catch (_) {}
        document.removeEventListener('keydown', onKey);
        host.innerHTML = '';
      },
    };
  }

  window.VideoPlayer = { mount };
})();
