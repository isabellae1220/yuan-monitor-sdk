import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Card,
  Col,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Typography
} from 'antd'
import PerformanceTrendChart from '../components/PerformanceTrendChart.jsx'
import {
  getPerformanceOverview,
  getPerformanceTrends
} from '../api/monitorApi.js'
import { buildMonitorQuery, useFilterStore } from '../store/filterStore.js'

const METRICS = ['LCP', 'INP', 'CLS', 'TTFB', 'FCP']
const EMPTY_OVERVIEW = {
  webVitals: {},
  longTasks: { count: 0, averageDuration: 0, maxDuration: 0 },
  resources: { count: 0, averageDuration: 0, maxDuration: 0 }
}
const EMPTY_TRENDS = {
  bucketSize: 24 * 60 * 60 * 1000,
  metrics: {}
}

const formatMetric = (value, metric) => {
  if (!Number.isFinite(value)) return '--'
  return metric === 'CLS' ? value.toFixed(3) : Math.round(value)
}

const metricSuffix = metric => metric === 'CLS' ? '' : 'ms'

const metricOptions = METRICS.map(metric => ({
  value: metric,
  label: `${metric} 趋势`
}))

const columns = [
  { title: '指标', dataIndex: 'metric', width: 90 },
  { title: '样本量', dataIndex: 'count', width: 90 },
  {
    title: '平均值',
    dataIndex: 'average',
    render: (value, row) => `${formatMetric(value, row.metric)} ${metricSuffix(row.metric)}`.trim()
  },
  {
    title: 'P75',
    dataIndex: 'p75',
    render: (value, row) => `${formatMetric(value, row.metric)} ${metricSuffix(row.metric)}`.trim()
  },
  {
    title: 'P90',
    dataIndex: 'p90',
    render: (value, row) => `${formatMetric(value, row.metric)} ${metricSuffix(row.metric)}`.trim()
  },
  {
    title: 'P95',
    dataIndex: 'p95',
    render: (value, row) => `${formatMetric(value, row.metric)} ${metricSuffix(row.metric)}`.trim()
  },
  {
    title: '最小值',
    dataIndex: 'min',
    render: (value, row) => `${formatMetric(value, row.metric)} ${metricSuffix(row.metric)}`.trim()
  },
  {
    title: '最大值',
    dataIndex: 'max',
    render: (value, row) => `${formatMetric(value, row.metric)} ${metricSuffix(row.metric)}`.trim()
  }
]

function PerformancePage() {
  const appKey = useFilterStore(state => state.appKey)
  const environment = useFilterStore(state => state.environment)
  const timeRange = useFilterStore(state => state.timeRange)
  const [overview, setOverview] = useState(EMPTY_OVERVIEW)
  const [trends, setTrends] = useState(EMPTY_TRENDS)
  const [selectedMetric, setSelectedMetric] = useState('LCP')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const query = buildMonitorQuery({ appKey, environment, timeRange })

    const loadPerformance = async () => {
      setLoading(true)
      setError('')

      try {
        const requestConfig = { signal: controller.signal }
        const [overviewResult, trendResult] = await Promise.all([
          getPerformanceOverview(query, requestConfig),
          getPerformanceTrends(query, requestConfig)
        ])
        setOverview(overviewResult)
        setTrends(trendResult)
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.message)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadPerformance()
    return () => controller.abort()
  }, [appKey, environment, timeRange])

  const webVitalRows = useMemo(() => METRICS
    .filter(metric => overview.webVitals[metric])
    .map(metric => ({
      metric,
      ...overview.webVitals[metric]
    })), [overview.webVitals])

  const selectedPoints = trends.metrics[selectedMetric] || []

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>性能分析</Typography.Title>
        <Typography.Paragraph className="page-description">
          聚合 Web Vitals 的整体分布，并按时间桶展示平均值、P75 与 P95 的变化趋势。
        </Typography.Paragraph>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="性能数据加载失败"
          description={error}
        />
      )}

      <Row gutter={[16, 16]}>
        {['LCP', 'INP', 'CLS', 'TTFB'].map(metric => (
          <Col xs={24} sm={12} xl={6} key={metric}>
            <Card loading={loading}>
              <Statistic
                title={`${metric} P75`}
                value={formatMetric(overview.webVitals[metric]?.p75, metric)}
                suffix={metricSuffix(metric)}
              />
              <Typography.Text type="secondary">
                样本量：{overview.webVitals[metric]?.count || 0}
              </Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>

      <Card
        title="Web Vitals 趋势"
        extra={(
          <Select
            value={selectedMetric}
            options={metricOptions}
            onChange={setSelectedMetric}
            style={{ width: 140 }}
          />
        )}
      >
        <PerformanceTrendChart
          metric={selectedMetric}
          points={selectedPoints}
          bucketSize={trends.bucketSize}
          loading={loading}
        />
        {!loading && selectedPoints.length === 0 && (
          <Typography.Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 0 }}>
            当前筛选范围内暂无 {selectedMetric} 趋势数据
          </Typography.Paragraph>
        )}
      </Card>

      <Card title="Web Vitals 分位数">
        <Table
          rowKey="metric"
          columns={columns}
          dataSource={webVitalRows}
          loading={loading}
          pagination={false}
          scroll={{ x: 920 }}
          locale={{ emptyText: '当前筛选范围内暂无 Web Vitals 数据' }}
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Long Task 汇总" loading={loading}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="数量" value={overview.longTasks.count} suffix="条" />
              </Col>
              <Col span={8}>
                <Statistic
                  title="平均耗时"
                  value={formatMetric(overview.longTasks.averageDuration, 'LCP')}
                  suffix="ms"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="最大耗时"
                  value={formatMetric(overview.longTasks.maxDuration, 'LCP')}
                  suffix="ms"
                />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Resource Timing 汇总" loading={loading}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="数量" value={overview.resources.count} suffix="条" />
              </Col>
              <Col span={8}>
                <Statistic
                  title="平均耗时"
                  value={formatMetric(overview.resources.averageDuration, 'LCP')}
                  suffix="ms"
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="最大耗时"
                  value={formatMetric(overview.resources.maxDuration, 'LCP')}
                  suffix="ms"
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Space>
  )
}

export default PerformancePage
