// =========================================================================
//  BlogSystem · 单页前端
// =========================================================================

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- 主题 ----------
const THEMES = [
  { key: 'dark',  label: '暗色',     emoji: '🌙' },
  { key: 'light', label: '浅色',     emoji: '☀️' },
  { key: 'glass', label: '玻璃',     emoji: '🪟' },
  { key: 'paper', label: '复古纸',   emoji: '📜' },
  { key: 'cyber', label: '赛博',     emoji: '⚡' },
];

function applyTheme(key) {
  document.documentElement.setAttribute('data-theme', key);
  localStorage.setItem('blog_theme', key);
  updateHljsTheme(key);
  const btn = $('#theme-toggle');
  if (btn) btn.innerHTML = (THEMES.find(t => t.key === key) || THEMES[0]).emoji;
}

function cycleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const idx = THEMES.findIndex(t => t.key === cur);
  applyTheme(THEMES[(idx + 1) % THEMES.length].key);
}

function openThemePicker() {
  const cur = document.documentElement.getAttribute('data-theme');
  showModal(`
    <div class="modal theme-picker-pop">
      <h2>选择主题</h2>
      <div class="theme-swatches">
        ${THEMES.map(t => `
          <button class="theme-swatch ${t.key === cur ? 'active' : ''}" data-key="${t.key}">
            <span class="swatch-emoji">${t.emoji}</span>
            <span>${t.label}</span>
          </button>`).join('')}
      </div>
    </div>
  `);
  $$('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => { applyTheme(btn.dataset.key); hideModal(); });
  });
}

function initTheme() {
  const saved = localStorage.getItem('blog_theme') || 'dark';
  applyTheme(saved);
  const btn = $('#theme-toggle');
  btn.addEventListener('click', cycleTheme);
  btn.addEventListener('contextmenu', (e) => { e.preventDefault(); openThemePicker(); });
  let pressTimer;
  btn.addEventListener('pointerdown', () => { pressTimer = setTimeout(openThemePicker, 500); });
  btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
  btn.addEventListener('pointerleave', () => clearTimeout(pressTimer));
}

function updateHljsTheme(theme) {
  const link = $('#hljs-theme');
  link.href = (theme === 'dark' || theme === 'cyber')
    ? 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/atom-one-dark.min.css'
    : 'https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/atom-one-light.min.css';
}

// ---------- Toast ----------
function toast(msg, kind = 'info') {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

// ---------- Modal ----------
function showModal(html) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-overlay">${html}</div>`;
  root.querySelector('.modal-overlay').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) hideModal();
  });
}
function hideModal() { $('#modal-root').innerHTML = ''; }

function authModal(mode = 'login') {
  const isLogin = mode === 'login';
  showModal(`
    <div class="modal">
      <h2>${isLogin ? '欢迎回来 👋' : '加入 BlogSystem ✨'}</h2>
      <p class="modal-sub">${isLogin ? '继续记录你的想法' : '创建一个账号，开始写作'}</p>
      <form id="auth-form">
        ${isLogin ? '' : `
          <label>邮箱</label>
          <input name="email" type="email" placeholder="you@example.com" required />
        `}
        <label>${isLogin ? '用户名或邮箱' : '用户名'}</label>
        <input name="username" type="text" placeholder="${isLogin ? '用户名 / 邮箱' : '取一个独特的名字'}" required autofocus />
        <label>密码</label>
        <input name="password" type="password" placeholder="${isLogin ? '密码' : '至少 6 位'}" required />
        ${isLogin ? '<p class="hint">默认账号: admin / admin123 或 lyh / user123</p>' : ''}
        <button type="submit" class="btn btn-primary">${isLogin ? '登录' : '注册'}</button>
      </form>
      <p class="modal-switch">
        ${isLogin ? '还没有账号？' : '已经有账号？'}
        <a id="switch-auth">${isLogin ? '注册' : '登录'}</a>
      </p>
    </div>
  `);
  $('#switch-auth').addEventListener('click', () => authModal(isLogin ? 'register' : 'login'));
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    try {
      const r = isLogin ? await API.login(data) : await API.register(data);
      Auth.set(r.token, r.user);
      toast(isLogin ? `欢迎回来，${r.user.username}` : '注册成功！', 'success');
      hideModal();
      renderUserMenu();
      router();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

// ---------- 用户菜单 ----------
function renderUserMenu() {
  const root = $('#user-menu');
  const user = Auth.user();
  if (!user) {
    root.innerHTML = `<button class="btn-login" id="btn-login">登录</button>`;
    $('#btn-login').addEventListener('click', () => authModal('login'));
    return;
  }
  const isAdmin = user.role === 'admin';
  root.innerHTML = `
    <button class="bell-btn" id="msg-btn" title="私信">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="bell-dot" id="msg-dot" style="display:none">0</span>
    </button>
    <button class="bell-btn" id="bell-btn" title="通知">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      <span class="bell-dot" id="bell-dot" style="display:none">0</span>
    </button>
    <button class="user-avatar-btn" id="user-btn">
      <img src="${user.avatar}" alt="" />
      <span>${user.username}</span>
    </button>
    <div class="user-dropdown" id="user-dropdown" style="display:none">
      <a href="#/me">📝 个人中心</a>
      <a href="#/write">✍️ 写文章</a>
      <a href="#/user/${user.id}">👤 我的主页</a>
      <a href="#/messages">💬 私信</a>
      <a href="#/notifications">🔔 通知中心</a>
      ${isAdmin ? `<a href="#/admin">⚙️ 管理后台</a>` : ''}
      <div class="divider"></div>
      <a class="danger" id="logout">退出登录</a>
    </div>
  `;
  const btn = $('#user-btn');
  const dd = $('#user-dropdown');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
  });
  document.addEventListener('click', () => (dd.style.display = 'none'));
  $('#msg-btn').addEventListener('click', () => (location.hash = '#/messages'));
  $('#bell-btn').addEventListener('click', () => (location.hash = '#/notifications'));
  $('#logout').addEventListener('click', () => {
    Auth.clear();
    if (window.__bellTimer) { clearInterval(window.__bellTimer); window.__bellTimer = null; }
    renderUserMenu();
    location.hash = '#/';
    toast('已退出', 'success');
  });
  startBellPolling();
}

async function refreshBell() {
  if (!Auth.user()) return;
  try {
    const { count } = await API.unreadCount();
    const dot = $('#bell-dot');
    if (!dot) return;
    if (count > 0) {
      dot.style.display = 'flex';
      dot.textContent = count > 99 ? '99+' : String(count);
    } else {
      dot.style.display = 'none';
    }
  } catch (_) {}
}
async function refreshMsgBadge() {
  if (!Auth.user()) return;
  try {
    const { count } = await API.messages.unreadCount();
    const dot = $('#msg-dot');
    if (!dot) return;
    if (count > 0) {
      dot.style.display = 'flex';
      dot.textContent = count > 99 ? '99+' : String(count);
    } else {
      dot.style.display = 'none';
    }
  } catch (_) {}
}
function startBellPolling() {
  if (window.__bellTimer) clearInterval(window.__bellTimer);
  refreshBell();
  refreshMsgBadge();
  window.__bellTimer = setInterval(() => { refreshBell(); refreshMsgBadge(); }, 30_000);
}

// ---------- Markdown ----------
marked.setOptions({
  breaks: true,
  gfm: true,
  highlight(code, lang) {
    if (window.hljs && lang && hljs.getLanguage(lang)) {
      try { return hljs.highlight(code, { language: lang }).value; }
      catch (_) {}
    }
    return code;
  },
});
function renderMD(content) {
  return DOMPurify.sanitize(marked.parse(content || ''));
}

