import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography
} from 'antd'
import { getSlowRequests } from '../api/monitorApi.js'
import { buildMonitorQuery, useFilterStore } from '../store/filterStore.js'

const EMPTY_SUMMARY = {
  total: 0,
  averageElapsedTime: 0,
  maxElapsedTime: 0,
  failureCount: 0
}

const thresholdOptions = [
  { value: 200, label: '≥ 200ms' },
  { value: 500, label: '≥ 500ms' },
  { value: 1000, label: '≥ 1000ms' },
  { value: 2000, label: '≥ 2000ms' }
]

const requestTypeOptions = [
  { value: 'all', label: '全部请求' },
  { value: 'fetch', label: 'Fetch' },
  { value: 'xhr', label: 'XHR' }
]

const resultOptions = [
  { value: 'all', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' }
]

const formatDuration = value => Number.isFinite(value) ? Math.round(value) : 0

const formatTimestamp = timestamp => timestamp
  ? new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
  : '--'

const isSuccessful = record => (
  record.success === true || (
    record.success !== false &&
    Number(record.status) >= 200 &&
    Number(record.status) < 400
  )
)

function RequestsPage() {
  const appKey = useFilterStore(state => state.appKey)
  const environment = useFilterStore(state => state.environment)
  const timeRange = useFilterStore(state => state.timeRange)
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [minDuration, setMinDuration] = useState(500)
  const [requestType, setRequestType] = useState('all')
  const [result, setResult] = useState('all')
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const previousFilterKey = useRef('')

  const filterKey = `${appKey}|${environment}|${timeRange}|${minDuration}|${requestType}|${result}`

  useEffect(() => {
    const controller = new AbortController()
    const filtersChanged = previousFilterKey.current !== filterKey
    const requestPage = filtersChanged ? 1 : page

    if (filtersChanged) {
      previousFilterKey.current = filterKey
      if (page !== 1) setPage(1)
    }

    const loadRequests = async () => {
      setLoading(true)
      setError('')

      try {
        const query = buildMonitorQuery({ appKey, environment, timeRange })
        const response = await getSlowRequests({
          ...query,
          minDuration,
          requestType: requestType === 'all' ? undefined : requestType,
          result: result === 'all' ? undefined : result,
          page: requestPage,
          pageSize
        }, { signal: controller.signal })

        setItems(response.items)
        setSummary(response.summary)
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.message)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadRequests()
    return () => controller.abort()
  }, [filterKey, page, pageSize])

  const columns = useMemo(() => [
    {
      title: '类型',
      dataIndex: 'requestType',
      width: 90,
      render: value => <Tag color={value === 'fetch' ? 'blue' : 'purple'}>{value?.toUpperCase()}</Tag>
    },
    { title: '方法', dataIndex: 'method', width: 90 },
    {
      title: '请求地址',
      dataIndex: 'url',
      ellipsis: true,
      render: value => <Typography.Text title={value}>{value || '--'}</Typography.Text>
    },
    {
      title: '状态码',
      dataIndex: 'status',
      width: 100,
      render: value => value || '--'
    },
    {
      title: '结果',
      key: 'result',
      width: 90,
      render: (_, record) => (
        <Tag color={isSuccessful(record) ? 'success' : 'error'}>
          {isSuccessful(record) ? '成功' : '失败'}
        </Tag>
      )
    },
    {
      title: '耗时',
      dataIndex: 'elapsedTime',
      width: 110,
      render: value => (
        <Typography.Text type={value >= 1000 ? 'danger' : undefined} strong>
          {formatDuration(value)} ms
        </Typography.Text>
      )
    },
    {
      title: '发生时间',
      dataIndex: 'timestamp',
      width: 180,
      render: formatTimestamp
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, record) => (
        <Button type="link" onClick={() => setSelectedRequest(record)}>
          查看详情
        </Button>
      )
    }
  ], [])

  const handleTableChange = nextPagination => {
    const nextPageSize = nextPagination.pageSize || pageSize
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize)
      setPage(1)
      return
    }
    setPage(nextPagination.current || 1)
  }

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>慢接口分析</Typography.Title>
        <Typography.Paragraph className="page-description">
          按耗时倒序查询 Fetch 与 XHR 请求，同时区分“成功但很慢”和“请求失败”。
        </Typography.Paragraph>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="慢接口数据加载失败"
          description={error}
        />
      )}

      <Row gutter={[16, 16]}>
        <Col xs={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="慢请求" value={summary.total} suffix="条" />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="平均耗时" value={formatDuration(summary.averageElapsedTime)} suffix="ms" />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="最大耗时" value={formatDuration(summary.maxElapsedTime)} suffix="ms" />
          </Card>
        </Col>
        <Col xs={12} lg={6}>
          <Card loading={loading}>
            <Statistic title="其中失败" value={summary.failureCount} suffix="条" />
          </Card>
        </Col>
      </Row>

      <Card variant="borderless">
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Text type="secondary">最低耗时</Typography.Text>
            <Select
              aria-label="选择最低耗时"
              value={minDuration}
              options={thresholdOptions}
              onChange={setMinDuration}
              style={{ width: 130 }}
            />
            <Typography.Text type="secondary">请求类型</Typography.Text>
            <Select
              aria-label="选择请求类型"
              value={requestType}
              options={requestTypeOptions}
              onChange={setRequestType}
              style={{ width: 125 }}
            />
            <Typography.Text type="secondary">请求结果</Typography.Text>
            <Select
              aria-label="选择请求结果"
              value={result}
              options={resultOptions}
              onChange={setResult}
              style={{ width: 120 }}
            />
          </Space>

          <Table
            rowKey="eventId"
            columns={columns}
            dataSource={items}
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: page,
              pageSize,
              total: summary.total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: value => `共 ${value} 条慢请求`
            }}
            locale={{ emptyText: `当前筛选范围内没有超过 ${minDuration}ms 的请求` }}
            scroll={{ x: 1100 }}
          />
        </Space>
      </Card>

      <Drawer
        title="请求详情"
        size="large"
        open={Boolean(selectedRequest)}
        onClose={() => setSelectedRequest(null)}
        destroyOnHidden
      >
        {selectedRequest && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="事件 ID">{selectedRequest.eventId}</Descriptions.Item>
            <Descriptions.Item label="请求类型">{selectedRequest.requestType?.toUpperCase()}</Descriptions.Item>
            <Descriptions.Item label="请求方法">{selectedRequest.method || '--'}</Descriptions.Item>
            <Descriptions.Item label="请求地址">{selectedRequest.url || '--'}</Descriptions.Item>
            <Descriptions.Item label="状态码">{selectedRequest.status || '--'}</Descriptions.Item>
            <Descriptions.Item label="请求结果">
              <Tag color={isSuccessful(selectedRequest) ? 'success' : 'error'}>
                {isSuccessful(selectedRequest) ? '成功' : '失败'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="错误类型">{selectedRequest.errorType || '--'}</Descriptions.Item>
            <Descriptions.Item label="请求耗时">{formatDuration(selectedRequest.elapsedTime)} ms</Descriptions.Item>
            <Descriptions.Item label="发生时间">{formatTimestamp(selectedRequest.timestamp)}</Descriptions.Item>
            <Descriptions.Item label="会话 ID">{selectedRequest.sessionId || '--'}</Descriptions.Item>
            <Descriptions.Item label="发生页面">{selectedRequest.pageUrl || '--'}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </Space>
  )
}

export default RequestsPage
