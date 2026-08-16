import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Pagination,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Timeline,
  Typography
} from 'antd'
import { getErrorGroupEvents, getErrorGroups } from '../api/monitorApi.js'
import SourceMapPanel from '../components/SourceMapPanel.jsx'
import { buildMonitorQuery, useFilterStore } from '../store/filterStore.js'

const ERROR_TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'js', label: 'JavaScript错误' },
  { value: 'promise', label: 'Promise异常' },
  { value: 'resource', label: '资源加载失败' },
  { value: 'react', label: 'React错误' },
  { value: 'vue', label: 'Vue错误' },
  { value: 'manual', label: '手动上报' }
]

const ERROR_TYPE_LABELS = Object.fromEntries(
  ERROR_TYPE_OPTIONS.map(option => [option.value, option.label])
)

const ERROR_TYPE_COLORS = {
  js: 'red',
  promise: 'orange',
  resource: 'gold',
  react: 'blue',
  vue: 'green',
  manual: 'purple'
}

const formatTimestamp = value => {
  if (!Number.isFinite(Number(value))) return '--'
  return new Date(Number(value)).toLocaleString('zh-CN', { hour12: false })
}

const baseColumns = [
  {
    title: '错误消息',
    dataIndex: 'message',
    width: 280,
    render: value => (
      <Typography.Text
        ellipsis={{ tooltip: value || '未提供错误消息' }}
        style={{ maxWidth: 250 }}
      >
        {value || '未提供错误消息'}
      </Typography.Text>
    )
  },
  {
    title: '类型',
    dataIndex: 'subType',
    width: 130,
    render: value => (
      <Tag color={ERROR_TYPE_COLORS[value] || 'default'}>
        {ERROR_TYPE_LABELS[value] || value || '未知'}
      </Tag>
    )
  },
  {
    title: '发生次数',
    dataIndex: 'occurrenceCount',
    width: 100,
    sorter: false,
    render: value => `${value || 0} 次`
  },
  {
    title: '首次发生',
    dataIndex: 'firstSeenAt',
    width: 190,
    render: formatTimestamp
  },
  {
    title: '最近发生',
    dataIndex: 'lastSeenAt',
    width: 190,
    render: formatTimestamp
  },
  {
    title: '最近页面',
    dataIndex: 'latestPageUrl',
    width: 260,
    render: value => (
      <Typography.Text
        type="secondary"
        ellipsis={{ tooltip: value || '--' }}
        style={{ maxWidth: 230 }}
      >
        {value || '--'}
      </Typography.Text>
    )
  }
]

const describeBreadcrumb = breadcrumb => {
  const type = breadcrumb.type || 'unknown'

  if (type === 'click') {
    const target = breadcrumb.selector || breadcrumb.tagName || '页面元素'
    const text = breadcrumb.text ? `“${breadcrumb.text}”` : ''
    return `点击 ${target} ${text}`.trim()
  }

  if (type === 'route') {
    return `${breadcrumb.method || 'route'}：${breadcrumb.from || '--'} → ${breadcrumb.to || '--'}`
  }

  if (type === 'fetch' || type === 'xhr') {
    const duration = Number.isFinite(Number(breadcrumb.elapsedTime))
      ? `，${Math.round(Number(breadcrumb.elapsedTime))}ms`
      : ''
    return `${breadcrumb.method || 'GET'} ${breadcrumb.url || '--'}，状态 ${breadcrumb.status ?? '网络异常'}${duration}`
  }

  if (type === 'console') {
    return `${breadcrumb.level || 'log'}：${breadcrumb.message || '控制台输出'}`
  }

  return `${type}：${breadcrumb.message || '用户行为'}`
}

function StackBlock({ title, value }) {
  if (!value) return null

  return (
    <Card size="small" title={title}>
      <pre style={{
        margin: 0,
        padding: 12,
        maxHeight: 260,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        background: '#f6f8fa',
        borderRadius: 6
      }}>
        {value}
      </pre>
    </Card>
  )
}

