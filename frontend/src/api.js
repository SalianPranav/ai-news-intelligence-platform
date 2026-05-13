import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const fetchArticles = (params) => api.get('/articles', { params }).then(r => r.data)
export const fetchArticle  = (id)     => api.get(`/articles/${id}`).then(r => r.data)
export const fetchStats    = ()       => api.get('/stats').then(r => r.data)
export const fetchCategories = ()     => api.get('/categories').then(r => r.data)
export const runPipeline   = (count)  => api.post('/pipeline/run', null, { params: { count } }).then(r => r.data)
export const pipelineStatus = ()      => api.get('/pipeline/status').then(r => r.data)

export default api
