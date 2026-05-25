# BlogSystem ✦

一个功能完整、视觉精彩的博客平台。后端 Node.js + Express + **MySQL**，前端原生 JS + 现代 CSS。

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
2. 浏览器打开 http://localhost:3000

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
```

如果你换了 MySQL 密码或想换库名，改这里就行。

## 数据迁移

如果数据库被清掉了、或者想换一个新库重来：

```
npm run migrate
```
（或双击 `迁移数据库.bat`）

迁移脚本会：
- 自动 `CREATE DATABASE` 如果不存在
- 创建所有表（users / posts / tags / post_tags / comments / likes）
- 优先从 `data/blog.json` 导入历史数据；没有就写入默认演示数据
- 已有数据则跳过，不会重复导入

## 数据库结构

```
users        用户表（用户名 + 邮箱唯一）
posts        文章表（FK → users）
tags         标签字典
post_tags    文章-标签 多对多
comments     评论（FK → posts, users）
likes        点赞（复合主键 post_id + user_id）
```

字符集 utf8mb4，引擎 InnoDB，所有外键 `ON DELETE CASCADE`。

## 功能

后端
- 注册 / 登录（JWT 30 天）
- 文章 CRUD（Markdown），分类 + 多标签
- 评论、点赞、浏览量
- 全文搜索 + 标签 / 分类筛选 + 最新 / 最热排序
- 个人主页

前端
- 单页应用，hash 路由
- 暗黑 / 明亮主题切换（持久化）
- 极光渐变 + 毛玻璃 + 动画
- Markdown 实时预览写作页 + 代码高亮
- 响应式

## 目录

```
BlogSystem/
├── .env                      # 数据库 / JWT 配置
├── data/blog.json            # 之前 JSON 版本的存档（迁移源）
├── public/                   # 前端
├── server/
│   ├── index.js              # Express + 路由
│   ├── db.js                 # MySQL 数据访问层
│   └── migrate.js            # 建库建表 + 导入数据
├── 启动.bat
├── 迁移数据库.bat
└── package.json
```

## 常见问题

**MySQL 连接失败**：服务启动会先 ping 数据库，连不上会打印错误并退出。检查 MySQL 服务有没有跑（`服务` → MySQL80）、`.env` 里的密码对不对。

**端口 3000 被占**：`netstat -ano | findstr :3000` 找到 PID，`taskkill /F /PID <pid>` 杀掉。
