// Redis 缓存层 —— Redis 不可用时自动降级为直通(no-op),不影响主流程
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Redis = require('ioredis');

const PREFIX = 'blog:';
const DEFAULT_TTL = 300; // 秒

let ready = false;
const client = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  db: Number(process.env.REDIS_DB || 0),
  lazyConnect: false,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (times) => Math.min(times * 1000, 10000),
});

client.on('ready', () => { ready = true; console.log('✅ Redis 已连接'); });
client.on('end', () => { ready = false; });
client.on('error', (e) => {
  if (ready) console.warn('Redis 出错,缓存暂时降级:', e.code || e.message);
  ready = false;
});

const key = (k) => PREFIX + k;

async function get(k) {
  if (!ready) return null;
  try {
    const v = await client.get(key(k));
    return v ? JSON.parse(v) : null;
  } catch (_) { return null; }
}

async function set(k, value, ttl = DEFAULT_TTL) {
  if (!ready) return;
  try { await client.set(key(k), JSON.stringify(value), 'EX', ttl); } catch (_) {}
}

async function del(...keys) {
  if (!ready || !keys.length) return;
  try { await client.del(...keys.map(key)); } catch (_) {}
}

// 按前缀批量删除(SCAN,不阻塞)
async function delByPrefix(prefix) {
  if (!ready) return;
  const match = key(prefix) + '*';
  try {
    let cursor = '0';
    do {
      const [next, found] = await client.scan(cursor, 'MATCH', match, 'COUNT', 200);
      cursor = next;
      if (found.length) await client.del(...found);
    } while (cursor !== '0');
  } catch (_) {}
}

// 包装 GET 接口:命中返回,未命中执行 loader 后回填
async function wrap(k, ttl, loader) {
  const hit = await get(k);
  if (hit !== null) return hit;
  const fresh = await loader();
  if (fresh !== undefined) await set(k, fresh, ttl);
  return fresh;
}

module.exports = { client, get, set, del, delByPrefix, wrap };
