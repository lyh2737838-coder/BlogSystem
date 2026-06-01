// MySQL 数据访问层 —— 与原 JSON 版接口语义一致，但全部为 async
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'blog_system',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: false,
  timezone: 'local',
  // 云数据库(TiDB/Aiven 等)强制 TLS：设 DB_SSL=true 即开启
  ...(process.env.DB_SSL === 'true' ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
});

const q = (sql, params) => pool.query(sql, params).then(([rows]) => rows);
const one = async (sql, params) => (await q(sql, params))[0] || null;

const db = {
  pool,

  // ---------- users ----------
  async createUser({ username, email, password_hash, avatar = '', bio = '', role = 'user' }) {
    const created_at = Date.now();
    const r = await q(
      'INSERT INTO users (username, email, password_hash, avatar, bio, role, created_at) VALUES (?,?,?,?,?,?,?)',
      [username, email, password_hash, avatar, bio, role, created_at]
    );
    return { id: r.insertId, username, email, password_hash, avatar, bio, role, created_at };
  },
  findUserById: (id) => one('SELECT * FROM users WHERE id = ?', [Number(id)]),
  findUserByLogin: (login) => one('SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1', [login, login]),
  async updateUser(id, patch) {
    const cols = [], vals = [];
    for (const [k, v] of Object.entries(patch)) { cols.push(`${k} = ?`); vals.push(v); }
    if (!cols.length) return db.findUserById(id);
    vals.push(Number(id));
    await q(`UPDATE users SET ${cols.join(', ')} WHERE id = ?`, vals);
    return db.findUserById(id);
  },

  // ---------- posts ----------
  async createPost(data) {
    const now = Date.now();
    const r = await q(
      `INSERT INTO posts (user_id, title, content, excerpt, cover, category, views, published, publish_at, media_type, video_url, video_poster, audio_url, effects, bgm_url, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.user_id, data.title, data.content,
        data.excerpt || '', data.cover || '', data.category || '随笔',
        data.views || 0, data.published ?? 1,
        data.publish_at ?? null,
        data.media_type || 'article', data.video_url || '', data.video_poster || '',
        data.audio_url || '', data.effects || '', data.bgm_url || '',
        data.created_at || now, data.updated_at || now,
      ]
    );
    return db.findPost(r.insertId);
  },
  findPost: (id) => one('SELECT * FROM posts WHERE id = ?', [Number(id)]),
  async updatePost(id, patch) {
    const cols = [], vals = [];
    for (const [k, v] of Object.entries(patch)) { cols.push(`${k} = ?`); vals.push(v); }
    if (!cols.length) return db.findPost(id);
    cols.push('updated_at = ?');
    vals.push(Date.now(), Number(id));
    await q(`UPDATE posts SET ${cols.join(', ')} WHERE id = ?`, vals);
    return db.findPost(id);
  },
  async deletePost(id) {
    const r = await q('DELETE FROM posts WHERE id = ?', [Number(id)]);
    return r.affectedRows > 0;
  },
  async incrementViews(id) {
    await q('UPDATE posts SET views = views + 1 WHERE id = ?', [Number(id)]);
  },
  // 草稿：本人 published=0 的文章
  async draftsForUser(userId) {
    return q(
      `SELECT * FROM posts WHERE user_id = ? AND published = 0
       ORDER BY updated_at DESC, created_at DESC`,
      [Number(userId)]
    );
  },
  // 定时发布：把到点的草稿置为已发布。返回受影响的 post id 数组（用于失效缓存）。
  async publishDue() {
    const due = await q(
      `SELECT id FROM posts WHERE published = 0 AND publish_at IS NOT NULL AND publish_at <= ?`,
      [Date.now()]
    );
    if (!due.length) return [];
    const ids = due.map((r) => r.id);
    const now = Date.now();
    await q(
      `UPDATE posts SET published = 1, publish_at = NULL, updated_at = ?
       WHERE id IN (${ids.map(() => '?').join(',')})`,
      [now, ...ids]
    );
    return ids;
  },
  async searchPosts({ q: kw, tag, category, author, sort = 'new', page = 1, limit = 12 }) {
    const where = ['p.published = 1'];
    const params = [];
    let join = '';
    if (kw) {
      where.push('(p.title LIKE ? OR p.content LIKE ?)');
      params.push(`%${kw}%`, `%${kw}%`);
    }
    if (category) { where.push('p.category = ?'); params.push(category); }
    if (author) { where.push('p.user_id = ?'); params.push(Number(author)); }
    if (tag) {
      join = 'JOIN post_tags pt ON pt.post_id = p.id JOIN tags t ON t.id = pt.tag_id';
      where.push('t.name = ?');
      params.push(tag);
    }
    const orderBy = sort === 'hot' ? 'p.views DESC, p.created_at DESC' : 'p.created_at DESC';
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await q(
      `SELECT p.* FROM posts p ${join} WHERE ${where.join(' AND ')} GROUP BY p.id ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [{ c: total } = { c: 0 }] = await q(
      `SELECT COUNT(DISTINCT p.id) AS c FROM posts p ${join} WHERE ${where.join(' AND ')}`,
      params
    );
    return { rows, total };
  },

  // ---------- tags ----------
  async ensureTag(name) {
    name = String(name).trim();
    if (!name) return null;
    let row = await one('SELECT * FROM tags WHERE name = ?', [name]);
    if (row) return row;
    const r = await q('INSERT INTO tags (name) VALUES (?)', [name]);
    return { id: r.insertId, name };
  },
  async setPostTags(postId, tagNames) {
    await q('DELETE FROM post_tags WHERE post_id = ?', [Number(postId)]);
    for (const name of tagNames || []) {
      const t = await db.ensureTag(name);
      if (t) await q('INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', [Number(postId), t.id]);
    }
  },
  async tagsForPost(postId) {
    const rows = await q(
      'SELECT t.name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.name',
      [Number(postId)]
    );
    return rows.map((r) => r.name);
  },
  allTagsWithCount: () => q(
    `SELECT t.name, COUNT(pt.post_id) AS count FROM tags t
     LEFT JOIN post_tags pt ON pt.tag_id = t.id
     GROUP BY t.id ORDER BY count DESC, t.name`
  ),

  // ---------- categories ----------
  allCategoriesWithCount: () => q(
    `SELECT category AS name, COUNT(*) AS count FROM posts
     WHERE published = 1 GROUP BY category ORDER BY count DESC`
  ),

  // ---------- comments ----------
  async createComment({ post_id, user_id, content, parent_id }) {
    const created_at = Date.now();
    const r = await q(
      'INSERT INTO comments (post_id, user_id, content, parent_id, created_at) VALUES (?,?,?,?,?)',
      [Number(post_id), user_id, content, parent_id || null, created_at]
    );
    return { id: r.insertId, post_id: Number(post_id), user_id, content, parent_id: parent_id || null, created_at };
  },
  commentsFor: (postId) => q(
    `SELECT c.*, u.username, u.avatar FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.post_id = ? ORDER BY c.created_at DESC`,
    [Number(postId)]
  ),
  findComment: (id) => one('SELECT * FROM comments WHERE id = ?', [Number(id)]),
  async deleteComment(id) {
    const r = await q('DELETE FROM comments WHERE id = ?', [Number(id)]);
    return r.affectedRows > 0;
  },
  countComments: async (postId) =>
    (await one('SELECT COUNT(*) AS c FROM comments WHERE post_id = ?', [Number(postId)])).c,

  // ---------- likes ----------
  async toggleLike(postId, userId) {
    const exists = await one('SELECT 1 AS x FROM likes WHERE post_id = ? AND user_id = ?', [Number(postId), userId]);
    if (exists) {
      await q('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [Number(postId), userId]);
      return false;
    }
    await q('INSERT INTO likes (post_id, user_id, created_at) VALUES (?,?,?)', [Number(postId), userId, Date.now()]);
    return true;
  },
  countLikes: async (postId) =>
    (await one('SELECT COUNT(*) AS c FROM likes WHERE post_id = ?', [Number(postId)])).c,
  hasLiked: async (postId, userId) =>
    !!(await one('SELECT 1 AS x FROM likes WHERE post_id = ? AND user_id = ?', [Number(postId), userId])),

  // ---------- bookmarks ----------
  async toggleBookmark(postId, userId) {
    const exists = await one('SELECT 1 AS x FROM bookmarks WHERE post_id = ? AND user_id = ?', [Number(postId), userId]);
    if (exists) {
      await q('DELETE FROM bookmarks WHERE post_id = ? AND user_id = ?', [Number(postId), userId]);
      return false;
    }
    await q('INSERT INTO bookmarks (post_id, user_id, created_at) VALUES (?,?,?)', [Number(postId), userId, Date.now()]);
    return true;
  },
  countBookmarks: async (postId) =>
    (await one('SELECT COUNT(*) AS c FROM bookmarks WHERE post_id = ?', [Number(postId)])).c,
  hasBookmarked: async (postId, userId) =>
    !!(await one('SELECT 1 AS x FROM bookmarks WHERE post_id = ? AND user_id = ?', [Number(postId), userId])),
  async bookmarksForUser(userId, page = 1, limit = 24) {
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await q(
      `SELECT p.* FROM bookmarks b JOIN posts p ON p.id = b.post_id
       WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT ? OFFSET ?`,
      [Number(userId), Number(limit), offset]
    );
    const [{ c: total } = { c: 0 }] = await q(
      'SELECT COUNT(*) AS c FROM bookmarks WHERE user_id = ?', [Number(userId)]
    );
    return { rows, total };
  },

  // ---------- stats ----------
  async stats() {
    const [{ c: posts }] = await q('SELECT COUNT(*) AS c FROM posts WHERE published = 1');
    const [{ c: users }] = await q('SELECT COUNT(*) AS c FROM users');
    const [{ c: comments }] = await q('SELECT COUNT(*) AS c FROM comments');
    const [{ c: views }] = await q('SELECT COALESCE(SUM(views), 0) AS c FROM posts');
    return { posts, users, comments, views };
  },

  countUserPosts: async (userId) =>
    (await one('SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND published = 1', [Number(userId)])).c,

  // ---------- follows ----------
  async toggleFollow(followerId, followingId) {
    if (Number(followerId) === Number(followingId)) return false;
    const exists = await one(
      'SELECT 1 AS x FROM follows WHERE follower_id = ? AND following_id = ?',
      [followerId, Number(followingId)]
    );
    if (exists) {
      await q('DELETE FROM follows WHERE follower_id = ? AND following_id = ?',
        [followerId, Number(followingId)]);
      return false;
    }
    await q('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?,?,?)',
      [followerId, Number(followingId), Date.now()]);
    return true;
  },
  isFollowing: async (followerId, followingId) =>
    !!(await one(
      'SELECT 1 AS x FROM follows WHERE follower_id = ? AND following_id = ?',
      [followerId, Number(followingId)]
    )),
  countFollowers: async (userId) =>
    (await one('SELECT COUNT(*) AS c FROM follows WHERE following_id = ?', [Number(userId)])).c,
  countFollowing: async (userId) =>
    (await one('SELECT COUNT(*) AS c FROM follows WHERE follower_id = ?', [Number(userId)])).c,
  followersOf: (userId) => q(
    `SELECT u.id, u.username, u.avatar, u.bio, f.created_at AS followed_at
     FROM follows f JOIN users u ON u.id = f.follower_id
     WHERE f.following_id = ? ORDER BY f.created_at DESC`,
    [Number(userId)]
  ),
  followingOf: (userId) => q(
    `SELECT u.id, u.username, u.avatar, u.bio, f.created_at AS followed_at
     FROM follows f JOIN users u ON u.id = f.following_id
     WHERE f.follower_id = ? ORDER BY f.created_at DESC`,
    [Number(userId)]
  ),

  // ---------- notifications ----------
  async createNotification({ user_id, actor_id, type, post_id = null }) {
    if (Number(user_id) === Number(actor_id)) return null; // 自己操作自己不通知
    const r = await q(
      'INSERT INTO notifications (user_id, actor_id, type, post_id, is_read, created_at) VALUES (?,?,?,?,0,?)',
      [Number(user_id), Number(actor_id), type, post_id ? Number(post_id) : null, Date.now()]
    );
    return r.insertId;
  },
  listNotifications: (userId, limit = 50) => q(
    `SELECT n.*, u.username AS actor_name, u.avatar AS actor_avatar,
            p.title AS post_title
     FROM notifications n
     JOIN users u ON u.id = n.actor_id
     LEFT JOIN posts p ON p.id = n.post_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT ?`,
    [Number(userId), Number(limit)]
  ),
  unreadNotifCount: async (userId) =>
    (await one('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0',
      [Number(userId)])).c,
  async markAllNotifRead(userId) {
    await q('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [Number(userId)]);
  },

  // ---------- reading history (批次 5) ----------
  // 记录浏览：同一用户对同一文章只留一条，重复浏览刷新 viewed_at
  async recordView(userId, postId) {
    await q(
      `INSERT INTO reading_history (user_id, post_id, viewed_at) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE viewed_at = VALUES(viewed_at)`,
      [Number(userId), Number(postId), Date.now()]
    );
  },
  // 浏览历史列表：只取仍已发布的文章，按最近浏览倒序
  async historyForUser(userId, page = 1, limit = 24) {
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await q(
      `SELECT p.*, h.viewed_at FROM reading_history h
       JOIN posts p ON p.id = h.post_id
       WHERE h.user_id = ? AND p.published = 1
       ORDER BY h.viewed_at DESC LIMIT ? OFFSET ?`,
      [Number(userId), Number(limit), offset]
    );
    const [{ c: total } = { c: 0 }] = await q(
      `SELECT COUNT(*) AS c FROM reading_history h JOIN posts p ON p.id = h.post_id
       WHERE h.user_id = ? AND p.published = 1`,
      [Number(userId)]
    );
    return { rows, total };
  },
  async clearHistory(userId) {
    const r = await q('DELETE FROM reading_history WHERE user_id = ?', [Number(userId)]);
    return r.affectedRows;
  },
  async deleteHistoryItem(userId, postId) {
    const r = await q('DELETE FROM reading_history WHERE user_id = ? AND post_id = ?',
      [Number(userId), Number(postId)]);
    return r.affectedRows > 0;
  },

  // ---------- admin ----------
  // 仪表盘：基础 stats + 近 7 日新文章/新评论/新用户趋势 + 最活跃作者
  async adminOverview() {
    const base = await db.stats();
    const days = 7;
    const buckets = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;
      const [cPosts, cComments, cUsers] = await Promise.all([
        one('SELECT COUNT(*) AS c FROM posts WHERE created_at >= ? AND created_at < ?', [start, end]),
        one('SELECT COUNT(*) AS c FROM comments WHERE created_at >= ? AND created_at < ?', [start, end]),
        one('SELECT COUNT(*) AS c FROM users WHERE created_at >= ? AND created_at < ?', [start, end]),
      ]);
      buckets.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        posts: cPosts?.c || 0,
        comments: cComments?.c || 0,
        users: cUsers?.c || 0,
      });
    }
    const topAuthors = await q(
      `SELECT u.id, u.username, u.avatar, COUNT(p.id) AS posts
       FROM users u LEFT JOIN posts p ON p.user_id = u.id AND p.published = 1
       GROUP BY u.id ORDER BY posts DESC, u.id ASC LIMIT 5`
    );
    return { ...base, trend: buckets, topAuthors };
  },

  async adminListUsers({ page = 1, limit = 20, q: kw = '' } = {}) {
    const where = [], params = [];
    if (kw) { where.push('(username LIKE ? OR email LIKE ?)'); params.push(`%${kw}%`, `%${kw}%`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await q(
      `SELECT id, username, email, avatar, bio, role, created_at FROM users
       ${w} ORDER BY id ASC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [{ c: total } = { c: 0 }] = await q(
      `SELECT COUNT(*) AS c FROM users ${w}`, params
    );
    return { rows, total };
  },

  async adminDeleteUser(id) {
    const r = await q('DELETE FROM users WHERE id = ?', [Number(id)]);
    return r.affectedRows > 0;
  },

  async adminSetUserRole(id, role) {
    if (role !== 'user' && role !== 'admin') throw new Error('非法角色');
    await q('UPDATE users SET role = ? WHERE id = ?', [role, Number(id)]);
    return db.findUserById(id);
  },

  async adminListPosts({ page = 1, limit = 20, q: kw = '', status } = {}) {
    const where = [], params = [];
    if (kw) { where.push('(p.title LIKE ? OR p.content LIKE ?)'); params.push(`%${kw}%`, `%${kw}%`); }
    if (status === 'published') where.push('p.published = 1');
    else if (status === 'draft') where.push('p.published = 0 AND p.publish_at IS NULL');
    else if (status === 'scheduled') where.push('p.published = 0 AND p.publish_at IS NOT NULL');
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await q(
      `SELECT p.id, p.user_id, p.title, p.category, p.views, p.published, p.publish_at,
              p.created_at, u.username AS author
       FROM posts p JOIN users u ON u.id = p.user_id
       ${w} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [{ c: total } = { c: 0 }] = await q(
      `SELECT COUNT(*) AS c FROM posts p ${w}`, params
    );
    return { rows, total };
  },

  async adminListComments({ page = 1, limit = 30, q: kw = '' } = {}) {
    const where = [], params = [];
    if (kw) { where.push('c.content LIKE ?'); params.push(`%${kw}%`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);
    const rows = await q(
      `SELECT c.id, c.post_id, c.user_id, c.content, c.created_at,
              u.username, u.avatar, p.title AS post_title
       FROM comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN posts p ON p.id = c.post_id
       ${w} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    const [{ c: total } = { c: 0 }] = await q(
      `SELECT COUNT(*) AS c FROM comments c ${w}`, params
    );
    return { rows, total };
  },
};

module.exports = db;
