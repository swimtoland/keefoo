import axios from 'axios'

/** localStorage keys for auth */
export const STORAGE_TOKEN = 'keefoo_token'
export const STORAGE_USER = 'keefoo_user'

/**
 * 演示用户逻辑 id 为 demo-user-001，
 * 对应 UUID 为 uuid5(NAMESPACE_URL, "demo-user-001")（与 seed_data / 后端一致）。
 * 新代码请使用登录用户的 user.id；保留导出供兼容或测试。
 */
export const DEMO_USER_ID = 'c20a1947-6451-5f17-a0f6-73ea354727d1'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_TOKEN)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    const url = String(error.config?.url || '')
    if (status === 401) {
      const isAuthSubmit = url.includes('/auth/login') || url.includes('/auth/register')
      if (!isAuthSubmit) {
        localStorage.removeItem(STORAGE_TOKEN)
        localStorage.removeItem(STORAGE_USER)
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  },
)

// --- Auth ---

export function register(email, password, nickname) {
  const body = { email, password }
  if (nickname !== undefined && nickname !== null && String(nickname).trim() !== '') {
    body.nickname = String(nickname).trim()
  }
  return api.post('/auth/register', body).then((r) => r.data)
}

export function login(email, password) {
  return api.post('/auth/login', { email, password }).then((r) => r.data)
}

export function getMe() {
  return api.get('/auth/me').then((r) => r.data)
}

// --- Users ---

export function getUser(userId) {
  return api.get(`/users/${userId}`).then((r) => r.data)
}

export function getFeed(userId) {
  return api.get('/feed', { params: { user_id: userId } }).then((r) => r.data)
}

export function markFeedRead(cardId) {
  return api.post(`/feed/${cardId}/read`).then((r) => r.data)
}

export function getPositions(userId) {
  return api.get('/positions', { params: { user_id: userId } }).then((r) => r.data)
}

export function getTrades(userId, status) {
  const params = { user_id: userId }
  if (status) params.status = status
  return api.get('/trades', { params }).then((r) => r.data)
}

export function createTrade(userId, data) {
  return api.post('/trades', data, { params: { user_id: userId } }).then((r) => r.data)
}

export function getTrade(tradeId) {
  return api.get(`/trades/${tradeId}`).then((r) => r.data)
}

export function getShadowPositions(userId) {
  return api.get('/shadow-positions', { params: { user_id: userId } }).then((r) => r.data)
}

export function createShadowPosition(userId, data) {
  return api.post('/shadow-positions', data, { params: { user_id: userId } }).then((r) => r.data)
}

export function deleteShadowPosition(shadowId, userId) {
  return api.delete(`/shadow-positions/${shadowId}`, { params: { user_id: userId } })
}

export function getPendingQuestions(userId) {
  return api.get('/agent/pending-questions', { params: { user_id: userId } }).then((r) => r.data)
}

export function replyToAgent(data) {
  return api.post('/agent/reply', data).then((r) => r.data)
}

export function getScenarioPushes(userId) {
  return api.get('/scenario-pushes', { params: { user_id: userId } }).then((r) => r.data)
}

export function getAssetDetail(assetId, userId) {
  return api.get(`/assets/${assetId}/detail`, { params: { user_id: userId } }).then((r) => r.data)
}

export function searchAssets(keyword) {
  return api.get('/assets/search', { params: { keyword } }).then((r) => r.data)
}

/** period: weekly | monthly | quarterly */
export function getReport(userId, period = 'weekly') {
  return api.get(`/reports/${period}`, { params: { user_id: userId } }).then((r) => r.data)
}

export function getStrategyProfile(userId) {
  return api.get('/profile/strategy', { params: { user_id: userId } }).then((r) => r.data)
}

export function getBiases(userId) {
  return api.get('/profile/biases', { params: { user_id: userId } }).then((r) => r.data)
}

export function getKnowledgeGraph(userId) {
  return api.get('/graph/knowledge', { params: { user_id: userId } }).then((r) => r.data)
}

// --- Notes / Notebooks ---

export function getNotebooks(userId) {
  return api.get('/notebooks', { params: { user_id: userId } }).then((r) => r.data)
}

export function createNotebook(userId, data) {
  return api.post('/notebooks', data, { params: { user_id: userId } }).then((r) => r.data)
}

export function updateNotebook(userId, notebookId, data) {
  return api
    .put(`/notebooks/${notebookId}`, data, { params: { user_id: userId } })
    .then((r) => r.data)
}

export function deleteNotebook(userId, notebookId) {
  return api.delete(`/notebooks/${notebookId}`, { params: { user_id: userId } }).then((r) => r.data)
}

export function getNotes(userId, params = {}) {
  const q = { user_id: userId }
  if (params.notebook_id !== undefined) q.notebook_id = params.notebook_id
  if (params.tag_id !== undefined) q.tag_id = params.tag_id
  if (params.search !== undefined) q.search = params.search
  if (params.linked_asset_id !== undefined) q.linked_asset_id = params.linked_asset_id
  return api.get('/notes', { params: q }).then((r) => r.data)
}

export function createNote(userId, data) {
  return api.post('/notes', data, { params: { user_id: userId } }).then((r) => r.data)
}

export function getNote(userId, noteId) {
  // backend requires effective user id via Bearer or ?user_id=
  return api.get(`/notes/${noteId}`, { params: { user_id: userId } }).then((r) => r.data)
}

export function updateNote(userId, noteId, data) {
  return api.put(`/notes/${noteId}`, data, { params: { user_id: userId } }).then((r) => r.data)
}

export function deleteNote(userId, noteId) {
  return api.delete(`/notes/${noteId}`, { params: { user_id: userId } }).then((r) => r.data)
}

export function moveNote(userId, noteId, data) {
  return api.post(`/notes/${noteId}/move`, data, { params: { user_id: userId } }).then((r) => r.data)
}

// --- Tags ---

export function getTags(userId) {
  return api.get('/tags', { params: { user_id: userId } }).then((r) => r.data)
}

export function createTag(userId, data) {
  return api.post('/tags', data, { params: { user_id: userId } }).then((r) => r.data)
}

export function updateTag(userId, tagId, data) {
  return api.put(`/tags/${tagId}`, data, { params: { user_id: userId } }).then((r) => r.data)
}

export function deleteTag(userId, tagId) {
  return api.delete(`/tags/${tagId}`, { params: { user_id: userId } }).then((r) => r.data)
}

// --- Calendar / Reminders ---

export function getCalendarMonth(userId, year, month) {
  return api
    .get('/calendar/month', { params: { user_id: userId, year, month } })
    .then((r) => r.data)
}

export function getCalendarDay(userId, date) {
  return api.get('/calendar/day', { params: { user_id: userId, date } }).then((r) => r.data)
}

export function getCalendarWeek(userId, startDate) {
  return api
    .get('/calendar/week', { params: { user_id: userId, start_date: startDate } })
    .then((r) => r.data)
}

export function getReminders(userId, params = {}) {
  return api.get('/reminders', { params: { user_id: userId, ...params } }).then((r) => r.data)
}

export function createReminder(userId, data) {
  return api.post('/reminders', data, { params: { user_id: userId } }).then((r) => r.data)
}

export function updateReminder(reminderId, data) {
  return api.put(`/reminders/${reminderId}`, data).then((r) => r.data)
}

export function deleteReminder(reminderId) {
  return api.delete(`/reminders/${reminderId}`).then((r) => r.data)
}

export default api