// ---------- 时间格式化 ----------
function fmt(ts) {
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// =========================================================================
//  视图
// =========================================================================

const app = () => $('#app');

function postCardHTML(p, delay = 0) {
  const isVideo = p.media_type === 'video';
  const coverSrc = isVideo ? (p.video_poster || p.cover) : p.cover;
  return `
    <article class="post-card ${isVideo ? 'is-video' : ''}" data-href="#/post/${p.id}" style="animation-delay:${delay}ms">
      <div class="post-cover">
        ${coverSrc ? `<img src="${coverSrc}" alt="" loading="lazy" />` : ''}
        <span class="post-category">${isVideo ? '🎬 视频' : (p.category || '随笔')}</span>
        ${isVideo ? '<span class="play-badge">▶</span>' : ''}
      </div>
      <div class="post-body">
        <h3 class="post-title">${escapeHTML(p.title)}</h3>
        <p class="post-excerpt">${escapeHTML(p.excerpt || '')}</p>
        ${p.tags?.length ? `<div class="tag-row">${p.tags.map(t => `<span class="tag">#${t}</span>`).join('')}</div>` : ''}
        <div class="post-meta">
          <div class="post-author">
            <img src="${p.author?.avatar || ''}" alt="" />
            <span>${p.author?.username || ''}</span>
          </div>
          <div class="post-stats">
            <span>👁 ${p.views}</span>
            <span>♥ ${p.likes}</span>
            <span>💬 ${p.comments}</span>
          </div>
        </div>
      </div>
    </article>
  `;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function bindCardClicks() {
  $$('.post-card[data-href]').forEach((el) => {
    el.addEventListener('click', () => (location.hash = el.dataset.href));
  });
}

function loadingGrid(n = 6) {
  return `<div class="posts-grid">${Array(n).fill('<div class="skeleton skeleton-card"></div>').join('')}</div>`;
}

// ---------- Home ----------
async function viewHome() {
  app().innerHTML = `
    <section class="hero">
      <span class="hero-eyebrow">✨ 欢迎来到 BlogSystem</span>
      <h1>把想法 <span class="grad">化作文字</span><br/>把文字 <span class="grad">变成回响</span></h1>
      <p>一个为热爱写作的人准备的地方。在这里，你可以记录代码、分享想法、与世界产生联结。</p>
      <div class="hero-actions">
        <a href="#/write" class="btn btn-primary">开始写作 →</a>
        <a href="#/explore" class="btn">探索文章</a>
      </div>
      <div class="stats" id="stats-grid"></div>
    </section>

    <div class="section-header">
      <h2>最新发布</h2>
      <div class="filters">
        <button class="chip active" data-sort="new">最新</button>
        <button class="chip" data-sort="hot">最热</button>
      </div>
    </div>
    <div id="home-posts">${loadingGrid()}</div>
  `;

  API.stats().then((s) => {
    $('#stats-grid').innerHTML = `
      <div class="stat-card"><div class="stat-value">${s.posts}</div><div class="stat-label">已发布文章</div></div>
      <div class="stat-card"><div class="stat-value">${s.users}</div><div class="stat-label">注册用户</div></div>
      <div class="stat-card"><div class="stat-value">${s.comments}</div><div class="stat-label">总评论</div></div>
      <div class="stat-card"><div class="stat-value">${s.views}</div><div class="stat-label">总阅读量</div></div>
    `;
  });

  const loadPosts = async (sort) => {
    const r = await API.listPosts({ limit: 9, sort });
    $('#home-posts').innerHTML = r.posts.length
      ? `<div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 50)).join('')}</div>`
      : `<div class="empty-state"><div class="emoji">📝</div><p>还没有文章，等你来写下第一篇</p></div>`;
    bindCardClicks();
  };
  loadPosts('new');
  $$('.filters .chip').forEach((c) =>
    c.addEventListener('click', () => {
      $$('.filters .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      loadPosts(c.dataset.sort);
    })
  );
}

// ---------- Explore ----------
async function viewExplore(params) {
  const q = params.get('q') || '';
  const tag = params.get('tag') || '';
  const category = params.get('category') || '';

  app().innerHTML = `
    <div class="explore-layout">
      <div>
        <div class="section-header">
          <h2>${q ? `搜索：${escapeHTML(q)}` : tag ? `标签：#${escapeHTML(tag)}` : category ? `分类：${escapeHTML(category)}` : '所有文章'}</h2>
        </div>
        ${q ? `<div id="explore-users"></div>` : ''}
        <div id="explore-posts">${loadingGrid()}</div>
      </div>
      <aside>
        <div class="sidebar-card">
          <h4>热门标签</h4>
          <div class="sidebar-tags" id="side-tags"></div>
        </div>
        <div class="sidebar-card">
          <h4>分类</h4>
          <div class="cat-list" id="side-cats"></div>
        </div>
      </aside>
    </div>
  `;

  // 有搜索词时，同时搜索用户
  if (q) {
    API.searchUsers({ q, limit: 6 }).then(({ users }) => {
      if (users?.length) {
        $('#explore-users').innerHTML = `
          <div class="section-header" style="margin-top:0"><h3 style="font-size:20px">👤 相关用户</h3></div>
          <div class="user-card-list">${users.map(u => userCardHTML(u)).join('')}</div>
        `;
        bindUserCardClicks();
      }
    }).catch(() => {});
  }

  const r = await API.listPosts({ q, tag, category, limit: 24 });
  $('#explore-posts').innerHTML = r.posts.length
    ? `<div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 40)).join('')}</div>`
    : `<div class="empty-state"><div class="emoji">🔍</div><p>没有找到匹配的文章</p></div>`;
  bindCardClicks();

  API.tags().then(({ tags }) => {
    $('#side-tags').innerHTML = tags.map(
      (t) => `<a class="tag-link" href="#/explore?tag=${encodeURIComponent(t.name)}">#${t.name} <small>(${t.count})</small></a>`
    ).join('');
  });
  API.categories().then(({ categories }) => {
    $('#side-cats').innerHTML = categories.map(
      (c) => `<a href="#/explore?category=${encodeURIComponent(c.name)}">${c.name} <span class="count">${c.count}</span></a>`
    ).join('');
  });
}