function ErrorsPage() {
  const appKey = useFilterStore(state => state.appKey)
  const environment = useFilterStore(state => state.environment)
  const timeRange = useFilterStore(state => state.timeRange)
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [subType, setSubType] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detailPage, setDetailPage] = useState(1)
  const [detailPageSize, setDetailPageSize] = useState(10)
  const [selectedEventId, setSelectedEventId] = useState('')

  const filterKey = [appKey, environment, timeRange, subType].join('|')
  const previousFilterKey = useRef(filterKey)

  useEffect(() => {
    if (previousFilterKey.current !== filterKey) {
      previousFilterKey.current = filterKey
      if (page !== 1) {
        setPage(1)
        return undefined
      }
    }

    const controller = new AbortController()

    const loadErrors = async () => {
      setLoading(true)
      setError('')

      try {
        const query = buildMonitorQuery({ appKey, environment, timeRange })
        const result = await getErrorGroups(
          {
            ...query,
            subType: subType || undefined,
            page,
            pageSize
          },
          { signal: controller.signal }
        )

        setItems(result.items)
        setTotal(result.pagination.total)
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

    loadErrors()
    return () => controller.abort()
  }, [appKey, environment, filterKey, page, pageSize, subType, timeRange])

  useEffect(() => {
    if (!selectedGroupId) return undefined

    const controller = new AbortController()

    const loadDetail = async () => {
      setDetailLoading(true)
      setDetailError('')

      try {
        const result = await getErrorGroupEvents(
          selectedGroupId,
          { page: detailPage, pageSize: detailPageSize },
          { signal: controller.signal }
        )

        setDetail(result)
        setSelectedEventId(currentId => {
          const stillExists = result.items.some(item => item.eventId === currentId)
          return stillExists ? currentId : (result.items[0]?.eventId || '')
        })
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setDetailError(requestError.message)
        }
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false)
        }
      }
    }

    loadDetail()
    return () => controller.abort()
  }, [detailPage, detailPageSize, selectedGroupId])

  const openDetail = groupId => {
    setSelectedGroupId(groupId)
    setDetailPage(1)
    setSelectedEventId('')
    setDetail(null)
    setDetailError('')
  }

  const closeDetail = () => {
    setSelectedGroupId(null)
    setDetail(null)
    setDetailError('')
    setSelectedEventId('')
  }

  const columns = useMemo(() => [
    ...baseColumns,
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, record) => (
        <Button type="link" onClick={() => openDetail(record._id)}>
          查看详情
        </Button>
      )
    }
  ], [])

  const selectedEvent = detail?.items.find(
    item => item.eventId === selectedEventId
  ) || detail?.items[0] || null

  const breadcrumbItems = (selectedEvent?.breadcrumbs || []).map((breadcrumb, index) => ({
    key: `${breadcrumb.timestamp || 'breadcrumb'}-${index}`,
    color: breadcrumb.type === 'fetch' || breadcrumb.type === 'xhr'
      ? (breadcrumb.success === false ? 'red' : 'blue')
      : 'gray',
    content: (
      <div>
        <Typography.Text strong>{describeBreadcrumb(breadcrumb)}</Typography.Text>
        <br />
        <Typography.Text type="secondary">
          {formatTimestamp(breadcrumb.timestamp)}
        </Typography.Text>
      </div>
    )
  }))

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
        <Typography.Title level={2}>错误监控</Typography.Title>
        <Typography.Paragraph className="page-description">
          错误列表按指纹聚合，同一行代表一类错误；点击详情后可继续查看具体事件现场。
        </Typography.Paragraph>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="错误列表加载失败"
          description={error}
        />
      )}

      <Card variant="borderless">
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Text type="secondary">错误类型</Typography.Text>
            <Select
              aria-label="选择错误类型"
              value={subType}
              options={ERROR_TYPE_OPTIONS}
              onChange={setSubType}
              style={{ width: 160 }}
            />
          </Space>

          <Table
            rowKey="_id"
            columns={columns}
            dataSource={items}
            loading={loading}
            onChange={handleTableChange}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50],
              showTotal: value => `共 ${value} 个错误组`
            }}
            locale={{ emptyText: '当前筛选范围内没有错误组' }}
            scroll={{ x: 1150 }}
          />
        </Space>
      </Card>

      <Drawer
        title="错误详情"
        size="large"
        open={Boolean(selectedGroupId)}
        onClose={closeDetail}
        destroyOnHidden
      >
        {detailError && (
          <Alert
            type="error"
            showIcon
            message="错误详情加载失败"
            description={detailError}
            style={{ marginBottom: 16 }}
          />
        )}

        <Spin spinning={detailLoading}>
          {detail?.group ? (
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small">
                <Row gutter={[16, 16]}>
                  <Col xs={12} md={6}>
                    <Statistic
                      title="实际发生"
                      value={detail.group.occurrenceCount || 0}
                      suffix="次"
                    />
                  </Col>
                  <Col xs={12} md={6}>
                    <Statistic
                      title="事件记录"
                      value={detail.pagination.total || 0}
                      suffix="条"
                    />
                  </Col>
                  <Col xs={24} md={12}>
                    <Typography.Text type="secondary">错误类型</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      <Tag color={ERROR_TYPE_COLORS[detail.group.subType] || 'default'}>
                        {ERROR_TYPE_LABELS[detail.group.subType] || detail.group.subType}
                      </Tag>
                    </div>
                  </Col>
                </Row>

                <Divider />
                <Descriptions
                  size="small"
                  column={1}
                  items={[
                    { key: 'message', label: '错误消息', children: detail.group.message || '--' },
                    { key: 'fingerprint', label: '错误指纹', children: detail.group.fingerprint || '--' },
                    { key: 'first', label: '首次发生', children: formatTimestamp(detail.group.firstSeenAt) },
                    { key: 'last', label: '最近发生', children: formatTimestamp(detail.group.lastSeenAt) },
                    { key: 'page', label: '最近页面', children: detail.group.latestPageUrl || '--' }
                  ]}
                />
              </Card>

              <Card size="small" title="选择错误事件">
                {detail.items.length > 0 ? (
                  <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    <Select
                      aria-label="选择错误事件"
                      value={selectedEventId}
                      onChange={setSelectedEventId}
                      options={detail.items.map(item => ({
                        value: item.eventId,
                        label: `${formatTimestamp(item.timestamp)} · ${item.sessionId || '无会话ID'}`
                      }))}
                      style={{ width: '100%' }}
                    />
                    <Pagination
                      size="small"
                      current={detailPage}
                      pageSize={detailPageSize}
                      total={detail.pagination.total}
                      showSizeChanger
                      pageSizeOptions={[10, 20, 50]}
                      showTotal={value => `共 ${value} 条事件记录`}
                      onChange={(nextPage, nextPageSize) => {
                        if (nextPageSize !== detailPageSize) {
                          setDetailPageSize(nextPageSize)
                          setDetailPage(1)
                          return
                        }
                        setDetailPage(nextPage)
                      }}
                    />
                  </Space>
                ) : (
                  <Empty description="该错误组暂无原始事件记录" />
                )}
              </Card>

              {selectedEvent && (
                <>
                  <Card size="small" title="本次事件现场">
                    <Descriptions
                      size="small"
                      column={1}
                      items={[
                        { key: 'eventId', label: 'Event ID', children: selectedEvent.eventId },
                        { key: 'time', label: '发生时间', children: formatTimestamp(selectedEvent.timestamp) },
                        { key: 'session', label: 'Session ID', children: selectedEvent.sessionId || '--' },
                        { key: 'user', label: 'User ID', children: selectedEvent.userId || '--' },
                        { key: 'release', label: '业务版本', children: selectedEvent.release || '--' },
                        { key: 'url', label: '页面地址', children: selectedEvent.pageUrl || '--' },
                        { key: 'message', label: '错误消息', children: selectedEvent.data?.message || '--' },
                        { key: 'resource', label: '资源地址', children: selectedEvent.data?.resourceUrl || '--' }
                      ]}
                    />
                  </Card>

                  <SourceMapPanel event={selectedEvent} />
                  <StackBlock title="浏览器原始JavaScript堆栈" value={selectedEvent.data?.stack} />
                  <StackBlock title="React组件堆栈" value={selectedEvent.data?.componentStack} />

                  <Card size="small" title="运行环境">
                    <Descriptions
                      size="small"
                      column={1}
                      items={[
                        { key: 'agent', label: 'User Agent', children: selectedEvent.runtime?.userAgent || '--' },
                        { key: 'language', label: '语言', children: selectedEvent.runtime?.language || '--' },
                        { key: 'timezone', label: '时区', children: selectedEvent.runtime?.timezone || '--' },
                        {
                          key: 'screen',
                          label: '屏幕尺寸',
                          children: `${selectedEvent.runtime?.screenWidth || '--'} × ${selectedEvent.runtime?.screenHeight || '--'}`
                        },
                        {
                          key: 'viewport',
                          label: '视口尺寸',
                          children: `${selectedEvent.runtime?.viewportWidth || '--'} × ${selectedEvent.runtime?.viewportHeight || '--'}`
                        },
                        { key: 'referrer', label: '来源页面', children: selectedEvent.runtime?.referrer || '--' }
                      ]}
                    />
                  </Card>

                  <Card size="small" title={`错误前面包屑（${breadcrumbItems.length}条）`}>
                    {breadcrumbItems.length > 0 ? (
                      <Timeline items={breadcrumbItems} />
                    ) : (
                      <Empty description="本次事件没有记录面包屑" />
                    )}
                  </Card>
                </>
              )}
            </Space>
          ) : (
            !detailLoading && !detailError && <Empty description="请选择一个错误组" />
          )}
        </Spin>
      </Drawer>
    </Space>
  )
}

export default ErrorsPage
