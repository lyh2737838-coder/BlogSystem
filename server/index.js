require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'blog-system-secret-key-change-me-in-prod';

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- helpers ----------
function authOptional(req, _res, next) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try { req.user = jwt.verify(h.slice(7), JWT_SECRET); } catch (_) {}
  }
  next();
}

function authRequired(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch (_) { res.status(401).json({ error: 'token 失效' }); }
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, email, ...rest } = u;
  return rest;
}

async function hydratePost(p, userId) {
  if (!p) return null;
  const u = await db.findUserById(p.user_id);
  const [tags, likes, comments, liked] = await Promise.all([
    db.tagsForPost(p.id),
    db.countLikes(p.id),
    db.countComments(p.id),
    userId ? db.hasLiked(p.id, userId) : Promise.resolve(false),
  ]);
  return {
    ...p,
    author: u ? { id: u.id, username: u.username, avatar: u.avatar, bio: u.bio } : null,
    tags, likes, comments, liked,
  };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- auth ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: '参数不全' });
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (await db.findUserByLogin(username) || await db.findUserByLogin(email)) {
    return res.status(400).json({ error: '用户名或邮箱已被使用' });
  }
  const user = await db.createUser({
    username, email,
    password_hash: bcrypt.hashSync(password, 10),
    avatar: `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(username)}`,
  });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(user) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '参数不全' });
  const user = await db.findUserByLogin(username);
  if (!user) return res.status(400).json({ error: '用户不存在' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(400).json({ error: '密码错误' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(user) });
}));

app.get('/api/auth/me', authRequired, wrap(async (req, res) => {
  const user = await db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: publicUser(user) });
}));

app.put('/api/auth/me', authRequired, wrap(async (req, res) => {
  const { bio, avatar } = req.body || {};
  const patch = {};
  if (bio != null) patch.bio = bio;
  if (avatar != null) patch.avatar = avatar;
  const user = await db.updateUser(req.user.id, patch);
  res.json({ user: publicUser(user) });
}));

// ---------- posts ----------
app.get('/api/posts', authOptional, wrap(async (req, res) => {
  const { q, tag, category, author, page = 1, limit = 12, sort = 'new' } = req.query;
  const { rows, total } = await db.searchPosts({ q, tag, category, author, sort, page, limit });
  const posts = await Promise.all(rows.map((p) => hydratePost(p, req.user?.id)));
  res.json({ posts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

app.get('/api/posts/:id', authOptional, wrap(async (req, res) => {
  const p = await db.findPost(req.params.id);
  if (!p) return res.status(404).json({ error: '文章不存在' });
  await db.incrementViews(p.id);
  p.views = (p.views || 0) + 1;
  res.json({ post: await hydratePost(p, req.user?.id) });
}));

app.post('/api/posts', authRequired, wrap(async (req, res) => {
  const { title, content, excerpt, cover, category, tags } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: '标题与内容不能为空' });
  const p = await db.createPost({
    user_id: req.user.id,
    title, content,
    excerpt: excerpt || content.replace(/[#>*`\-]/g, '').slice(0, 120),
    cover: cover || '', category: category || '随笔',
  });
  if (Array.isArray(tags)) await db.setPostTags(p.id, tags);
  res.json({ post: await hydratePost(p, req.user.id) });
}));

app.put('/api/posts/:id', authRequired, wrap(async (req, res) => {
  const p = await db.findPost(req.params.id);
  if (!p) return res.status(404).json({ error: '文章不存在' });
  if (p.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { title, content, excerpt, cover, category, tags } = req.body || {};
  const patch = {};
  if (title != null) patch.title = title;
  if (content != null) patch.content = content;
  if (excerpt != null) patch.excerpt = excerpt;
  if (cover != null) patch.cover = cover;
  if (category != null) patch.category = category;
  await db.updatePost(p.id, patch);
  if (Array.isArray(tags)) await db.setPostTags(p.id, tags);
  res.json({ post: await hydratePost(await db.findPost(p.id), req.user.id) });
}));

app.delete('/api/posts/:id', authRequired, wrap(async (req, res) => {
  const p = await db.findPost(req.params.id);
  if (!p) return res.status(404).json({ error: '文章不存在' });
  if (p.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  await db.deletePost(p.id);
  res.json({ ok: true });
}));

// ---------- likes ----------
app.post('/api/posts/:id/like', authRequired, wrap(async (req, res) => {
  const liked = await db.toggleLike(req.params.id, req.user.id);
  res.json({ liked });
}));

// ---------- comments ----------
app.get('/api/posts/:id/comments', wrap(async (req, res) => {
  res.json({ comments: await db.commentsFor(req.params.id) });
}));

app.post('/api/posts/:id/comments', authRequired, wrap(async (req, res) => {
  const { content, parent_id } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
  const c = await db.createComment({
    post_id: req.params.id, user_id: req.user.id,
    content: content.trim(), parent_id,
  });
  const u = await db.findUserById(req.user.id);
  res.json({ comment: { ...c, username: u.username, avatar: u.avatar } });
}));

app.delete('/api/comments/:id', authRequired, wrap(async (req, res) => {
  const c = await db.findComment(req.params.id);
  if (!c) return res.status(404).json({ error: '评论不存在' });
  if (c.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  await db.deleteComment(c.id);
  res.json({ ok: true });
}));

// ---------- tags & stats ----------
app.get('/api/tags', wrap(async (_req, res) => res.json({ tags: await db.allTagsWithCount() })));
app.get('/api/categories', wrap(async (_req, res) => res.json({ categories: await db.allCategoriesWithCount() })));
app.get('/api/stats', wrap(async (_req, res) => res.json(await db.stats())));

app.get('/api/users/:id', wrap(async (req, res) => {
  const u = await db.findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: { ...publicUser(u), posts: await db.countUserPosts(u.id) } });
}));

// ---------- SPA fallback ----------
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'server error' });
});

(async () => {
  try {
    const conn = await db.pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
  } catch (e) {
    console.error('\n❌ MySQL 连接失败：', e.code || e.message);
    console.error('请检查 .env 中的 DB_HOST / DB_USER / DB_PASSWORD / DB_NAME。');
    console.error('如果还没建库，请先运行: node server/migrate.js\n');
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║  BlogSystem 已启动 (MySQL)              ║`);
    console.log(`  ║  访问: http://localhost:${PORT}             ║`);
    console.log(`  ║  账号: admin / admin123                  ║`);
    console.log(`  ║         lyh   / user123                  ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
  });
})();
