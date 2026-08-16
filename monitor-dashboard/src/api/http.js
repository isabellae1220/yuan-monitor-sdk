import axios from 'axios'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000
})

http.interceptors.response.use(
  response => response.data,
  error => {
    const isTimeout = error.code === 'ECONNABORTED'
    const message = error.response?.data?.message ||
      (isTimeout ? '请求超时，请稍后重试' : error.message || '请求失败')

    const normalizedError = new Error(message)
    normalizedError.code = error.code
    normalizedError.status = error.response?.status
    normalizedError.details = error.response?.data
    normalizedError.originalError = error

    return Promise.reject(normalizedError)
  }
)

export default http
