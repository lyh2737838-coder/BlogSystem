// 迁移脚本：建库、建表，并把 data/blog.json 中的数据导入 MySQL
// 用法: node server/migrate.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  charset: 'utf8mb4',
  multipleStatements: true,
  // 云数据库(TiDB/Aiven 等)强制 TLS：设 DB_SSL=true 即开启
  ...(process.env.DB_SSL === 'true' ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
};
const DB_NAME = process.env.DB_NAME || 'blog_system';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(60)  NOT NULL,
  email         VARCHAR(120) NOT NULL,
  password_hash VARCHAR(120) NOT NULL,
  avatar        VARCHAR(500) NOT NULL DEFAULT '',
  bio           VARCHAR(500) NOT NULL DEFAULT '',
  role          VARCHAR(20)  NOT NULL DEFAULT 'user',
  created_at    BIGINT       NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_username (username),
  UNIQUE KEY uk_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS posts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  title      VARCHAR(200) NOT NULL,
  content    MEDIUMTEXT   NOT NULL,
  excerpt    VARCHAR(500) NOT NULL DEFAULT '',
  cover      VARCHAR(500) NOT NULL DEFAULT '',
  category   VARCHAR(60)  NOT NULL DEFAULT '随笔',
  views      INT UNSIGNED NOT NULL DEFAULT 0,
  published  TINYINT      NOT NULL DEFAULT 1,
  created_at BIGINT       NOT NULL,
  updated_at BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_posts_user (user_id),
  KEY idx_posts_created (created_at),
  KEY idx_posts_category (category),
  CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
  id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(60)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tags_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS post_tags (
  post_id INT UNSIGNED NOT NULL,
  tag_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  KEY idx_pt_tag (tag_id),
  CONSTRAINT fk_pt_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag  FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comments (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  content    TEXT         NOT NULL,
  parent_id  INT UNSIGNED NULL,
  created_at BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_comments_post (post_id),
  KEY idx_comments_user (user_id),
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS likes (
  post_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at BIGINT       NOT NULL,
  PRIMARY KEY (post_id, user_id),
  KEY idx_likes_user (user_id),
  CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookmarks (
  post_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at BIGINT       NOT NULL,
  PRIMARY KEY (post_id, user_id),
  KEY idx_bm_user (user_id),
  CONSTRAINT fk_bm_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_bm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS follows (
  follower_id  INT UNSIGNED NOT NULL,
  following_id INT UNSIGNED NOT NULL,
  created_at   BIGINT       NOT NULL,
  PRIMARY KEY (follower_id, following_id),
  KEY idx_follow_following (following_id),
  CONSTRAINT fk_fo_follower  FOREIGN KEY (follower_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_fo_following FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL,
  actor_id   INT UNSIGNED NOT NULL,
  type       VARCHAR(20)  NOT NULL,
  post_id    INT UNSIGNED NULL,
  is_read    TINYINT      NOT NULL DEFAULT 0,
  created_at BIGINT       NOT NULL,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, is_read),
  CONSTRAINT fk_no_user  FOREIGN KEY (user_id)  REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_no_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reading_history (
  user_id   INT UNSIGNED NOT NULL,
  post_id   INT UNSIGNED NOT NULL,
  viewed_at BIGINT       NOT NULL,
  PRIMARY KEY (user_id, post_id),
  KEY idx_rh_user_time (user_id, viewed_at),
  CONSTRAINT fk_rh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rh_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

// 幂等 ALTER —— 给老库加新列；migrate 可重复运行
async function applyAlters(conn) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'posts'`,
    [DB_NAME]
  );
  const names = new Set(cols.map((c) => c.COLUMN_NAME));
  if (!names.has('publish_at')) {
    console.log('▶ ALTER posts 加列 publish_at BIGINT NULL ...');
    await conn.query('ALTER TABLE posts ADD COLUMN publish_at BIGINT NULL DEFAULT NULL');
    await conn.query('ALTER TABLE posts ADD INDEX idx_posts_publish_at (publish_at)');
  }
  if (!names.has('media_type')) {
    console.log('▶ ALTER posts 加列 media_type / video_url / video_poster / audio_url / effects / bgm_url ...');
    await conn.query("ALTER TABLE posts ADD COLUMN media_type VARCHAR(16) NOT NULL DEFAULT 'article'");
    await conn.query("ALTER TABLE posts ADD COLUMN video_url VARCHAR(500) NOT NULL DEFAULT ''");
    await conn.query("ALTER TABLE posts ADD COLUMN video_poster VARCHAR(500) NOT NULL DEFAULT ''");
    await conn.query("ALTER TABLE posts ADD COLUMN audio_url VARCHAR(500) NOT NULL DEFAULT ''");
    await conn.query("ALTER TABLE posts ADD COLUMN effects VARCHAR(120) NOT NULL DEFAULT ''");
    await conn.query("ALTER TABLE posts ADD COLUMN bgm_url VARCHAR(500) NOT NULL DEFAULT ''");
  }
}

const SEED_POSTS = [
  {
    user: 'admin',
    title: '欢迎来到 BlogSystem ✨',
    content: `# 欢迎来到 BlogSystem\n\n这是一个**功能完整、视觉精彩**的博客平台。\n\n## 你可以做什么\n\n- 撰写 Markdown 文章并实时预览\n- 评论、点赞、关注感兴趣的作者\n- 切换暗黑 / 明亮主题\n- 标签与分类检索\n\n## 代码高亮示例\n\n\`\`\`javascript\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('世界'));\n\`\`\`\n\n## 引用\n\n> "代码是写给人读的，只是顺便能在机器上运行。"\n> —— Harold Abelson\n\n享受写作的乐趣吧！`,
    excerpt: '一个功能完整、视觉精彩的博客平台介绍。你可以写作、评论、点赞、切换主题⋯',
    cover: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200',
    category: '公告', tags: ['JavaScript', '设计'], offsetDays: 0,
  },
  {
    user: 'admin',
    title: '现代 CSS 中那些让人惊艳的特性',
    content: `# 现代 CSS 中那些让人惊艳的特性\n\n过去几年 CSS 飞速进化，下面这些特性值得每个前端都掌握。\n\n## 1. \`backdrop-filter\` 毛玻璃\n\n\`\`\`css\n.card {\n  background: rgba(255, 255, 255, 0.1);\n  backdrop-filter: blur(20px);\n  border: 1px solid rgba(255, 255, 255, 0.2);\n}\n\`\`\`\n\n## 2. CSS 变量与主题切换\n\n通过 \`:root\` 上的自定义属性，可以轻松实现主题切换。\n\n## 3. \`color-mix()\` 与新色彩函数\n\n现在我们可以直接在 CSS 中混合两种颜色，告别预处理器。\n\n## 4. \`:has()\` 父选择器\n\n这是改变游戏规则的一个特性。\n\n## 总结\n\n保持学习，保持热爱 ❤️`,
    excerpt: '现代 CSS 进化飞速，毛玻璃、color-mix、:has() 这些特性正在改变前端开发的方式。',
    cover: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200',
    category: '前端', tags: ['CSS', '设计'], offsetDays: 1,
  },
  {
    user: 'lyh',
    title: '夜深人静时写代码的乐趣',
    content: `# 夜深人静时写代码的乐趣\n\n凌晨两点，城市睡了，只有键盘的声响陪着我。\n\n有时候 bug 像迷雾一样散不开，有时候灵感却又突如其来。\n\n## 我的夜间编码习惯\n\n- 一杯温水\n- 暗色主题 + 暖色 LED\n- 一首循环的 lofi\n- 不打扰任何人，也不被打扰\n\n这或许就是程序员的浪漫。`,
    excerpt: '凌晨两点，城市睡了，只有键盘的声响陪着我⋯',
    cover: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200',
    category: '随笔', tags: ['生活', '随笔'], offsetDays: 2,
  },
  {
    user: 'admin',
    title: 'Node.js 性能优化的几个真实场景',
    content: `# Node.js 性能优化的几个真实场景\n\n## 1. 用 Worker Threads 处理 CPU 密集任务\n\n## 2. Stream 比 Buffer 更省内存\n\n## 3. 数据库连接池的合理配置\n\n## 4. 用 Cluster 充分利用多核\n\n性能优化不能盲目，**先测量，再优化**。`,
    excerpt: 'Worker Threads、Stream、连接池、Cluster — Node.js 性能优化的几个真实场景。',
    cover: 'https://images.unsplash.com/photo-1555099962-4199c345e5dd?w=1200',
    category: '后端', tags: ['Node.js', 'JavaScript'], offsetDays: 3,
  },
  {
    user: 'lyh',
    title: '一个独立开发者的一天',
    content: `# 一个独立开发者的一天\n\n早晨 9 点，咖啡。\n上午写代码，下午回邮件。\n晚上读文档，凌晨灵感来。\n\n自由的代价，是要自己定义自由。`,
    excerpt: '自由的代价，是要自己定义自由。',
    cover: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=1200',
    category: '生活', tags: ['生活', '随笔'], offsetDays: 4,
  },
  {
    user: 'admin',
    title: 'Vue 与 React，到底该选哪个？',
    content: `# Vue 与 React，到底该选哪个？\n\n这是一个老问题，也是一个永远没有标准答案的问题。\n\n## Vue 的优势\n\n- 渐进式，上手平滑\n- 模板更接近 HTML\n- 单文件组件结构清晰\n\n## React 的优势\n\n- 生态更大，岗位更多\n- JSX 表达力强\n- 与 TypeScript 配合天然\n\n## 我的看法\n\n**选你团队会用的那个**。技术决策永远要服务于人。`,
    excerpt: 'Vue 与 React 的选择是个老问题，但答案永远只有一个 — 选你团队会用的那个。',
    cover: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=1200',
    category: '前端', tags: ['Vue', 'React', 'JavaScript'], offsetDays: 5,
  },
];

async function run() {
  console.log('▶ 连接 MySQL...');
  const root = await mysql.createConnection(cfg);
  console.log(`▶ 创建数据库 \`${DB_NAME}\`（如果不存在）...`);
  try {
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (e) {
    // 云数据库通常已预建库且账号无 CREATE DATABASE 权限 —— 跳过，直接用现有库
    console.warn(`⚠ 跳过建库（${e.code || e.message}），假定数据库已存在。`);
  }
  await root.end();

  const conn = await mysql.createConnection({ ...cfg, database: DB_NAME });
  console.log('▶ 创建表结构...');
  await conn.query(SCHEMA);
  await applyAlters(conn);

  // 检查是否已有数据，避免重复导入
  const [[{ c: userCount }]] = await conn.query('SELECT COUNT(*) AS c FROM users');
  if (userCount > 0) {
    console.log(`▶ 数据库已有 ${userCount} 个用户，跳过数据导入。`);
    await conn.end();
    console.log('✅ 迁移完成。');
    return;
  }

  const jsonPath = path.join(__dirname, '..', 'data', 'blog.json');
  let imported = false;
  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (data.users?.length) {
        console.log(`▶ 从 blog.json 导入 ${data.users.length} 个用户 / ${data.posts?.length || 0} 篇文章...`);
        await importFromJson(conn, data);
        imported = true;
      }
    } catch (e) {
      console.warn('⚠ 读取 blog.json 失败，将改用默认演示数据。', e.message);
    }
  }

  if (!imported) {
    console.log('▶ 未发现可导入的 JSON 数据，写入默认演示数据...');
    await seedDefault(conn);
  }

  await conn.end();
  console.log('\n✅ 迁移完成。');
  console.log('   现在可以运行: npm start');
}

async function importFromJson(conn, data) {
  // users —— 保留原 id
  for (const u of data.users) {
    await conn.query(
      `INSERT INTO users (id, username, email, password_hash, avatar, bio, role, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [u.id, u.username, u.email, u.password_hash, u.avatar || '', u.bio || '', u.role || 'user', u.created_at]
    );
  }
  // posts
  for (const p of data.posts || []) {
    await conn.query(
      `INSERT INTO posts (id, user_id, title, content, excerpt, cover, category, views, published, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [p.id, p.user_id, p.title, p.content, p.excerpt || '', p.cover || '', p.category || '随笔',
       p.views || 0, p.published ?? 1, p.created_at, p.updated_at || p.created_at]
    );
  }
  // tags
  for (const t of data.tags || []) {
    await conn.query('INSERT INTO tags (id, name) VALUES (?, ?)', [t.id, t.name]);
  }
  for (const pt of data.post_tags || []) {
    await conn.query('INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', [pt.post_id, pt.tag_id]);
  }
  // comments
  for (const c of data.comments || []) {
    await conn.query(
      `INSERT INTO comments (id, post_id, user_id, content, parent_id, created_at) VALUES (?,?,?,?,?,?)`,
      [c.id, c.post_id, c.user_id, c.content, c.parent_id || null, c.created_at]
    );
  }
  // likes
  for (const l of data.likes || []) {
    await conn.query(
      `INSERT IGNORE INTO likes (post_id, user_id, created_at) VALUES (?,?,?)`,
      [l.post_id, l.user_id, l.created_at]
    );
  }
  // 重置自增起点
  for (const t of ['users', 'posts', 'tags', 'comments']) {
    const [[row]] = await conn.query(`SELECT COALESCE(MAX(id), 0) + 1 AS n FROM ${t}`);
    await conn.query(`ALTER TABLE ${t} AUTO_INCREMENT = ${row.n}`);
  }
}

async function seedDefault(conn) {
  const now = Date.now();
  const adminHash = bcrypt.hashSync('admin123', 10);
  const userHash = bcrypt.hashSync('user123', 10);

  const [{ insertId: adminId }] = await conn.query(
    `INSERT INTO users (username, email, password_hash, avatar, bio, role, created_at)
     VALUES (?, ?, ?, ?, ?, 'admin', ?)`,
    ['admin', 'admin@blog.dev', adminHash,
     'https://api.dicebear.com/7.x/lorelei/svg?seed=admin', '博客管理员，热爱分享技术与生活', now]
  );
  const [{ insertId: lyhId }] = await conn.query(
    `INSERT INTO users (username, email, password_hash, avatar, bio, role, created_at)
     VALUES (?, ?, ?, ?, ?, 'user', ?)`,
    ['lyh', 'lyh@blog.dev', userHash,
     'https://api.dicebear.com/7.x/lorelei/svg?seed=lyh', '一个普通的读者与作者', now]
  );
  const userMap = { admin: adminId, lyh: lyhId };

  const tagIds = {};
  for (const name of ['JavaScript', 'Node.js', 'CSS', '设计', '生活', '随笔', 'Vue', 'React']) {
    const [{ insertId }] = await conn.query('INSERT INTO tags (name) VALUES (?)', [name]);
    tagIds[name] = insertId;
  }

  for (const s of SEED_POSTS) {
    const created = now - s.offsetDays * 86400000;
    const [{ insertId: pid }] = await conn.query(
      `INSERT INTO posts (user_id, title, content, excerpt, cover, category, views, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [userMap[s.user], s.title, s.content, s.excerpt, s.cover, s.category,
       Math.floor(Math.random() * 280) + 20, created, created]
    );
    for (const tn of s.tags) {
      await conn.query('INSERT IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)', [pid, tagIds[tn]]);
    }
  }
}

run().catch((e) => {
  console.error('\n❌ 迁移失败：', e.code || '', e.message);
  console.error('请确认 .env 里的 MySQL 连接信息正确，且当前账号有 CREATE 权限。');
  process.exit(1);
});
