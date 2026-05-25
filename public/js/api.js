// 简洁的 API 封装
const TOKEN_KEY = 'blog_token';
const USER_KEY = 'blog_user';

const Auth = {
  token: () => localStorage.getItem(TOKEN_KEY),
  user: () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch { return null; }
  },
  set(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

async function request(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const token = Auth.token();
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

const API = {
  // auth
  register: (body) => request('POST', '/api/auth/register', body),
  login: (body) => request('POST', '/api/auth/login', body),
  me: () => request('GET', '/api/auth/me'),
  updateMe: (body) => request('PUT', '/api/auth/me', body),
  // posts
  listPosts: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== '')));
    return request('GET', `/api/posts?${qs}`);
  },
  getPost: (id) => request('GET', `/api/posts/${id}`),
  createPost: (body) => request('POST', '/api/posts', body),
  updatePost: (id, body) => request('PUT', `/api/posts/${id}`, body),
  deletePost: (id) => request('DELETE', `/api/posts/${id}`),
  likePost: (id) => request('POST', `/api/posts/${id}/like`),
  // comments
  listComments: (id) => request('GET', `/api/posts/${id}/comments`),
  createComment: (id, body) => request('POST', `/api/posts/${id}/comments`, body),
  deleteComment: (id) => request('DELETE', `/api/comments/${id}`),
  // misc
  tags: () => request('GET', '/api/tags'),
  categories: () => request('GET', '/api/categories'),
  stats: () => request('GET', '/api/stats'),
  user: (id) => request('GET', `/api/users/${id}`),
};
