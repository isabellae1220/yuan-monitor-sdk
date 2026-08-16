import { Select, Space, Typography } from 'antd'
import { useFilterStore } from '../store/filterStore.js'

const appOptions = [
  { value: 'test-app-key', label: '测试项目' }
]

const environmentOptions = [
  { value: 'development', label: '开发环境' },
  { value: 'production', label: '生产环境' }
]

const timeRangeOptions = [
  { value: '1h', label: '最近1小时' },
  { value: '24h', label: '最近24小时' },
  { value: '7d', label: '最近7天' },
  { value: '30d', label: '最近30天' },
  { value: 'all', label: '全部时间' }
]

function GlobalFilters() {
  const appKey = useFilterStore(state => state.appKey)
  const environment = useFilterStore(state => state.environment)
  const timeRange = useFilterStore(state => state.timeRange)
  const setAppKey = useFilterStore(state => state.setAppKey)
  const setEnvironment = useFilterStore(state => state.setEnvironment)
  const setTimeRange = useFilterStore(state => state.setTimeRange)

  return (
    <Space wrap size={12}>
      <Typography.Text type="secondary">筛选范围</Typography.Text>
      <Select
        aria-label="选择项目"
        value={appKey}
        options={appOptions}
        onChange={setAppKey}
        style={{ width: 128 }}
      />
      <Select
        aria-label="选择环境"
        value={environment}
        options={environmentOptions}
        onChange={setEnvironment}
        style={{ width: 128 }}
      />
      <Select
        aria-label="选择时间范围"
        value={timeRange}
        options={timeRangeOptions}
        onChange={setTimeRange}
        style={{ width: 132 }}
      />
    </Space>
  )
}

export default GlobalFilters
