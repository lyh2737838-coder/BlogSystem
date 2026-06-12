// 种子数据：虚拟用户 + 示例私信
// 用法: node seed-rich.js
// 密码统一 blog123456
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const cfg = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'blog_system',
  charset: 'utf8mb4',
  ...(process.env.DB_SSL === 'true' ? { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } } : {}),
};

const VIRTUAL_USERS = [
  { username: '苏晚', email: 'suwan@blog.dev', bio: '热爱生活，喜欢写诗 🌸' },
  { username: '阿杰Dev', email: 'ajie@blog.dev', bio: '全栈开发者，开源爱好者 💻' },
  { username: '小林', email: 'xiaolin@blog.dev', bio: '前端萌新学习中 🚀' },
  { username: '星辰', email: 'xingchen@blog.dev', bio: '摄影 / 旅行 / 代码' },
];

async function run() {
  const conn = await mysql.createConnection(cfg);
  const hash = bcrypt.hashSync('blog123456', 10);

  for (const v of VIRTUAL_USERS) {
    const existing = await conn.query('SELECT id FROM users WHERE username = ?', [v.username]);
    if (existing[0].length) {
      console.log(`▶ 用户 ${v.username} 已存在 (id=${existing[0][0].id})`);
      continue;
    }
    const r = await conn.query(
      `INSERT INTO users (username, email, password_hash, avatar, bio, role, created_at)
       VALUES (?,?,?,?,?,'user',?)`,
      [
        v.username, v.email, hash,
        `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(v.username)}`,
        v.bio, Date.now() - Math.floor(Math.random() * 86400000 * 30),
      ]
    );
    console.log(`✅ 创建用户 ${v.username} (id=${r[0].insertId})`);
  }

  // 在苏晚和阿杰Dev之间加几条示例私信
  const [suwan] = await conn.query('SELECT id FROM users WHERE username = ?', ['苏晚']);
  const [ajie] = await conn.query('SELECT id FROM users WHERE username = ?', ['阿杰Dev']);
  if (suwan.length && ajie.length) {
    const swId = suwan[0].id;
    const ajId = ajie[0].id;
    const now = Date.now();
    const [existing] = await conn.query(
      'SELECT COUNT(*) AS c FROM messages WHERE (sender_id=? AND recipient_id=?)',
      [swId, ajId]
    );
    if (!existing[0].c) {
      const msgs = [
        { from: swId, to: ajId, content: '你好呀！看到你的文章很棒 👋', offset: 500000 },
        { from: ajId, to: swId, content: '谢谢！你的博客也很有意思 😊', offset: 480000 },
        { from: swId, to: ajId, content: '想问一下你用的什么主题？很好看', offset: 450000 },
        { from: ajId, to: swId, content: '用的是自定义的 CSS，改了几次配色 😅', offset: 420000 },
        { from: swId, to: ajId, content: '什么时候有空一起交流一下前端？', offset: 360000 },
        { from: ajId, to: swId, content: '好呀！周末可以聊聊 🎉', offset: 350000 },
      ];
      for (const m of msgs) {
        await conn.query(
          'INSERT INTO messages (sender_id, recipient_id, content, is_read, created_at) VALUES (?,?,?,?,?)',
          [m.from, m.to, m.content, 1, now - m.offset]
        );
      }
      console.log(`✅ 插入了 ${msgs.length} 条苏晚↔阿杰Dev 示例私信`);
    }
  }

  await conn.end();
  console.log('\n✅ 种子数据写入完成');
  console.log('   虚拟用户登录: 任意用户名 / blog123456');
}

run().catch((e) => {
  console.error('❌ 写入失败:', e.message);
  process.exit(1);
});
