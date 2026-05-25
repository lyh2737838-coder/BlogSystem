// =========================================================================
//  BlogSystem · 单页前端
// =========================================================================

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- 主题 ----------
function initTheme() {
  const saved = localStorage.getItem('blog_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateHljsTheme(saved);
  $('#theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('blog_theme', next);
    updateHljsTheme(next);
  });
}
function updateHljsTheme(theme) {
  const link = $('#hljs-theme');
  link.href = theme === 'dark'
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
  root.innerHTML = `
    <button class="user-avatar-btn" id="user-btn">
      <img src="${user.avatar}" alt="" />
      <span>${user.username}</span>
    </button>
    <div class="user-dropdown" id="user-dropdown" style="display:none">
      <a href="#/me">📝 个人中心</a>
      <a href="#/write">✍️ 写文章</a>
      <a href="#/user/${user.id}">👤 我的主页</a>
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
  $('#logout').addEventListener('click', () => {
    Auth.clear();
    renderUserMenu();
    location.hash = '#/';
    toast('已退出', 'success');
  });
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
  return `
    <article class="post-card" data-href="#/post/${p.id}" style="animation-delay:${delay}ms">
      <div class="post-cover">
        ${p.cover ? `<img src="${p.cover}" alt="" loading="lazy" />` : ''}
        <span class="post-category">${p.category || '随笔'}</span>
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

  app().innerHTML = `
    <article class="article-page">
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

      ${p.cover ? `<div class="article-cover"><img src="${p.cover}" alt="" /></div>` : ''}

      <div class="article-content">${renderMD(p.content)}</div>

      ${p.tags?.length ? `<div class="tag-row" style="margin-top:32px">${p.tags.map(t => `<a class="tag" href="#/explore?tag=${encodeURIComponent(t)}">#${t}</a>`).join('')}</div>` : ''}

      <div class="article-bottom-bar">
        <button class="like-btn ${p.liked ? 'liked' : ''}" id="like-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="${p.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span id="like-count">${p.likes}</span> 喜欢
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
    $('#comments-list').innerHTML = comments.length ? comments.map((c) => `
      <div class="comment-item">
        <img src="${c.avatar}" alt="" />
        <div class="comment-body">
          <div class="comment-head">
            <span class="name">${escapeHTML(c.username)}</span>
            <span class="when">· ${fmt(c.created_at)}</span>
            ${me && (me.id === c.user_id || me.role === 'admin') ? `<a style="margin-left:auto;color:#f87171;cursor:pointer;font-size:12px" data-del-c="${c.id}">删除</a>` : ''}
          </div>
          <div class="comment-text">${escapeHTML(c.content)}</div>
        </div>
      </div>
    `).join('') : `<div class="empty-state" style="padding:30px"><p>还没有评论，来抢沙发吧</p></div>`;

    $$('[data-del-c]').forEach((a) =>
      a.addEventListener('click', async () => {
        if (!confirm('删除这条评论？')) return;
        try {
          await API.deleteComment(a.dataset.delC);
          loadComments();
        } catch (e) { toast(e.message, 'error'); }
      })
    );
  }
}

// ---------- Write / Edit ----------
async function viewWrite(params) {
  if (!Auth.user()) {
    authModal('login');
    return viewHome();
  }
  const id = params.get('id');
  let post = { title: '', content: '', excerpt: '', cover: '', category: '随笔', tags: [] };
  if (id) {
    try {
      const r = await API.getPost(id);
      post = r.post;
    } catch (e) { toast(e.message, 'error'); }
  }

  app().innerHTML = `
    <section class="editor-page">
      <div class="editor-toolbar">
        <input class="title-input" id="ed-title" placeholder="文章标题..." value="${escapeHTML(post.title)}" />
        <input class="cover-input" id="ed-cover" placeholder="封面图 URL" value="${escapeHTML(post.cover)}" style="width:220px" />
        <select id="ed-cat">
          ${['随笔','前端','后端','设计','生活','公告'].map(c => `<option ${c === post.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <input class="tag-input" id="ed-tags" placeholder="标签，逗号分隔" value="${(post.tags || []).join(',')}" style="width:200px" />
        <button class="btn btn-primary" id="ed-save">${id ? '更新' : '发布'}</button>
      </div>
      <div class="editor-grid">
        <div class="editor-pane">
          <div class="editor-pane-head">Markdown</div>
          <textarea id="ed-content" placeholder="# 标题&#10;&#10;开始写吧 ✨...">${escapeHTML(post.content)}</textarea>
        </div>
        <div class="editor-pane">
          <div class="editor-pane-head">实时预览</div>
          <div class="preview article-content" id="ed-preview"></div>
        </div>
      </div>
    </section>
  `;

  const content = $('#ed-content');
  const preview = $('#ed-preview');
  const update = () => {
    preview.innerHTML = renderMD(content.value);
    if (window.hljs) $$('pre code', preview).forEach((b) => hljs.highlightElement(b));
  };
  content.addEventListener('input', update);
  update();

  $('#ed-save').addEventListener('click', async () => {
    const data = {
      title: $('#ed-title').value.trim(),
      content: $('#ed-content').value,
      cover: $('#ed-cover').value.trim(),
      category: $('#ed-cat').value,
      tags: $('#ed-tags').value.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (!data.title || !data.content) return toast('标题和内容不能为空', 'error');
    try {
      const r = id ? await API.updatePost(id, data) : await API.createPost(data);
      toast(id ? '已更新' : '发布成功', 'success');
      location.hash = `#/post/${r.post.id}`;
    } catch (e) { toast(e.message, 'error'); }
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
    <div class="section-header"><h2>我的文章</h2></div>
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

  const r = await API.listPosts({ author: user.id, limit: 50 });
  $('#my-posts').innerHTML = r.posts.length
    ? `<div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 40)).join('')}</div>`
    : `<div class="empty-state"><div class="emoji">✍️</div><p>还没有写文章，<a href="#/write" style="color:var(--primary-glow)">开始写第一篇 →</a></p></div>`;
  bindCardClicks();
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
  app().innerHTML = `
    <section class="profile-hero">
      <img src="${user.avatar}" alt="" />
      <h2>${escapeHTML(user.username)}</h2>
      <p class="bio">${escapeHTML(user.bio || '这个人很神秘')}</p>
      <div class="meta">发布了 ${user.posts} 篇文章 · 注册于 ${fmt(user.created_at)}</div>
    </section>
    <div class="section-header"><h2>${user.username} 的文章</h2></div>
    <div id="u-posts">${loadingGrid(3)}</div>
  `;
  const r = await API.listPosts({ author: id, limit: 50 });
  $('#u-posts').innerHTML = r.posts.length
    ? `<div class="posts-grid">${r.posts.map((p, i) => postCardHTML(p, i * 40)).join('')}</div>`
    : `<div class="empty-state"><div class="emoji">📭</div><p>TA 还没有发布文章</p></div>`;
  bindCardClicks();
}

// =========================================================================
//  路由
// =========================================================================
function router() {
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
  } else {
    app().innerHTML = `<div class="empty-state"><div class="emoji">🌌</div><p>页面不存在</p><a href="#/" class="btn" style="margin-top:16px">回首页</a></div>`;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- 初始化 ----------
function initSearch() {
  const input = $('#search-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = input.value.trim();
      if (v) location.hash = `#/explore?q=${encodeURIComponent(v)}`;
    }
  });
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderUserMenu();
  initSearch();
  router();
});

// expose for inline handlers
window.authModal = authModal;
