import { useEffect, useState } from 'react'
import { Alert, Card, Col, Row, Space, Statistic, Table, Typography } from 'antd'
import {
  getErrorGroups,
  getPerformanceOverview,
  getSlowRequests
} from '../api/monitorApi.js'
import { buildMonitorQuery, useFilterStore } from '../store/filterStore.js'

const EMPTY_OVERVIEW = {
  errorTotal: 0,
  performance: { webVitals: {}, longTasks: { count: 0 }, resources: { count: 0 } },
  slowRequests: []
}

const slowRequestColumns = [
  { title: '类型', dataIndex: 'requestType', width: 90 },
  { title: '方法', dataIndex: 'method', width: 90 },
  { title: '请求地址', dataIndex: 'url', ellipsis: true },
  { title: '状态码', dataIndex: 'status', width: 100 },
  {
    title: '耗时',
    dataIndex: 'elapsedTime',
    width: 120,
    render: value => `${Math.round(value)} ms`
  }
]

const formatMetric = value => (
  Number.isFinite(value) ? Math.round(value) : '--'
)

function OverviewPage() {
  const appKey = useFilterStore(state => state.appKey)
  const environment = useFilterStore(state => state.environment)
  const timeRange = useFilterStore(state => state.timeRange)
  const [overview, setOverview] = useState(EMPTY_OVERVIEW)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const query = buildMonitorQuery({ appKey, environment, timeRange })

    const loadOverview = async () => {
      setLoading(true)
      setError('')

      try {
        const requestConfig = { signal: controller.signal }
        const [errorResult, performanceResult, slowRequestResult] = await Promise.all([
          getErrorGroups({ ...query, page: 1, pageSize: 1 }, requestConfig),
          getPerformanceOverview(query, requestConfig),
          getSlowRequests({ ...query, minDuration: 500, limit: 5 }, requestConfig)
        ])

        setOverview({
          errorTotal: errorResult.pagination.total,
          performance: performanceResult,
          slowRequests: slowRequestResult.items
        })
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.message)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadOverview()

    return () => controller.abort()
  }, [appKey, environment, timeRange])

  const ttfb = overview.performance.webVitals.TTFB
  const lcp = overview.performance.webVitals.LCP

  return (
    <Space direction="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>数据概览</Typography.Title>
        <Typography.Paragraph className="page-description">
          当前卡片和慢接口列表来自 Express 对 MongoDB 监控事件的实时查询结果。
        </Typography.Paragraph>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="概览数据加载失败"
          description={error}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic title="错误组" value={overview.errorTotal} suffix="组" />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic title="TTFB P90" value={formatMetric(ttfb?.p90)} suffix="ms" />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic title="LCP P75" value={formatMetric(lcp?.p75)} suffix="ms" />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title="Long Task"
              value={overview.performance.longTasks.count}
              suffix="条"
            />
          </Card>
        </Col>
      </Row>

      <Card title="慢接口 Top 5" bordered={false}>
        <Table
          rowKey="eventId"
          columns={slowRequestColumns}
          dataSource={overview.slowRequests}
          loading={loading}
          pagination={false}
          locale={{ emptyText: '当前筛选范围内没有超过 500ms 的请求' }}
          size="middle"
        />
      </Card>
    </Space>
  )
}

export default OverviewPage
