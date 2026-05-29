require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const db = require('./db');
const cache = require('./cache');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'blog-system-secret-key-change-me-in-prod';

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- 文件上传 (multer) ----------
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8) || '.png';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('仅支持图片文件'));
    cb(null, true);
  },
});

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

function adminRequired(req, res, next) {
  authRequired(req, res, async () => {
    // jwt 里有 role,但用户角色可能被改过,以 DB 为准
    const u = await db.findUserById(req.user.id);
    if (!u || u.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
    req.user.role = u.role;
    next();
  });
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, email, ...rest } = u;
  return rest;
}

async function hydratePost(p, userId) {
  if (!p) return null;
  const u = await db.findUserById(p.user_id);
  const [tags, likes, comments, bookmarks, liked, bookmarked] = await Promise.all([
    db.tagsForPost(p.id),
    db.countLikes(p.id),
    db.countComments(p.id),
    db.countBookmarks(p.id),
    userId ? db.hasLiked(p.id, userId) : Promise.resolve(false),
    userId ? db.hasBookmarked(p.id, userId) : Promise.resolve(false),
  ]);
  return {
    ...p,
    author: u ? { id: u.id, username: u.username, avatar: u.avatar, bio: u.bio } : null,
    tags, likes, comments, bookmarks, liked, bookmarked,
  };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// 写操作后失效相关缓存
async function invalidatePost(postId) {
  await Promise.all([
    cache.delByPrefix('posts:list:'),
    cache.del(`posts:item:${postId}`),
    cache.del('tags'),
    cache.del('categories'),
    cache.del('stats'),
  ]);
}

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
  // 只对未登录用户走缓存(登录用户的 liked 字段因人而异)
  if (!req.user) {
    const ck = `posts:list:${JSON.stringify({ q, tag, category, author, page, limit, sort })}`;
    const payload = await cache.wrap(ck, 60, async () => {
      const { rows, total } = await db.searchPosts({ q, tag, category, author, sort, page, limit });
      const posts = await Promise.all(rows.map((p) => hydratePost(p, null)));
      return { posts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
    });
    return res.json(payload);
  }
  const { rows, total } = await db.searchPosts({ q, tag, category, author, sort, page, limit });
  const posts = await Promise.all(rows.map((p) => hydratePost(p, req.user.id)));
  res.json({ posts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

app.get('/api/posts/:id', authOptional, wrap(async (req, res) => {
  const p = await db.findPost(req.params.id);
  if (!p) return res.status(404).json({ error: '文章不存在' });
  // 未发布的草稿/定时文章：仅作者本人或管理员可见
  if (!p.published) {
    const me = req.user;
    if (!me || (me.id !== p.user_id && me.role !== 'admin')) {
      return res.status(404).json({ error: '文章不存在' });
    }
    // 草稿不计入浏览量、不走缓存
    return res.json({ post: await hydratePost(p, me.id) });
  }
  await db.incrementViews(p.id);
  p.views = (p.views || 0) + 1;
  if (!req.user) {
    const ck = `posts:item:${p.id}`;
    const post = await cache.wrap(ck, 300, () => hydratePost(p, null));
    // 浏览量是实时的,覆盖缓存里的旧值
    return res.json({ post: { ...post, views: p.views } });
  }
  res.json({ post: await hydratePost(p, req.user.id) });
}));

app.post('/api/posts', authRequired, wrap(async (req, res) => {
  const { title, content, excerpt, cover, category, tags, published, publish_at,
          media_type, video_url, video_poster, audio_url, effects, bgm_url } = req.body || {};
  if (!title) return res.status(400).json({ error: '标题不能为空' });
  if (media_type !== 'video' && !content) return res.status(400).json({ error: '内容不能为空' });
  let pub = 1;
  let pubAt = null;
  if (published === 0 || published === false) {
    pub = 0;
    if (publish_at && Number(publish_at) > Date.now()) pubAt = Number(publish_at);
  }
  const p = await db.createPost({
    user_id: req.user.id,
    title, content: content || '',
    excerpt: excerpt || (content || '').replace(/[#>*`\-]/g, '').slice(0, 120),
    cover: cover || '', category: category || '随笔',
    published: pub, publish_at: pubAt,
    media_type: media_type || 'article',
    video_url: video_url || '', video_poster: video_poster || '',
    audio_url: audio_url || '', effects: effects || '', bgm_url: bgm_url || '',
  });
  if (Array.isArray(tags)) await db.setPostTags(p.id, tags);
  await invalidatePost(p.id);
  res.json({ post: await hydratePost(p, req.user.id) });
}));

app.put('/api/posts/:id', authRequired, wrap(async (req, res) => {
  const p = await db.findPost(req.params.id);
  if (!p) return res.status(404).json({ error: '文章不存在' });
  if (p.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  const { title, content, excerpt, cover, category, tags, published, publish_at,
          media_type, video_url, video_poster, audio_url, effects, bgm_url } = req.body || {};
  const patch = {};
  if (title != null) patch.title = title;
  if (content != null) patch.content = content;
  if (excerpt != null) patch.excerpt = excerpt;
  if (cover != null) patch.cover = cover;
  if (category != null) patch.category = category;
  if (media_type != null) patch.media_type = media_type;
  if (video_url != null) patch.video_url = video_url;
  if (video_poster != null) patch.video_poster = video_poster;
  if (audio_url != null) patch.audio_url = audio_url;
  if (effects != null) patch.effects = effects;
  if (bgm_url != null) patch.bgm_url = bgm_url;
  if (published === 1 || published === true) {
    patch.published = 1; patch.publish_at = null;
  } else if (published === 0 || published === false) {
    patch.published = 0;
    patch.publish_at = (publish_at && Number(publish_at) > Date.now()) ? Number(publish_at) : null;
  } else if (publish_at != null) {
    // 仅更新 publish_at（不改 published 状态）
    patch.publish_at = publish_at ? Number(publish_at) : null;
  }
  await db.updatePost(p.id, patch);
  if (Array.isArray(tags)) await db.setPostTags(p.id, tags);
  await invalidatePost(p.id);
  res.json({ post: await hydratePost(await db.findPost(p.id), req.user.id) });
}));

app.delete('/api/posts/:id', authRequired, wrap(async (req, res) => {
  const p = await db.findPost(req.params.id);
  if (!p) return res.status(404).json({ error: '文章不存在' });
  if (p.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  await db.deletePost(p.id);
  await invalidatePost(p.id);
  res.json({ ok: true });
}));

// ---------- likes ----------
app.post('/api/posts/:id/like', authRequired, wrap(async (req, res) => {
  const post = await db.findPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  const liked = await db.toggleLike(req.params.id, req.user.id);
  await cache.del(`posts:item:${req.params.id}`);
  // 仅在点赞（非取消）时发通知，自己不通知自己
  if (liked) {
    await db.createNotification({
      user_id: post.user_id, actor_id: req.user.id,
      type: 'like', post_id: post.id,
    });
  }
  res.json({ liked });
}));

// ---------- bookmarks ----------
app.post('/api/posts/:id/bookmark', authRequired, wrap(async (req, res) => {
  const p = await db.findPost(req.params.id);
  if (!p) return res.status(404).json({ error: '文章不存在' });
  const bookmarked = await db.toggleBookmark(req.params.id, req.user.id);
  await cache.del(`posts:item:${req.params.id}`);
  res.json({ bookmarked });
}));

app.get('/api/me/bookmarks', authRequired, wrap(async (req, res) => {
  const { page = 1, limit = 24 } = req.query;
  const { rows, total } = await db.bookmarksForUser(req.user.id, page, limit);
  const posts = await Promise.all(rows.map((p) => hydratePost(p, req.user.id)));
  res.json({ posts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

// ---------- comments ----------
app.get('/api/posts/:id/comments', wrap(async (req, res) => {
  res.json({ comments: await db.commentsFor(req.params.id) });
}));

app.post('/api/posts/:id/comments', authRequired, wrap(async (req, res) => {
  const { content, parent_id } = req.body || {};
  if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
  const post = await db.findPost(req.params.id);
  if (!post) return res.status(404).json({ error: '文章不存在' });
  const c = await db.createComment({
    post_id: req.params.id, user_id: req.user.id,
    content: content.trim(), parent_id,
  });
  const u = await db.findUserById(req.user.id);
  await Promise.all([
    cache.del(`posts:item:${req.params.id}`),
    cache.delByPrefix('posts:list:'),
    cache.del('stats'),
    db.createNotification({
      user_id: post.user_id, actor_id: req.user.id,
      type: 'comment', post_id: post.id,
    }),
  ]);
  res.json({ comment: { ...c, username: u.username, avatar: u.avatar } });
}));

app.delete('/api/comments/:id', authRequired, wrap(async (req, res) => {
  const c = await db.findComment(req.params.id);
  if (!c) return res.status(404).json({ error: '评论不存在' });
  if (c.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: '无权操作' });
  await db.deleteComment(c.id);
  await Promise.all([
    cache.del(`posts:item:${c.post_id}`),
    cache.delByPrefix('posts:list:'),
    cache.del('stats'),
  ]);
  res.json({ ok: true });
}));

// ---------- tags & stats ----------
app.get('/api/tags', wrap(async (_req, res) =>
  res.json({ tags: await cache.wrap('tags', 300, () => db.allTagsWithCount()) })
));
app.get('/api/categories', wrap(async (_req, res) =>
  res.json({ categories: await cache.wrap('categories', 300, () => db.allCategoriesWithCount()) })
));
app.get('/api/stats', wrap(async (_req, res) =>
  res.json(await cache.wrap('stats', 60, () => db.stats()))
));

app.get('/api/users/:id', authOptional, wrap(async (req, res) => {
  const u = await db.findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const me = req.user;
  const [followers, following, posts, followed] = await Promise.all([
    db.countFollowers(u.id),
    db.countFollowing(u.id),
    db.countUserPosts(u.id),
    me && me.id !== u.id ? db.isFollowing(me.id, u.id) : Promise.resolve(false),
  ]);
  res.json({ user: { ...publicUser(u), posts, followers, following, followed } });
}));

// ---------- drafts (批次 2) ----------
app.get('/api/me/drafts', authRequired, wrap(async (req, res) => {
  const rows = await db.draftsForUser(req.user.id);
  // 不走 hydratePost（草稿不需要 likes/comments 聚合）
  const me = await db.findUserById(req.user.id);
  const author = { id: me.id, username: me.username, avatar: me.avatar };
  const drafts = rows.map((p) => ({
    ...p,
    author,
    isDraft: !p.publish_at,
    isScheduled: !!p.publish_at,
  }));
  res.json({ drafts });
}));

// ---------- upload (批次 2) ----------
app.post('/api/upload', authRequired, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    res.json({ url: `/uploads/${req.file.filename}`, size: req.file.size });
  });
});

// 视频上传（默认无上限；设 BLOG_VIDEO_MAX_MB=数字 可加上限，0/未设=无上限）
const VIDEO_MAX_MB = parseInt(process.env.BLOG_VIDEO_MAX_MB || '0', 10) || 0;
const VIDEO_MAX_BYTES = VIDEO_MAX_MB > 0 ? VIDEO_MAX_MB * 1024 * 1024 : Infinity;
const fmtMB = (mb) => mb >= 1024 ? (mb / 1024).toFixed(1) + 'GB' : mb + 'MB';
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8) || '.mp4';
      cb(null, `v-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: VIDEO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!/^video\//.test(file.mimetype)) return cb(new Error('仅支持视频文件'));
    cb(null, true);
  },
});
app.post('/api/upload/video', authRequired, (req, res) => {
  uploadVideo.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `视频超出上限（${fmtMB(VIDEO_MAX_MB)}）` : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    res.json({ url: `/uploads/${req.file.filename}`, size: req.file.size });
  });
});

// 暴露上传限制给前端，省得写死。video_mb=0 代表无上限
app.get('/api/upload/limits', (_req, res) => {
  res.json({ video_mb: VIDEO_MAX_MB, audio_mb: 50, image_mb: 5 });
});

// 音频上传（最大 50MB）
const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8) || '.mp3';
      cb(null, `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^audio\//.test(file.mimetype)) return cb(new Error('仅支持音频文件'));
    cb(null, true);
  },
});
app.post('/api/upload/audio', authRequired, (req, res) => {
  uploadAudio.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: '未收到文件' });
    res.json({ url: `/uploads/${req.file.filename}`, size: req.file.size });
  });
});

// ---------- follows (批次 3) ----------
app.post('/api/users/:id/follow', authRequired, wrap(async (req, res) => {
  const target = await db.findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  if (target.id === req.user.id) return res.status(400).json({ error: '不能关注自己' });
  const followed = await db.toggleFollow(req.user.id, target.id);
  await cache.del(`users:${target.id}`);
  if (followed) {
    await db.createNotification({
      user_id: target.id, actor_id: req.user.id, type: 'follow',
    });
  }
  res.json({ followed });
}));

app.get('/api/users/:id/followers', wrap(async (req, res) => {
  res.json({ users: await db.followersOf(req.params.id) });
}));

app.get('/api/users/:id/following', wrap(async (req, res) => {
  res.json({ users: await db.followingOf(req.params.id) });
}));

// ---------- notifications (批次 3) ----------
app.get('/api/notifications', authRequired, wrap(async (req, res) => {
  res.json({ notifications: await db.listNotifications(req.user.id, 100) });
}));

app.get('/api/notifications/unread', authRequired, wrap(async (req, res) => {
  res.json({ count: await db.unreadNotifCount(req.user.id) });
}));

app.post('/api/notifications/read', authRequired, wrap(async (req, res) => {
  await db.markAllNotifRead(req.user.id);
  res.json({ ok: true });
}));

// ---------- admin (批次 4) ----------
app.get('/api/admin/overview', adminRequired, wrap(async (_req, res) => {
  res.json(await db.adminOverview());
}));

app.get('/api/admin/users', adminRequired, wrap(async (req, res) => {
  const { page = 1, limit = 20, q = '' } = req.query;
  const { rows, total } = await db.adminListUsers({ page, limit, q });
  res.json({ users: rows.map(publicUser), total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

app.delete('/api/admin/users/:id', adminRequired, wrap(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  const u = await db.findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  await db.adminDeleteUser(req.params.id);
  await Promise.all([
    cache.delByPrefix('posts:list:'),
    cache.del('stats'), cache.del('tags'), cache.del('categories'),
    cache.del(`users:${req.params.id}`),
  ]);
  res.json({ ok: true });
}));

app.put('/api/admin/users/:id/role', adminRequired, wrap(async (req, res) => {
  const { role } = req.body || {};
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: '不能修改自己的角色' });
  const u = await db.adminSetUserRole(req.params.id, role);
  await cache.del(`users:${req.params.id}`);
  res.json({ user: publicUser(u) });
}));

app.get('/api/admin/posts', adminRequired, wrap(async (req, res) => {
  const { page = 1, limit = 20, q = '', status = '' } = req.query;
  const { rows, total } = await db.adminListPosts({ page, limit, q, status });
  res.json({ posts: rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

app.delete('/api/admin/posts/:id', adminRequired, wrap(async (req, res) => {
  const p = await db.findPost(req.params.id);
  if (!p) return res.status(404).json({ error: '文章不存在' });
  await db.deletePost(p.id);
  await invalidatePost(p.id);
  res.json({ ok: true });
}));

app.get('/api/admin/comments', adminRequired, wrap(async (req, res) => {
  const { page = 1, limit = 30, q = '' } = req.query;
  const { rows, total } = await db.adminListComments({ page, limit, q });
  res.json({ comments: rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
}));

app.delete('/api/admin/comments/:id', adminRequired, wrap(async (req, res) => {
  const c = await db.findComment(req.params.id);
  if (!c) return res.status(404).json({ error: '评论不存在' });
  await db.deleteComment(c.id);
  await Promise.all([
    cache.del(`posts:item:${c.post_id}`),
    cache.delByPrefix('posts:list:'),
    cache.del('stats'),
  ]);
  res.json({ ok: true });
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
  const server = app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════════╗`);
    console.log(`  ║  BlogSystem 已启动 (MySQL)              ║`);
    console.log(`  ║  访问: http://localhost:${PORT}             ║`);
    console.log(`  ║  账号: admin / admin123                  ║`);
    console.log(`  ║         lyh   / user123                  ║`);
    console.log(`  ╚══════════════════════════════════════════╝\n`);
  });
  // 大文件上传可能耗时数小时，关掉默认 5 分钟切断
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;
  server.keepAliveTimeout = 120000;

  // 定时发布：每 60s 扫一次,把到点的草稿置为已发布并失效列表缓存
  setInterval(async () => {
    try {
      const ids = await db.publishDue();
      if (ids.length) {
        console.log(`▶ 自动发布 ${ids.length} 篇定时文章: ${ids.join(',')}`);
        await Promise.all([
          cache.delByPrefix('posts:list:'),
          ...ids.map((id) => cache.del(`posts:item:${id}`)),
          cache.del('stats'),
        ]);
      }
    } catch (e) {
      console.error('publishDue error:', e.message);
    }
  }, 60_000);
})();
