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

// 带进度回调 + 可取消的文件上传。返回一个 Promise，其上挂 .xhr 便于外部调 .abort()
function uploadWithProgress(url, file, onProgress) {
  const fd = new FormData();
  fd.append('file', file);
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open('POST', url);
    const token = Auth.token();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (typeof onProgress === 'function') {
      let lastT = Date.now(), lastL = 0;
      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const now = Date.now();
        const dt = (now - lastT) / 1000;
        const speed = dt > 0 ? (e.loaded - lastL) / dt : 0; // bytes/s
        lastT = now; lastL = e.loaded;
        onProgress({ loaded: e.loaded, total: e.total, percent: e.loaded / e.total * 100, speed });
      });
    }
    xhr.addEventListener('load', () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error || `上传失败 (${xhr.status})`));
    });
    xhr.addEventListener('error', () => reject(new Error('网络错误')));
    xhr.addEventListener('abort', () => reject(new Error('已取消')));
    xhr.send(fd);
  });
  promise.xhr = xhr;
  promise.abort = () => xhr.abort();
  return promise;
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
  bookmarkPost: (id) => request('POST', `/api/posts/${id}/bookmark`),
  myBookmarks: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== '')));
    return request('GET', `/api/me/bookmarks?${qs}`);
  },
  myDrafts: () => request('GET', '/api/me/drafts'),
  // reading history
  history: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== '')));
    return request('GET', `/api/me/history?${qs}`);
  },
  clearHistory: () => request('DELETE', '/api/me/history'),
  deleteHistoryItem: (postId) => request('DELETE', `/api/me/history/${postId}`),
  uploadLimits: () => request('GET', '/api/upload/limits'),
  // upload
  async uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);
    const opts = { method: 'POST', body: fd, headers: {} };
    const token = Auth.token();
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    const res = await fetch('/api/upload', opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`);
    return data;
  },
  async uploadVideo(file, onProgress) {
    return uploadWithProgress('/api/upload/video', file, onProgress);
  },
  async uploadAudio(file, onProgress) {
    return uploadWithProgress('/api/upload/audio', file, onProgress);
  },
  // comments
  listComments: (id) => request('GET', `/api/posts/${id}/comments`),
  createComment: (id, body) => request('POST', `/api/posts/${id}/comments`, body),
  deleteComment: (id) => request('DELETE', `/api/comments/${id}`),
  // follow
  toggleFollow: (id) => request('POST', `/api/users/${id}/follow`),
  followers: (id) => request('GET', `/api/users/${id}/followers`),
  following: (id) => request('GET', `/api/users/${id}/following`),
  // notifications
  notifications: () => request('GET', '/api/notifications'),
  unreadCount: () => request('GET', '/api/notifications/unread'),
  markAllRead: () => request('POST', '/api/notifications/read'),
  // misc
  tags: () => request('GET', '/api/tags'),
  categories: () => request('GET', '/api/categories'),
  stats: () => request('GET', '/api/stats'),
  user: (id) => request('GET', `/api/users/${id}`),
  searchUsers: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== '')));
    return request('GET', `/api/users/search?${qs}`);
  },
  // admin
  admin: {
    overview: () => request('GET', '/api/admin/overview'),
    users: (params = {}) => {
      const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== '')));
      return request('GET', `/api/admin/users?${qs}`);
    },
    deleteUser: (id) => request('DELETE', `/api/admin/users/${id}`),
    setUserRole: (id, role) => request('PUT', `/api/admin/users/${id}/role`, { role }),
    posts: (params = {}) => {
      const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== '')));
      return request('GET', `/api/admin/posts?${qs}`);
    },
    deletePost: (id) => request('DELETE', `/api/admin/posts/${id}`),
    comments: (params = {}) => {
      const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null && v !== '')));
      return request('GET', `/api/admin/comments?${qs}`);
    },
    deleteComment: (id) => request('DELETE', `/api/admin/comments/${id}`),
  },
  // messages (批次 7)
  messages: {
    conversations: () => request('GET', '/api/messages/conversations'),
    unreadCount:   () => request('GET', '/api/messages/unread'),
    thread: (uid, params = {}) => request('GET', `/api/messages/${uid}?` +
      new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v != null && v !== '')))),
    send:   (uid, body) => request('POST', `/api/messages/${uid}`, body),
    markRead: (uid)     => request('POST', `/api/messages/${uid}/read`),
  },
};
