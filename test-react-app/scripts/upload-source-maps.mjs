import { readFile, readdir, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_RELEASE } from '../src/release.js'

const APP_KEY = 'test-app-key'
const ENVIRONMENT = 'production'
const SERVER_URL = (
  process.env.MONITOR_SERVER_URL ||
  process.env.VITE_MONITOR_SERVER_URL ||
  'http://localhost:3001'
).replace(/\/$/, '')
const ADMIN_API_TOKEN = process.env.MONITOR_ADMIN_TOKEN || ''
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const distDirectory = join(appRoot, 'dist')
const shouldDeleteAfterUpload = process.argv.includes('--delete-after-upload')

const findJavaScriptMaps = async directory => {
  const entries = await readdir(directory, { withFileTypes: true })
  const nestedFiles = await Promise.all(entries.map(async entry => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return findJavaScriptMaps(entryPath)
    return entry.name.endsWith('.js.map') ? [entryPath] : []
  }))

  return nestedFiles.flat()
}

const uploadSourceMaps = async () => {
  const mapFiles = await findJavaScriptMaps(distDirectory)
  if (mapFiles.length === 0) {
    throw new Error('dist 中没有找到 .js.map，请先执行 npm run build')
  }

  const maps = await Promise.all(mapFiles.map(async filePath => ({
    fileName: basename(filePath),
    map: JSON.parse(await readFile(filePath, 'utf8'))
  })))

  const response = await fetch(`${SERVER_URL}/api/source-maps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ADMIN_API_TOKEN ? { 'X-Admin-Token': ADMIN_API_TOKEN } : {})
    },
    body: JSON.stringify({
      appKey: APP_KEY,
      environment: ENVIRONMENT,
      release: APP_RELEASE,
      maps
    })
  })
  const result = await response.json()

  if (!response.ok) {
    throw new Error(`Source Map 上传失败：${JSON.stringify(result)}`)
  }

  console.log('[Source Map] 上传成功:', {
    release: APP_RELEASE,
    files: result.files,
    inserted: result.inserted,
    updated: result.updated
  })

  if (shouldDeleteAfterUpload) {
    await Promise.all(mapFiles.map(filePath => unlink(filePath)))
    console.log(`[Source Map] 已从公开 dist 中移除 ${mapFiles.length} 个 .map 文件`)
  }
}

uploadSourceMaps().catch(error => {
  console.error('[Source Map]', error.message)
  process.exitCode = 1
})
