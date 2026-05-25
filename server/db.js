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
      `INSERT INTO posts (user_id, title, content, excerpt, cover, category, views, published, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        data.user_id, data.title, data.content,
        data.excerpt || '', data.cover || '', data.category || '随笔',
        data.views || 0, data.published ?? 1,
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
};

module.exports = db;