// ---------- Post ----------
async function viewPost(id) {
  app().innerHTML = `<div class="article-page"><div class="skeleton" style="height:60vh;border-radius:22px"></div></div>`;
  let p;
  try {
    const r = await API.getPost(id);
    p = r.post;
  } catch (e) {
    app().innerHTML = `<div class="empty-state"><div class="emoji">😢</div><p>${e.message}</p></div>`;
    return;
  }
  const me = Auth.user();
  const canEdit = me && (me.id === p.user_id || me.role === 'admin');
  const isVideoPost = p.media_type === 'video' && p.video_url;

  app().innerHTML = `
    <article class="article-page${isVideoPost ? ' is-video-page' : ''}">
      <header class="article-header">
        <div class="meta-top">
          <span>${p.category}</span>
          <span>·</span>
          <span>👁 ${p.views}</span>
          <span>·</span>
          <span>💬 ${p.comments}</span>
        </div>
        <h1>${escapeHTML(p.title)}</h1>
        <div class="author-line">
          <img src="${p.author?.avatar}" alt="" />
          <div class="who">
            <div class="name"><a href="#/user/${p.author?.id}">${p.author?.username}</a></div>
            <div class="when">${fmt(p.created_at)} 发布</div>
          </div>
          ${canEdit ? `
            <div style="margin-left:20px;display:flex;gap:8px">
              <a href="#/write?id=${p.id}" class="btn btn-ghost">编辑</a>
              <button class="btn btn-danger" id="btn-del">删除</button>
            </div>
          ` : ''}
        </div>
      </header>

      ${isVideoPost
        ? `<div class="article-video-wrap" id="vplayer-host"></div>`
        : p.cover ? `<div class="article-cover"><img src="${p.cover}" alt="" /></div>` : ''}

      ${p.audio_url ? `<div class="article-audio" id="article-audio-bar"></div>` : ''}

      <div class="article-content">${renderMD(p.content)}</div>

      ${p.tags?.length ? `<div class="tag-row" style="margin-top:32px">${p.tags.map(t => `<a class="tag" href="#/explore?tag=${encodeURIComponent(t)}">#${t}</a>`).join('')}</div>` : ''}

      <div class="article-bottom-bar">
        <button class="like-btn ${p.liked ? 'liked' : ''}" id="like-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="${p.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span id="like-count">${p.likes}</span> 喜欢
        </button>
        <button class="bookmark-btn ${p.bookmarked ? 'marked' : ''}" id="bookmark-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="${p.bookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <span id="bookmark-count">${p.bookmarks}</span> 收藏
        </button>
      </div>

      <section class="comments-section">
        <h3>💬 评论 (${p.comments})</h3>
        <div id="comment-form-host"></div>
        <div id="comments-list"></div>
      </section>
    </article>
  `;

  if (window.hljs) $$('.article-content pre code').forEach((b) => hljs.highlightElement(b));

  if (isVideoPost) {
    const host = document.getElementById('vplayer-host');
    if (host && window.VideoPlayer) {
      window.__videoPlayer = window.VideoPlayer.mount(host, { src: p.video_url, poster: p.video_poster });
    }
  }

  if (p.audio_url) {
    const bar = $('#article-audio-bar');
    if (bar) {
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = p.audio_url;
      bar.appendChild(audio);
    }
  }

  if (p.effects || p.bgm_url) {
    const container = document.querySelector('.article-content');
    if (window.applyEffects) applyEffects(p.effects || '', p.bgm_url || '', container);
  }

  if (canEdit) {
    $('#btn-del').addEventListener('click', async () => {
      if (!confirm('确定删除这篇文章吗？')) return;
      try {
        await API.deletePost(p.id);
        toast('已删除', 'success');
        location.hash = '#/';
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // like
  $('#like-btn').addEventListener('click', async () => {
    if (!Auth.user()) return authModal('login');
    try {
      const r = await API.likePost(p.id);
      const btn = $('#like-btn');
      btn.classList.toggle('liked', r.liked);
      const svg = btn.querySelector('svg');
      svg.setAttribute('fill', r.liked ? 'currentColor' : 'none');
      const cnt = $('#like-count');
      cnt.textContent = Number(cnt.textContent) + (r.liked ? 1 : -1);
    } catch (e) { toast(e.message, 'error'); }
  });

  // bookmark
  $('#bookmark-btn').addEventListener('click', async () => {
    if (!Auth.user()) return authModal('login');
    try {
      const r = await API.bookmarkPost(p.id);
      const btn = $('#bookmark-btn');
      btn.classList.toggle('marked', r.bookmarked);
      btn.querySelector('svg').setAttribute('fill', r.bookmarked ? 'currentColor' : 'none');
      const cnt = $('#bookmark-count');
      cnt.textContent = Number(cnt.textContent) + (r.bookmarked ? 1 : -1);
      toast(r.bookmarked ? '已收藏' : '已取消收藏', 'success');
    } catch (e) { toast(e.message, 'error'); }
  });

  // comment form
  const user = Auth.user();
  $('#comment-form-host').innerHTML = user ? `
    <form class="comment-form" id="cf">
      <img src="${user.avatar}" alt="" />
      <div class="field">
        <textarea name="content" placeholder="写下你的看法..." required></textarea>
        <div class="actions"><button type="submit" class="btn btn-primary">发表</button></div>
      </div>
    </form>
  ` : `
    <div class="comment-form" style="background:var(--surface);border:1px solid var(--border);padding:20px;border-radius:14px">
      <div class="field" style="text-align:center;color:var(--text-soft)">
        请 <a style="color:var(--primary-glow);cursor:pointer" onclick="authModal('login')">登录</a> 后发表评论
      </div>
    </div>
  `;
  if (user) {
    $('#cf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = e.target.content.value.trim();
      if (!content) return;
      try {
        await API.createComment(p.id, { content });
        e.target.reset();
        loadComments();
        toast('评论已发表', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }
  loadComments();
  async function loadComments() {
    const { comments } = await API.listComments(p.id);
    const me = Auth.user();
    const byId = new Map(comments.map((c) => [c.id, c]));
    // 沿 parent_id 上溯到最顶层评论（楼中楼统一挂到一级楼下）
    const rootOf = (c) => {
      let cur = c, guard = 0;
      while (cur.parent_id && byId.has(cur.parent_id) && guard++ < 50) cur = byId.get(cur.parent_id);
      return cur;
    };
    const roots = [];
    const childrenOf = new Map(); // rootId -> 回复数组
    for (const c of comments) {
      if (!c.parent_id || !byId.has(c.parent_id)) {
        roots.push(c);
      } else {
        const r = rootOf(c);
        if (!childrenOf.has(r.id)) childrenOf.set(r.id, []);
        childrenOf.get(r.id).push(c);
      }
    }
    const canModify = (c) => me && (me.id === c.user_id || me.role === 'admin');
    const delLink = (c) => canModify(c) ? `<a class="c-act c-del" data-del-c="${c.id}">删除</a>` : '';
    const replyLink = (c) => me
      ? `<a class="c-act c-reply" data-reply-c="${c.id}" data-reply-name="${escapeHTML(c.username)}">回复</a>` : '';

    const replyHTML = (c) => {
      const to = c.parent_id && byId.has(c.parent_id) ? byId.get(c.parent_id) : null;
      return `
        <div class="comment-reply" id="c-${c.id}">
          <img src="${c.avatar}" alt="" />
          <div class="comment-body">
            <div class="comment-head">
              <span class="name">${escapeHTML(c.username)}</span>
              ${to ? `<span class="reply-to">回复 @${escapeHTML(to.username)}</span>` : ''}
              <span class="when">· ${fmt(c.created_at)}</span>
            </div>
            <div class="comment-text">${escapeHTML(c.content)}</div>
            <div class="comment-foot">${replyLink(c)}${delLink(c)}</div>
          </div>
        </div>`;
    };

    const rootHTML = (c) => {
      const kids = (childrenOf.get(c.id) || []).sort((a, b) => a.created_at - b.created_at);
      return `
        <div class="comment-item" id="c-${c.id}">
          <img src="${c.avatar}" alt="" />
          <div class="comment-body">
            <div class="comment-head">
              <span class="name">${escapeHTML(c.username)}</span>
              <span class="when">· ${fmt(c.created_at)}</span>
            </div>
            <div class="comment-text">${escapeHTML(c.content)}</div>
            <div class="comment-foot">${replyLink(c)}${delLink(c)}</div>
            ${kids.length ? `<div class="comment-replies">${kids.map(replyHTML).join('')}</div>` : ''}
          </div>
        </div>`;
    };

    $('#comments-list').innerHTML = comments.length
      ? roots.map(rootHTML).join('')
      : `<div class="empty-state" style="padding:30px"><p>还没有评论，来抢沙发吧</p></div>`;

    $$('[data-del-c]').forEach((a) =>
      a.addEventListener('click', async () => {
        if (!confirm('删除这条评论？')) return;
        try { await API.deleteComment(a.dataset.delC); loadComments(); }
        catch (e) { toast(e.message, 'error'); }
      })
    );
    $$('[data-reply-c]').forEach((a) =>
      a.addEventListener('click', () => openReplyForm(a, a.dataset.replyC, a.dataset.replyName))
    );

    function openReplyForm(anchor, parentId, toName) {
      const foot = anchor.closest('.comment-foot');
      const existing = foot.parentElement.querySelector(':scope > .reply-box');
      if (existing) { existing.remove(); return; } // 再次点击收起
      const box = document.createElement('div');
      box.className = 'reply-box';
      box.innerHTML = `
        <textarea placeholder="回复 @${escapeHTML(toName)}..."></textarea>
        <div class="reply-actions">
          <button class="btn btn-ghost btn-sm" data-cancel>取消</button>
          <button class="btn btn-primary btn-sm" data-send>回复</button>
        </div>`;
      foot.insertAdjacentElement('afterend', box);
      const ta = box.querySelector('textarea');
      ta.focus();
      box.querySelector('[data-cancel]').addEventListener('click', () => box.remove());
      box.querySelector('[data-send]').addEventListener('click', async () => {
        const content = ta.value.trim();
        if (!content) return;
        try {
          await API.createComment(p.id, { content, parent_id: Number(parentId) });
          toast('回复已发表', 'success');
          loadComments();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  }
}

// ---------- Write / Edit ----------
async function viewWrite(params) {
  if (!Auth.user()) {
    authModal('login');
    return viewHome();
  }
  const id = params.get('id');
  let post = { title: '', content: '', excerpt: '', cover: '', category: '随笔', tags: [], published: 1, publish_at: null,
    media_type: 'article', video_url: '', video_poster: '', audio_url: '', effects: '', bgm_url: '' };
  if (id) {
    try {
      const r = await API.getPost(id);
      post = r.post;
    } catch (e) { toast(e.message, 'error'); }
  }
  const isDraft = post.published === 0 && !post.publish_at;
  const isScheduled = post.published === 0 && post.publish_at;
  const stateLabel = isDraft ? '📝 草稿' : isScheduled ? '⏰ 定时' : '✅ 已发布';

  app().innerHTML = `
    <section class="editor-page">
      <div class="editor-toolbar">
        <input class="title-input" id="ed-title" placeholder="文章标题..." value="${escapeHTML(post.title)}" />
        <span class="ed-state" id="ed-state">${stateLabel}</span>
      </div>
      <div class="editor-toolbar-row">
        <div class="ed-cover-wrap">
          <input class="cover-input" id="ed-cover" placeholder="封面图 URL" value="${escapeHTML(post.cover || '')}" />
          <button class="btn btn-ghost" id="ed-cover-upload" type="button">📷 上传封面</button>
          <input type="file" id="ed-cover-file" accept="image/*" style="display:none" />
        </div>
        <select id="ed-cat">
          ${['随笔','前端','后端','设计','生活','公告'].map(c => `<option ${c === post.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <input class="tag-input" id="ed-tags" placeholder="标签，逗号分隔" value="${(post.tags || []).join(',')}" />
        <div class="ed-save-group">
          <button class="btn" id="ed-save-draft" type="button">💾 存草稿</button>
          <button class="btn" id="ed-save-schedule" type="button">⏰ 定时发布</button>
          <button class="btn btn-primary" id="ed-save-publish" type="button">${id && post.published ? '✓ 更新' : '🚀 立即发布'}</button>
        </div>
      </div>

      <div class="ed-media-tabs">
        <button class="ed-tab ${post.media_type !== 'video' ? 'active' : ''}" data-tab="article">📝 文章</button>
        <button class="ed-tab ${post.media_type === 'video' ? 'active' : ''}" data-tab="video">🎬 视频</button>
      </div>

      <div id="ed-article-area" style="${post.media_type === 'video' ? 'display:none' : ''}">
        <div class="editor-grid">
          <div class="editor-pane">
            <div class="editor-pane-head">
              <span>Markdown</span>
              <button class="ed-insert-img" id="ed-insert-img" type="button">📷 插入图片</button>
              <input type="file" id="ed-img-file" accept="image/*" style="display:none" />
              <button class="ed-insert-img" id="ed-attach-audio" type="button">🎵 附加音频</button>
              <input type="file" id="ed-audio-file" accept="audio/*" style="display:none" />
              <span id="ed-audio-label" style="font-size:12px;color:var(--text-muted)"></span>
            </div>
            <textarea id="ed-content" placeholder="# 标题&#10;&#10;开始写吧 ✨...">${escapeHTML(post.content)}</textarea>
          </div>
          <div class="editor-pane">
            <div class="editor-pane-head"><span>实时预览</span></div>
            <div class="preview article-content" id="ed-preview"></div>
          </div>
        </div>
      </div>

      <div id="ed-video-area" class="video-upload-area" style="${post.media_type !== 'video' ? 'display:none' : ''}">
        <div class="ed-video-row">
          <div class="ed-upload-box" id="ed-video-box">
            <input type="file" id="ed-video-file" accept="video/*" style="display:none" />
            <button class="btn btn-ghost" id="ed-video-upload">🎬 上传视频</button>
            <span id="ed-video-label" class="ed-upload-label">${post.video_url ? post.video_url.split('/').pop() : '未选择'}</span>
          </div>
          <div class="ed-upload-box" id="ed-poster-box">
            <input type="file" id="ed-poster-file" accept="image/*" style="display:none" />
            <button class="btn btn-ghost" id="ed-poster-upload">🖼 上传封面</button>
            <span id="ed-poster-label" class="ed-upload-label">${post.video_poster ? post.video_poster.split('/').pop() : '未选择'}</span>
          </div>
        </div>
        <div class="upload-progress" id="ed-video-progress" style="display:none">
          <div class="upload-progress-bar"><div class="upload-progress-fill" id="ed-video-fill"></div></div>
          <div class="upload-progress-meta">
            <span id="ed-video-pct">0%</span>
            <span id="ed-video-speed"></span>
            <button class="btn btn-ghost btn-mini" id="ed-video-cancel" type="button">取消</button>
          </div>
        </div>
        ${post.video_url ? `<video class="ed-video-preview" controls preload="metadata" poster="${post.video_poster || ''}" src="${post.video_url}"></video>` : '<video class="ed-video-preview" controls preload="metadata" style="display:none"></video>'}
        <textarea id="ed-excerpt" class="ed-excerpt" placeholder="视频简介（可选）...">${escapeHTML(post.excerpt || '')}</textarea>
      </div>

      <div class="ed-effects-panel">
        <span class="ed-effects-title">✨ 文章特效</span>
        ${['typewriter:打字机','snow:雪花','sakura:樱花'].map(s => {
          const [k, label] = s.split(':');
          const checked = (post.effects || '').split(',').includes(k) ? 'checked' : '';
          return `<label><input type="checkbox" class="ed-effect-cb" value="${k}" ${checked}/> ${label}</label>`;
        }).join('')}
        <button class="btn btn-ghost" id="ed-bgm-upload" type="button">🎵 BGM</button>
        <input type="file" id="ed-bgm-file" accept="audio/*" style="display:none" />
        <span id="ed-bgm-label" style="font-size:12px;color:var(--text-muted)">${post.bgm_url ? post.bgm_url.split('/').pop() : ''}</span>
      </div>
    </section>
  `;

  // 媒体 tab 切换
  const edState = { mediaType: post.media_type || 'article', videoUrl: post.video_url || '', videoPoster: post.video_poster || '', audioUrl: post.audio_url || '', bgmUrl: post.bgm_url || '' };
  $$('.ed-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.ed-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      edState.mediaType = btn.dataset.tab;
      $('#ed-article-area').style.display = edState.mediaType === 'video' ? 'none' : '';
      $('#ed-video-area').style.display = edState.mediaType === 'video' ? '' : 'none';
    });
  });

  const content = $('#ed-content');
  const preview = $('#ed-preview');
  const update = () => {
    preview.innerHTML = renderMD(content.value);
    if (window.hljs) $$('pre code', preview).forEach((b) => hljs.highlightElement(b));
  };
  content.addEventListener('input', update);
  update();

  // 封面上传
  $('#ed-cover-upload').addEventListener('click', () => $('#ed-cover-file').click());
  $('#ed-cover-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await API.uploadImage(f);
      $('#ed-cover').value = r.url;
      toast('封面已上传', 'success');
    } catch (err) { toast(err.message, 'error'); }
  });

  // 插入正文图片
  $('#ed-insert-img').addEventListener('click', () => $('#ed-img-file').click());
  $('#ed-img-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await API.uploadImage(f);
      const ta = content;
      const md = `\n![](${r.url})\n`;
      const pos = ta.selectionStart || ta.value.length;
      ta.value = ta.value.slice(0, pos) + md + ta.value.slice(pos);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = pos + md.length;
      update();
      toast('图片已插入', 'success');
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });

  // 音频附件
  $('#ed-attach-audio').addEventListener('click', () => $('#ed-audio-file').click());
  $('#ed-audio-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await API.uploadAudio(f);
      edState.audioUrl = r.url;
      $('#ed-audio-label').textContent = `已附加：${f.name} [移除]`;
      $('#ed-audio-label').style.cursor = 'pointer';
      $('#ed-audio-label').onclick = () => { edState.audioUrl = ''; $('#ed-audio-label').textContent = ''; };
      toast('音频已附加', 'success');
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });

  // 视频上传（带进度 + 取消）
  let curVideoUpload = null;
  const fmtSize = (b) => b > 1024 * 1024 * 1024 ? (b / 1024 / 1024 / 1024).toFixed(2) + ' GB' : (b / 1024 / 1024).toFixed(1) + ' MB';
  const fmtSpeed = (b) => b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB/s' : (b / 1024).toFixed(0) + ' KB/s';
  $('#ed-video-upload').addEventListener('click', () => $('#ed-video-file').click());
  $('#ed-video-cancel').addEventListener('click', () => { if (curVideoUpload) curVideoUpload.abort(); });
  $('#ed-video-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    const limits = window.__uploadLimits || { video_mb: 0 };
    if (limits.video_mb > 0 && f.size > limits.video_mb * 1024 * 1024) {
      const limitTxt = limits.video_mb >= 1024 ? (limits.video_mb / 1024).toFixed(1) + 'GB' : limits.video_mb + 'MB';
      return toast(`视频过大（${fmtSize(f.size)}），上限 ${limitTxt}`, 'error');
    }
    const prog = $('#ed-video-progress');
    const fill = $('#ed-video-fill');
    const pct = $('#ed-video-pct');
    const spd = $('#ed-video-speed');
    const btn = $('#ed-video-upload');
    prog.style.display = '';
    btn.disabled = true;
    fill.style.width = '0%';
    pct.textContent = '0%';
    spd.textContent = '准备上传…';
    try {
      curVideoUpload = API.uploadVideo(f, ({ percent, loaded, total, speed }) => {
        fill.style.width = percent + '%';
        pct.textContent = percent.toFixed(1) + '%';
        spd.textContent = `${fmtSize(loaded)} / ${fmtSize(total)} · ${fmtSpeed(speed)}`;
      });
      const r = await curVideoUpload;
      edState.videoUrl = r.url;
      $('#ed-video-label').textContent = f.name;
      const prev = $('.ed-video-preview');
      if (prev) { prev.src = r.url; prev.style.display = ''; }
      toast('视频已上传', 'success');
    } catch (err) {
      toast(err.message, err.message === '已取消' ? 'info' : 'error');
    } finally {
      curVideoUpload = null;
      btn.disabled = false;
      setTimeout(() => { prog.style.display = 'none'; }, 800);
    }
  });

  // 视频封面上传
  $('#ed-poster-upload').addEventListener('click', () => $('#ed-poster-file').click());
  $('#ed-poster-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await API.uploadImage(f);
      edState.videoPoster = r.url;
      $('#ed-poster-label').textContent = f.name;
      toast('封面已上传', 'success');
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });

  // BGM 上传
  $('#ed-bgm-upload').addEventListener('click', () => $('#ed-bgm-file').click());
  $('#ed-bgm-file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const r = await API.uploadAudio(f);
      edState.bgmUrl = r.url;
      $('#ed-bgm-label').textContent = f.name;
      toast('BGM 已上传', 'success');
    } catch (err) { toast(err.message, 'error'); }
    e.target.value = '';
  });

  const collectBase = () => {
    const effects = $$('.ed-effect-cb').filter(cb => cb.checked).map(cb => cb.value).join(',');
    const isVideo = edState.mediaType === 'video';
    return {
      title: $('#ed-title').value.trim(),
      content: isVideo ? ($('#ed-excerpt')?.value || '') : $('#ed-content').value,
      excerpt: isVideo ? ($('#ed-excerpt')?.value || '') : '',
      cover: $('#ed-cover').value.trim(),
      category: $('#ed-cat').value,
      tags: $('#ed-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
      media_type: edState.mediaType,
      video_url: edState.videoUrl,
      video_poster: edState.videoPoster,
      audio_url: edState.audioUrl,
      effects,
      bgm_url: edState.bgmUrl,
    };
  };
  const save = async (extra, successMsg) => {
    const base = collectBase();
    if (!base.title) return toast('标题不能为空', 'error');
    if (base.media_type === 'article' && !base.content) return toast('内容不能为空', 'error');
    const body = { ...base, ...extra };
    try {
      const r = id ? await API.updatePost(id, body) : await API.createPost(body);
      toast(successMsg, 'success');
      if (extra.published === 0) {
        if (!id) location.hash = `#/write?id=${r.post.id}`;
        else viewWrite(new URLSearchParams(`id=${id}`));
      } else {
        location.hash = `#/post/${r.post.id}`;
      }
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#ed-save-draft').addEventListener('click', () => save({ published: 0, publish_at: null }, '已存草稿'));
  $('#ed-save-publish').addEventListener('click', () => save({ published: 1 }, id && post.published ? '已更新' : '发布成功'));
  $('#ed-save-schedule').addEventListener('click', () => {
    const html = `
      <div class="modal">
        <h2>⏰ 定时发布</h2>
        <p class="modal-sub">选择一个未来的时间，到点自动发布</p>
        <label>发布时间</label>
        <input type="datetime-local" id="sched-time" />
        <button class="btn btn-primary" id="sched-ok">确定</button>
      </div>
    `;
    showModal(html);
    // 默认填入当前时间 + 5 分钟
    const t = new Date(Date.now() + 5 * 60_000);
    t.setSeconds(0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    $('#sched-time').value = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
    $('#sched-ok').addEventListener('click', () => {
      const v = $('#sched-time').value;
      if (!v) return toast('请选择时间', 'error');
      const ts = new Date(v).getTime();
      if (!(ts > Date.now())) return toast('必须是未来时间', 'error');
      hideModal();
      save({ published: 0, publish_at: ts }, `已设定 ${fmt(ts)} 发布`);
    });
  });
}

// ---------- Me / Profile ----------
async function viewMe() {
  if (!Auth.user()) {
    authModal('login');
    return viewHome();
  }
  const user = Auth.user();
  app().innerHTML = `
    <section class="profile-hero">
      <img src="${user.avatar}" alt="" />
      <h2>${escapeHTML(user.username)}</h2>
      <p class="bio">${escapeHTML(user.bio || '这个人很神秘，什么都没写...')}</p>
      <div class="meta">注册于 ${fmt(user.created_at)}</div>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:center">
        <a href="#/write" class="btn btn-primary">写新文章</a>
        <button class="btn" id="edit-profile">编辑资料</button>
      </div>
    </section>
    <div class="section-header">
      <h2>我的内容</h2>
      <div class="filters">
        <button class="chip active" data-mtab="posts">我的文章</button>
        <button class="chip" data-mtab="drafts">📝 草稿箱</button>
        <button class="chip" data-mtab="bookmarks">我的收藏</button>
        <button class="chip" data-mtab="history">🕘 浏览历史</button>
      </div>
    </div>
    <div id="my-posts">${loadingGrid(3)}</div>
  `;
  $('#edit-profile').addEventListener('click', () => {
    showModal(`
      <div class="modal">
        <h2>编辑资料</h2>
        <form id="pf">
          <label>头像 URL</label>
          <input name="avatar" value="${escapeHTML(user.avatar)}" />
          <label>个人简介</label>
          <input name="bio" value="${escapeHTML(user.bio || '')}" placeholder="一句话介绍你自己" />
          <button class="btn btn-primary" type="submit">保存</button>
        </form>
      </div>
    `);
    $('#pf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      try {
        const r = await API.updateMe(data);
        Auth.set(Auth.token(), r.user);
        renderUserMenu();
        hideModal();
        toast('已保存', 'success');
        viewMe();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  const host = $('#my-posts');
  const loadTab = async (tab) => {
    host.innerHTML = loadingGrid(3);
    if (tab === 'bookmarks') {
      const r = await API.myBookmarks({ limit: 50 });
      host.innerHTML = r.posts.length
        ? `<div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 40)).join('')}</div>`
        : `<div class="empty-state"><div class="emoji">🔖</div><p>还没有收藏任何文章</p></div>`;
      bindCardClicks();
    } else if (tab === 'drafts') {
      try {
        const { drafts } = await API.myDrafts();
        if (!drafts.length) {
          host.innerHTML = `<div class="empty-state"><div class="emoji">📝</div><p>还没有草稿，<a href="#/write" style="color:var(--primary-glow)">开始写一篇 →</a></p></div>`;
          return;
        }
        host.innerHTML = `<div class="draft-list">${drafts.map((d) => `
          <div class="draft-item">
            <div class="draft-main">
              <div class="draft-head">
                <span class="draft-badge ${d.isScheduled ? 'scheduled' : 'draft'}">
                  ${d.isScheduled ? `⏰ 定时 · ${fmt(d.publish_at)} 发布` : '📝 草稿'}
                </span>
                <span class="draft-when">编辑于 ${fmt(d.updated_at)}</span>
              </div>
              <h3 class="draft-title">${escapeHTML(d.title || '(未命名)')}</h3>
              <p class="draft-excerpt">${escapeHTML((d.excerpt || d.content || '').slice(0, 120))}</p>
            </div>
            <div class="draft-actions">
              <a href="#/write?id=${d.id}" class="btn btn-ghost">继续编辑</a>
              <button class="btn btn-danger" data-del-draft="${d.id}">删除</button>
            </div>
          </div>
        `).join('')}</div>`;
        $$('[data-del-draft]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm('确定删除这篇草稿？')) return;
          try {
            await API.deletePost(b.dataset.delDraft);
            toast('已删除', 'success');
            loadTab('drafts');
          } catch (e) { toast(e.message, 'error'); }
        }));
      } catch (e) {
        host.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
      }
    } else if (tab === 'history') {
      const r = await API.history({ limit: 50 });
      if (!r.posts.length) {
        host.innerHTML = `<div class="empty-state"><div class="emoji">🕘</div><p>还没有浏览记录，去<a href="#/explore" style="color:var(--primary-glow)">探索文章 →</a></p></div>`;
        return;
      }
      host.innerHTML = `
        <div class="history-bar">
          <span class="muted">共 ${r.total} 条浏览记录</span>
          <button class="btn btn-danger btn-sm" id="clear-history">清空历史</button>
        </div>
        <div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 40)).join('')}</div>`;
      bindCardClicks();
      $('#clear-history').addEventListener('click', async () => {
        if (!confirm('确定清空全部浏览历史？')) return;
        try { await API.clearHistory(); toast('已清空', 'success'); loadTab('history'); }
        catch (e) { toast(e.message, 'error'); }
      });
    } else {
      const r = await API.listPosts({ author: user.id, limit: 50 });
      host.innerHTML = r.posts.length
        ? `<div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 40)).join('')}</div>`
        : `<div class="empty-state"><div class="emoji">✍️</div><p>还没有写文章，<a href="#/write" style="color:var(--primary-glow)">开始写第一篇 →</a></p></div>`;
      bindCardClicks();
    }
  };
  loadTab('posts');
  $$('[data-mtab]').forEach((c) =>
    c.addEventListener('click', () => {
      $$('[data-mtab]').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      loadTab(c.dataset.mtab);
    })
  );
}

async function viewUser(id) {
  app().innerHTML = `<div class="skeleton" style="height:200px;border-radius:22px"></div>`;
  let user;
  try {
    const r = await API.user(id);
    user = r.user;
  } catch (e) {
    app().innerHTML = `<div class="empty-state"><div class="emoji">😢</div><p>${e.message}</p></div>`;
    return;
  }
  const me = Auth.user();
  const isMe = me && me.id === user.id;
  app().innerHTML = `
    <section class="profile-hero">
      <img src="${user.avatar}" alt="" />
      <h2>${escapeHTML(user.username)}</h2>
      <p class="bio">${escapeHTML(user.bio || '这个人很神秘')}</p>
      <div class="profile-stats">
        <div><strong id="u-posts-count">${user.posts}</strong><span>文章</span></div>
        <div><strong id="u-followers">${user.followers || 0}</strong><span>粉丝</span></div>
        <div><strong id="u-following">${user.following || 0}</strong><span>关注</span></div>
      </div>
      <div class="profile-meta-detail" style="margin-top:10px">
        <span class="meta-chip">🆔 ${user.id}</span>
        <span class="meta-chip">📅 注册于 ${fmt(user.created_at)}</span>
        <span class="meta-chip">${user.role === 'admin' ? '🔧 管理员' : '👤 用户'}</span>
      </div>
      ${!isMe ? `
        <div style="margin-top:16px;display:flex;gap:10px;justify-content:center">
          <button class="btn ${user.followed ? '' : 'btn-primary'}" id="follow-btn">
            ${user.followed ? '✓ 已关注' : '+ 关注'}
          </button>
          <button class="btn" id="msg-user-btn">💬 私信</button>
        </div>
      ` : ''}
    </section>
    <div class="section-header">
      <h2>${escapeHTML(user.username)} 的动态</h2>
      <div class="filters">
        <button class="chip active" data-utab="posts">📝 文章</button>
        <button class="chip" data-utab="likes">❤️ 赞过</button>
        <button class="chip" data-utab="followers">👥 粉丝</button>
        <button class="chip" data-utab="following">🤝 关注</button>
      </div>
    </div>
    <div id="u-content">${loadingGrid(3)}</div>
  `;
  if (!isMe) {
    $('#follow-btn').addEventListener('click', async () => {
      if (!me) return authModal('login');
      try {
        const r = await API.toggleFollow(user.id);
        const btn = $('#follow-btn');
        btn.textContent = r.followed ? '✓ 已关注' : '+ 关注';
        btn.classList.toggle('btn-primary', !r.followed);
        const cnt = $('#u-followers');
        cnt.textContent = Number(cnt.textContent) + (r.followed ? 1 : -1);
        toast(r.followed ? `已关注 ${user.username}` : '已取消关注', 'success');
      } catch (e) { toast(e.message, 'error'); }
    });
    $('#msg-user-btn').addEventListener('click', () => {
      if (!me) return authModal('login');
      location.hash = '#/messages/' + user.id;
    });
  }

  const host = $('#u-content');
  async function loadTab(tab) {
    host.innerHTML = loadingGrid(3);
    if (tab === 'followers') {
      try {
        const { users } = await API.followers(id);
        if (!users.length) {
          host.innerHTML = `<div class="empty-state"><div class="emoji">👥</div><p>还没有粉丝</p></div>`;
          return;
        }
        host.innerHTML = `<div class="user-card-list">${users.map(u => userCardHTML(u)).join('')}</div>`;
        bindUserCardClicks();
      } catch (e) { host.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
    } else if (tab === 'following') {
      try {
        const { users } = await API.following(id);
        if (!users.length) {
          host.innerHTML = `<div class="empty-state"><div class="emoji">🤝</div><p>还没有关注任何人</p></div>`;
          return;
        }
        host.innerHTML = `<div class="user-card-list">${users.map(u => userCardHTML(u)).join('')}</div>`;
        bindUserCardClicks();
      } catch (e) { host.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
    } else if (tab === 'likes') {
      // 显示该用户赞过的文章
      try {
        const r = await API.listPosts({ liked_by: id, limit: 50 });
        if (!r.posts.length) {
          host.innerHTML = `<div class="empty-state"><div class="emoji">❤️</div><p>TA 还没有点赞过文章</p></div>`;
          return;
        }
        host.innerHTML = `<div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 40)).join('')}</div>`;
        bindCardClicks();
      } catch (e) { host.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
    } else {
      // posts
      try {
        const r = await API.listPosts({ author: id, limit: 50 });
        if (!r.posts.length) {
          host.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>TA 还没有发布文章</p></div>`;
          return;
        }
        host.innerHTML = `<div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 40)).join('')}</div>`;
        bindCardClicks();
      } catch (e) { host.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
    }
  }

  loadTab('posts');
  $$('[data-utab]').forEach((c) =>
    c.addEventListener('click', () => {
      $$('[data-utab]').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      loadTab(c.dataset.utab);
    })
  );
}

function userCardHTML(u) {
  return `
    <a class="user-card" href="#/user/${u.id}">
      <img src="${u.avatar}" alt="" />
      <div class="user-card-body">
        <div class="user-card-name">${escapeHTML(u.username)}</div>
        <div class="user-card-bio">${escapeHTML(u.bio || '这个人很神秘')}</div>
      </div>
      <span class="user-card-arrow">→</span>
    </a>
  `;
}

function bindUserCardClicks() {
  // user-card 本身是 <a>，无需额外绑定 click
}

// ---------- Notifications (批次 3) ----------
async function viewNotifications() {
  if (!Auth.user()) { authModal('login'); return viewHome(); }
  app().innerHTML = `
    <section class="notif-page">
      <div class="section-header">
        <h2>🔔 通知中心</h2>
        <button class="btn" id="mark-all-read">全部标记为已读</button>
      </div>
      <div id="notif-list">${loadingGrid(3)}</div>
    </section>
  `;
  const load = async () => {
    const { notifications } = await API.notifications();
    if (!notifications.length) {
      $('#notif-list').innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暂无通知</p></div>`;
      return;
    }
    const map = { like: ['❤️', '点赞了你的文章'], comment: ['💬', '评论了你的文章'], follow: ['👥', '关注了你'], reply: ['💬', '回复了你的评论'] };
    $('#notif-list').innerHTML = `<div class="notif-list">${notifications.map((n) => {
      const [emoji, text] = map[n.type] || ['🔔', n.type];
      const target = n.type === 'follow'
        ? `#/user/${n.actor_id}`
        : (n.post_id ? `#/post/${n.post_id}` : '#');
      return `
        <a class="notif-item ${n.is_read ? '' : 'unread'}" href="${target}">
          <img src="${n.actor_avatar || ''}" alt="" />
          <div class="notif-body">
            <div class="notif-head">
              <span class="notif-emoji">${emoji}</span>
              <strong>${escapeHTML(n.actor_name)}</strong>
              <span class="notif-text">${text}</span>
              ${n.post_title ? `<span class="notif-post">《${escapeHTML(n.post_title)}》</span>` : ''}
            </div>
            <div class="notif-when">${fmt(n.created_at)}</div>
          </div>
          ${n.is_read ? '' : '<span class="notif-dot"></span>'}
        </a>
      `;
    }).join('')}</div>`;
  };
  await load();
  // 进入页面即标记全部已读（异步,不阻塞渲染）
  setTimeout(async () => {
    try { await API.markAllRead(); refreshBell(); } catch (_) {}
  }, 800);
  $('#mark-all-read').addEventListener('click', async () => {
    try {
      await API.markAllRead();
      refreshBell();
      toast('已全部标记为已读', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ---------- Messages (批次 7) ----------
async function viewMessages() {
  if (!Auth.user()) { authModal('login'); return viewHome(); }
  app().innerHTML = `
    <section class="notif-page">
      <div class="section-header">
        <h2>💬 私信</h2>
      </div>
      <div id="msg-conv-list">${loadingGrid(3)}</div>
    </section>
  `;
  try {
    const { conversations } = await API.messages.conversations();
    if (!conversations.length) {
      $('#msg-conv-list').innerHTML = `<div class="empty-state"><div class="emoji">💬</div><p>还没有私信，去<a href="#/explore" style="color:var(--primary-glow)">探索</a>页面找人聊天吧</p></div>`;
      return;
    }
    $('#msg-conv-list').innerHTML = `<div class="notif-list">${conversations.map(c => `
      <a class="notif-item ${c.unread ? 'unread' : ''}" href="#/messages/${c.user.id}">
        <img src="${c.user.avatar}" alt="" />
        <div class="notif-body">
          <div class="notif-head">
            <strong>${escapeHTML(c.user.username)}</strong>
            <span class="muted">${escapeHTML(c.last_msg)}</span>
          </div>
          <div class="notif-when">${fmt(c.last_at)}</div>
        </div>
        ${c.unread ? `<span class="notif-dot">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
      </a>
    `).join('')}</div>`;
  } catch (e) {
    $('#msg-conv-list').innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

async function viewConversation(otherId) {
  if (!Auth.user()) { authModal('login'); return viewHome(); }
  app().innerHTML = `
    <section class="chat-page">
      <div class="chat-header" id="chat-header">加载中...</div>
      <div class="chat-thread" id="chat-thread"></div>
      <div class="chat-input-bar">
        <textarea id="chat-input" placeholder="输入消息..." rows="1"></textarea>
        <button class="btn btn-primary" id="chat-send">发送</button>
      </div>
    </section>
  `;
  let otherUser = null;
  try {
    const { user } = await API.messages.thread(otherId);
    otherUser = user;
    $('#chat-header').innerHTML = `
      <a href="#/messages" class="btn btn-ghost btn-sm" style="margin-right:8px">← 返回</a>
      <img src="${user.avatar}" alt="" class="chat-user-avatar" />
      <span>${escapeHTML(user.username)}</span>
    `;
    await renderMessages();
  } catch (e) {
    $('#chat-thread').innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
    return;
  }

  // 标记已读
  API.messages.markRead(otherId).catch(() => {});

  // 发送
  async function doSend() {
    const ta = $('#chat-input');
    const content = ta.value.trim();
    if (!content) return;
    ta.value = '';
    ta.style.height = 'auto';
    try {
      await API.messages.send(otherId, { content });
      await renderMessages();
    } catch (e) { toast(e.message, 'error'); }
  }
  $('#chat-send').addEventListener('click', doSend);
  const ta = $('#chat-input');
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  });
  ta.focus();

  // 轮询新消息
  if (window.__msgTimer) clearInterval(window.__msgTimer);
  function dateKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }
  function friendlyDate(ts) {
    const d = new Date(ts);
    const today = new Date();
    if (dateKey(ts) === dateKey(today)) return '今天';
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    if (dateKey(ts) === dateKey(yest)) return '昨天';
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
  }
  async function renderMessages() {
    try {
      const { messages } = await API.messages.thread(otherId);
      const me = Auth.user();
      const host = $('#chat-thread');
      if (!messages.length) {
        host.innerHTML = `<div class="empty-state" style="flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center"><div class="emoji">💬</div><p>发送第一条消息吧 ✨</p></div>`;
        return;
      }
      let html = '', lastDate = '';
      for (const m of messages) {
        const dk = dateKey(m.created_at);
        if (dk !== lastDate) {
          html += `<div class="chat-date-sep">${friendlyDate(m.created_at)}</div>`;
          lastDate = dk;
        }
        html += `
          <div class="msg-bubble ${m.sender_id === me.id ? 'mine' : 'theirs'}">
            <div class="msg-text">${escapeHTML(m.content)}</div>
            <div class="msg-time">${new Date(m.created_at).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'})}</div>
          </div>`;
      }
      host.innerHTML = html;
      host.scrollTop = host.scrollHeight;
    } catch (_) {}
  }
  window.__msgTimer = setInterval(async () => {
    await renderMessages();
    refreshMsgBadge();
  }, 10000);
}

// ---------- Admin (批次 4) ----------
async function viewAdmin(params) {
  const me = Auth.user();
  if (!me) { authModal('login'); return viewHome(); }
  if (me.role !== 'admin') {
    toast('需要管理员权限', 'error');
    location.hash = '#/';
    return;
  }
  const tab = params.get('tab') || 'overview';
  app().innerHTML = `
    <section class="admin-page">
      <aside class="admin-side">
        <h3>⚙️ 管理后台</h3>
        <a href="#/admin?tab=overview" class="adm-link ${tab === 'overview' ? 'active' : ''}">📊 概览</a>
        <a href="#/admin?tab=users" class="adm-link ${tab === 'users' ? 'active' : ''}">👥 用户</a>
        <a href="#/admin?tab=posts" class="adm-link ${tab === 'posts' ? 'active' : ''}">📄 文章</a>
        <a href="#/admin?tab=comments" class="adm-link ${tab === 'comments' ? 'active' : ''}">💬 评论</a>
      </aside>
      <div class="admin-main" id="adm-main">${loadingGrid(2)}</div>
    </section>
  `;
  const host = $('#adm-main');
  try {
    if (tab === 'overview') await renderAdminOverview(host);
    else if (tab === 'users') await renderAdminUsers(host);
    else if (tab === 'posts') await renderAdminPosts(host);
    else if (tab === 'comments') await renderAdminComments(host);
  } catch (e) {
    host.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

async function renderAdminOverview(host) {
  const o = await API.admin.overview();
  const maxBar = Math.max(1, ...o.trend.flatMap((d) => [d.posts, d.comments, d.users]));
  host.innerHTML = `
    <h2>📊 概览</h2>
    <div class="stats" style="margin-top:0">
      <div class="stat-card"><div class="stat-value">${o.posts}</div><div class="stat-label">文章总数</div></div>
      <div class="stat-card"><div class="stat-value">${o.users}</div><div class="stat-label">注册用户</div></div>
      <div class="stat-card"><div class="stat-value">${o.comments}</div><div class="stat-label">总评论</div></div>
      <div class="stat-card"><div class="stat-value">${o.views}</div><div class="stat-label">总阅读量</div></div>
    </div>
    <div class="admin-card">
      <h3>近 7 日趋势</h3>
      <div class="trend-chart">
        ${o.trend.map((d) => `
          <div class="trend-col">
            <div class="trend-bars">
              <div class="bar bar-posts" style="height:${d.posts / maxBar * 100}%" title="文章 ${d.posts}"></div>
              <div class="bar bar-comments" style="height:${d.comments / maxBar * 100}%" title="评论 ${d.comments}"></div>
              <div class="bar bar-users" style="height:${d.users / maxBar * 100}%" title="用户 ${d.users}"></div>
            </div>
            <div class="trend-date">${d.date}</div>
          </div>
        `).join('')}
      </div>
      <div class="trend-legend">
        <span><i class="dot bar-posts"></i>新文章</span>
        <span><i class="dot bar-comments"></i>新评论</span>
        <span><i class="dot bar-users"></i>新用户</span>
      </div>
    </div>
    <div class="admin-card">
      <h3>最活跃作者</h3>
      <div class="top-authors">
        ${o.topAuthors.map((a) => `
          <a href="#/user/${a.id}" class="top-author">
            <img src="${a.avatar || ''}" alt="" />
            <div>
              <div class="ta-name">${escapeHTML(a.username)}</div>
              <div class="ta-count">${a.posts} 篇文章</div>
            </div>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

async function renderAdminUsers(host) {
  host.innerHTML = `
    <h2>👥 用户管理</h2>
    <div class="admin-toolbar">
      <input id="adm-q" placeholder="搜索用户名 / 邮箱..." />
    </div>
    <div id="adm-users-table"></div>
  `;
  const me = Auth.user();
  const load = async (q = '') => {
    const { users } = await API.admin.users({ q, limit: 100 });
    $('#adm-users-table').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>ID</th><th>用户</th><th>邮箱</th><th>角色</th><th>注册时间</th><th>操作</th></tr></thead>
        <tbody>${users.map((u) => `
          <tr>
            <td>${u.id}</td>
            <td><div class="cell-user"><img src="${u.avatar || ''}" alt="" /><span>${escapeHTML(u.username)}</span></div></td>
            <td class="muted">${u.id === me.id ? '(自己)' : '—'}</td>
            <td>
              <select class="role-sel" data-id="${u.id}" ${u.id === me.id ? 'disabled' : ''}>
                <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
              </select>
            </td>
            <td class="muted">${fmt(u.created_at)}</td>
            <td>
              ${u.id === me.id ? '' : `<button class="btn btn-danger btn-sm" data-del-u="${u.id}">删除</button>`}
            </td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
    $$('.role-sel').forEach((sel) => sel.addEventListener('change', async () => {
      try {
        await API.admin.setUserRole(sel.dataset.id, sel.value);
        toast('角色已更新', 'success');
      } catch (e) { toast(e.message, 'error'); load(q); }
    }));
    $$('[data-del-u]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('删除该用户？其所有文章/评论也会被级联删除！')) return;
      try {
        await API.admin.deleteUser(b.dataset.delU);
        toast('已删除', 'success'); load(q);
      } catch (e) { toast(e.message, 'error'); }
    }));
  };
  await load();
  let t;
  $('#adm-q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => load(e.target.value.trim()), 250);
  });
}

async function renderAdminPosts(host) {
  host.innerHTML = `
    <h2>📄 文章管理</h2>
    <div class="admin-toolbar">
      <input id="adm-q" placeholder="搜索标题 / 内容..." />
      <select id="adm-status">
        <option value="">全部状态</option>
        <option value="published">已发布</option>
        <option value="draft">草稿</option>
        <option value="scheduled">定时</option>
      </select>
    </div>
    <div id="adm-posts-table"></div>
  `;
  const load = async () => {
    const q = $('#adm-q').value.trim();
    const status = $('#adm-status').value;
    const { posts } = await API.admin.posts({ q, status, limit: 50 });
    const statusBadge = (p) => p.published
      ? '<span class="badge ok">已发布</span>'
      : (p.publish_at
        ? `<span class="badge warn">⏰ ${fmt(p.publish_at)}</span>`
        : '<span class="badge mute">草稿</span>');
    $('#adm-posts-table').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>ID</th><th>标题</th><th>作者</th><th>分类</th><th>👁</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody>${posts.map((p) => `
          <tr>
            <td>${p.id}</td>
            <td><a href="#/post/${p.id}" target="_blank">${escapeHTML(p.title)}</a></td>
            <td>${escapeHTML(p.author)}</td>
            <td class="muted">${escapeHTML(p.category || '')}</td>
            <td>${p.views}</td>
            <td>${statusBadge(p)}</td>
            <td class="muted">${fmt(p.created_at)}</td>
            <td><button class="btn btn-danger btn-sm" data-del-p="${p.id}">删除</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
    $$('[data-del-p]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('确定删除该文章？')) return;
      try { await API.admin.deletePost(b.dataset.delP); toast('已删除', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  };
  await load();
  let t;
  $('#adm-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
  $('#adm-status').addEventListener('change', load);
}

async function renderAdminComments(host) {
  host.innerHTML = `
    <h2>💬 评论管理</h2>
    <div class="admin-toolbar">
      <input id="adm-q" placeholder="搜索评论内容..." />
    </div>
    <div id="adm-comm-table"></div>
  `;
  const load = async () => {
    const q = $('#adm-q').value.trim();
    const { comments } = await API.admin.comments({ q, limit: 80 });
    $('#adm-comm-table').innerHTML = `
      <table class="admin-table">
        <thead><tr><th>ID</th><th>用户</th><th>评论内容</th><th>文章</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>${comments.map((c) => `
          <tr>
            <td>${c.id}</td>
            <td><div class="cell-user"><img src="${c.avatar || ''}" alt="" /><span>${escapeHTML(c.username)}</span></div></td>
            <td class="cell-text">${escapeHTML(c.content)}</td>
            <td>${c.post_title ? `<a href="#/post/${c.post_id}" target="_blank">${escapeHTML(c.post_title)}</a>` : '<span class="muted">已删除</span>'}</td>
            <td class="muted">${fmt(c.created_at)}</td>
            <td><button class="btn btn-danger btn-sm" data-del-c="${c.id}">删除</button></td>
          </tr>
        `).join('')}</tbody>
      </table>
    `;
    $$('[data-del-c]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('删除该评论？')) return;
      try { await API.admin.deleteComment(b.dataset.delC); toast('已删除', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    }));
  };
  await load();
  let t;
  $('#adm-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
}

// =========================================================================
//  路由
// =========================================================================
function router() {
  if (window.cleanupEffects) cleanupEffects();
  if (window.__videoPlayer) { try { window.__videoPlayer.destroy(); } catch (_) {} window.__videoPlayer = null; }
  if (window.__msgTimer) { clearInterval(window.__msgTimer); window.__msgTimer = null; }
  const raw = location.hash.slice(1) || '/';
  const [pathname, qs] = raw.split('?');
  const params = new URLSearchParams(qs || '');

  $$('.nav-links a').forEach((a) => a.classList.remove('active'));

  if (pathname === '/' || pathname === '') {
    $$('.nav-links a[data-route=home]').forEach((a) => a.classList.add('active'));
    viewHome();
  } else if (pathname === '/explore') {
    $$('.nav-links a[data-route=explore]').forEach((a) => a.classList.add('active'));
    viewExplore(params);
  } else if (pathname.startsWith('/post/')) {
    viewPost(pathname.split('/')[2]);
  } else if (pathname === '/write') {
    $$('.nav-links a[data-route=write]').forEach((a) => a.classList.add('active'));
    viewWrite(params);
  } else if (pathname === '/me') {
    viewMe();
  } else if (pathname.startsWith('/user/')) {
    viewUser(pathname.split('/')[2]);
  } else if (pathname === '/notifications') {
    viewNotifications();
  } else if (pathname === '/messages') {
    viewMessages();
  } else if (pathname.startsWith('/messages/')) {
    viewConversation(pathname.split('/')[2]);
  } else if (pathname === '/admin') {
    viewAdmin(params);
  } else {
    app().innerHTML = `<div class="empty-state"><div class="emoji">🌌</div><p>页面不存在</p><a href="#/" class="btn" style="margin-top:16px">回首页</a></div>`;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- 初始化 ----------
function initSearch() {
  const input = $('#search-input');
  let dropdown, timer;

  function removeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  input.addEventListener('focus', () => {
    if (input.value.trim()) triggerSearch();
  });
  input.addEventListener('blur', () => {
    setTimeout(removeDropdown, 200);
  });
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (!v) { removeDropdown(); return; }
    timer = setTimeout(triggerSearch, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      removeDropdown();
      const v = input.value.trim();
      if (v) location.hash = `#/explore?q=${encodeURIComponent(v)}`;
    }
    if (e.key === 'Escape') removeDropdown();
  });

  async function triggerSearch() {
    const q = input.value.trim();
    if (!q) { removeDropdown(); return; }
    removeDropdown();
    dropdown = document.createElement('div');
    dropdown.className = 'search-dropdown';
    dropdown.innerHTML = '<div class="search-dd-loading">搜索中...</div>';
    input.insertAdjacentElement('afterend', dropdown);

    try {
      const [userRes, postRes] = await Promise.all([
        API.searchUsers({ q, limit: 5 }),
        API.listPosts({ q, limit: 5 }),
      ]);
      let html = '';
      // 用户结果
      if (userRes.users?.length) {
        html += `<div class="search-dd-group"><div class="search-dd-title">👤 用户</div>`;
        html += userRes.users.map(u => `
          <a class="search-dd-item" href="#/user/${u.id}">
            <img src="${u.avatar}" alt="" />
            <div class="search-dd-info">
              <span class="search-dd-name">${escapeHTML(u.username)}</span>
              <span class="search-dd-desc">${escapeHTML(u.bio || '')}${u.posts != null ? ` · ${u.posts} 篇文章` : ''}</span>
            </div>
          </a>
        `).join('');
        html += `</div>`;
      }
      // 文章结果
      if (postRes.posts?.length) {
        html += `<div class="search-dd-group"><div class="search-dd-title">📄 文章</div>`;
        html += postRes.posts.map(p => `
          <a class="search-dd-item" href="#/post/${p.id}">
            ${p.cover ? `<img class="search-dd-img" src="${p.cover}" alt="" />` : '<div class="search-dd-img-placeholder">📄</div>'}
            <div class="search-dd-info">
              <span class="search-dd-name">${escapeHTML(p.title)}</span>
              <span class="search-dd-desc">${escapeHTML(p.author?.username || '')} · 👁 ${p.views}</span>
            </div>
          </a>
        `).join('');
        html += `</div>`;
      }
      if (!userRes.users?.length && !postRes.posts?.length) {
        html = `<div class="search-dd-empty">没有找到相关内容</div>`;
      }
      html += `<a class="search-dd-all" href="#/explore?q=${encodeURIComponent(q)}">查看全部结果 →</a>`;
      dropdown.innerHTML = html;
    } catch (_) {
      dropdown.innerHTML = `<div class="search-dd-empty">搜索出错了</div>`;
    }
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderUserMenu();
  initSearch();
  router();
  API.uploadLimits().then(l => { window.__uploadLimits = l; }).catch(() => {});
});

// expose for inline handlers
window.authModal = authModal;
