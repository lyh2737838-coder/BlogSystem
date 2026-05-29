# BlogSystem ✦

一个功能完整、视觉精彩的全栈博客平台。后端 Node.js + Express + **MySQL**（可选 Redis 缓存），前端原生 JS + 现代 CSS。

> 已完成四批次功能扩展：**收藏 / 草稿+定时+多媒体上传 / 关注+通知 / 管理后台**，前后端 API 端到端联通。

## 第一次从 GitHub 克隆下来

```bash
git clone https://github.com/lyh2737838-coder/BlogSystem.git
cd BlogSystem
npm install
cp .env.example .env       # 然后编辑 .env，填入你的 MySQL 密码
npm run migrate            # 建库、建表、写入演示数据
npm start
```

打开 http://localhost:3000，用 `admin/admin123` 或 `lyh/user123` 登录。

## 本机已有项目，直接启动

数据库已经迁移好，直接：

1. 双击 `启动.bat`（或运行 `npm start`）
2. 浏览器自动打开 http://localhost:3000
3. 结束时双击 `停止.bat` 关闭进程

默认账号：
- 管理员：`admin` / `admin123`
- 普通用户：`lyh` / `user123`

## 数据库配置

连接信息保存在项目根目录的 `.env` 文件：

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=blog_system

# 可选：Redis 缓存（不配置则自动降级为内存缓存）
REDIS_URL=redis://127.0.0.1:6379
```

如果你换了 MySQL 密码或想换库名，改这里就行。Redis 不是必需的，没装也能跑。

## 数据迁移

如果数据库被清掉了、或者想换一个新库重来：

```
npm run migrate
```
（或双击 `迁移数据库.bat`）

迁移脚本会：
- 自动 `CREATE DATABASE` 如果不存在
- 创建全部 9 张表
- 优先从 `data/blog.json` 导入历史数据；没有就写入默认演示数据
- 已有数据则跳过，不会重复导入

## 数据库结构

```
users          用户表（用户名 + 邮箱唯一，role 区分 admin / user）
posts          文章表（FK → users，含 status: published/draft，scheduled_at）
tags           标签字典
post_tags      文章-标签 多对多
comments       评论（FK → posts, users）
likes          点赞（复合主键 post_id + user_id）
bookmarks      收藏（复合主键 post_id + user_id）
follows        关注关系（follower_id + followed_id）
notifications  消息通知（点赞 / 评论 / 关注 / 系统）
```

字符集 utf8mb4，引擎 InnoDB，所有外键 `ON DELETE CASCADE`。

## 功能

### 后端 API
- 注册 / 登录（JWT 30 天），个人资料修改
- 文章 CRUD（Markdown），分类 + 多标签，浏览量
- 评论、点赞、**收藏**
- 全文搜索 + 标签/分类筛选 + 最新/最热排序
- **草稿系统**：保存草稿、定时发布（`scheduled_at`）
- **多媒体上传**：图片 / 视频 / 音频（multer，大小限制 API 可查）
- **关注系统**：关注/取关、粉丝列表、关注列表
- **通知中心**：未读数、批量已读
- **管理后台**：用户管理（封禁/改角色）、文章审核、评论审核、概览统计
- 缓存层：Redis 优先，未配置则降级为内存 LRU

### 前端
- 单页应用，hash 路由，1400 行原生 JS
- 暗黑 / 明亮主题切换（持久化）
- 极光渐变 + 毛玻璃 + 页面特效（`effects.js`）
- Markdown 实时预览写作页 + 代码高亮
- 自研视频播放器（`video-player.js`）
- 响应式

## 目录

```
BlogSystem/
├── .env                      # 数据库 / JWT / Redis 配置
├── data/blog.json            # JSON 版本存档（迁移源）
├── public/
│   ├── index.html
│   ├── css/style.css         # 1700+ 行样式
│   └── js/
│       ├── api.js            # 接口封装
│       ├── app.js            # SPA 主逻辑
│       ├── effects.js        # 页面特效
│       └── video-player.js   # 自研视频播放器
├── server/
│   ├── index.js              # Express + 全部 40+ 路由
│   ├── db.js                 # MySQL 数据访问层
│   ├── cache.js              # Redis / 内存缓存
│   ├── migrate.js            # 建库建表 + 导入数据
│   └── wait-and-open.js      # 启动后自动开浏览器
├── 启动.bat / 停止.bat
├── 迁移数据库.bat
└── package.json
```

## 常见问题

**MySQL 连接失败**：服务启动会先 ping 数据库，连不上会打印错误并退出。检查 MySQL 服务有没有跑（`服务` → MySQL80）、`.env` 里的密码对不对。

**端口 3000 被占**：直接双击 `停止.bat`，或 `netstat -ano | findstr :3000` 找到 PID，`taskkill /F /PID <pid>` 杀掉。

**Redis 没装**：不影响运行，缓存会自动降级到进程内存，启动日志会提示。

**上传文件大小**：默认图片 5MB、音频 50MB、视频无上限（可设 `BLOG_VIDEO_MAX_MB` 加限制）。访问 `GET /api/upload/limits` 可查当前值。
