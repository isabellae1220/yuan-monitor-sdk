import { Alert, Card, Descriptions, Space, Table, Tag, Typography } from 'antd'

const STATUS_META = {
  resolved: {
    color: 'success',
    label: '全部还原',
    alertType: 'success',
    description: '所有可解析的 JavaScript 堆栈帧都已映射到源码位置。'
  },
  partial: {
    color: 'warning',
    label: '部分还原',
    alertType: 'warning',
    description: '部分堆栈帧已还原；未还原帧仍保留压缩文件位置。'
  },
  map_not_found: {
    color: 'warning',
    label: '未找到 Map',
    alertType: 'warning',
    description: '没有找到与该项目、环境、release 和生成文件匹配的 Source Map。'
  },
  failed: {
    color: 'error',
    label: '解析失败',
    alertType: 'error',
    description: 'Source Map 已匹配，但文件内容无效或解析过程发生异常。'
  },
  missing_release: {
    color: 'default',
    label: '缺少 release',
    alertType: 'info',
    description: '事件没有携带业务 release，服务端无法安全匹配 Source Map。'
  },
  no_frames: {
    color: 'default',
    label: '无可解析帧',
    alertType: 'info',
    description: '原始堆栈中没有识别到可执行 Source Map 映射的 JavaScript 帧。'
  },
  not_processed: {
    color: 'default',
    label: '未进行解析',
    alertType: 'info',
    description: '该事件没有 Source Map 解析记录，可能是在还原功能启用前产生的历史数据。'
  }
}

const formatPosition = position => {
  if (!position?.file && !position?.source) return '--'

  const file = position.source || position.file
  const line = Number.isFinite(Number(position.line)) ? position.line : '--'
  const column = Number.isFinite(Number(position.column)) ? position.column : '--'
  return `${file}:${line}:${column}`
}

const frameColumns = [
  {
    title: '状态',
    dataIndex: 'status',
    width: 100,
    render: status => (
      <Tag color={status === 'resolved' ? 'success' : status === 'failed' ? 'error' : 'warning'}>
        {status === 'resolved' ? '已还原' : status === 'failed' ? '解析失败' : '未找到 Map'}
      </Tag>
    )
  },
  {
    title: '压缩代码位置',
    dataIndex: 'generated',
    width: 280,
    render: generated => (
      <Typography.Text copyable ellipsis={{ tooltip: formatPosition(generated) }}>
        {formatPosition(generated)}
      </Typography.Text>
    )
  },
  {
    title: '源码位置',
    dataIndex: 'original',
    width: 300,
    render: original => original ? (
      <Typography.Text copyable ellipsis={{ tooltip: formatPosition(original) }}>
        {formatPosition(original)}
      </Typography.Text>
    ) : '--'
  },
  {
    title: '源码函数',
    key: 'functionName',
    width: 180,
    render: (_, frame) => frame.original?.functionName || frame.generated?.functionName || '--'
  }
]

function SourceMapPanel({ event }) {
  const stack = event?.data?.stack
  const release = event?.release || ''
  const symbolication = event?.data?.symbolication
  const resolvedFrames = Array.isArray(event?.data?.resolvedStack)
    ? event.data.resolvedStack
    : []

  if (!stack && !release && !symbolication) return null

  const status = symbolication?.status || 'not_processed'
  const statusMeta = STATUS_META[status] || STATUS_META.not_processed
  const frameCount = Number(symbolication?.frameCount) || resolvedFrames.length
  const resolvedCount = Number(symbolication?.resolvedCount) || 0

  return (
    <Card size="small" title="Source Map 源码定位">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Descriptions
          size="small"
          column={1}
          items={[
            {
              key: 'release',
              label: '业务版本',
              children: release || '--'
            },
            {
              key: 'status',
              label: '解析状态',
              children: <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
            },
            {
              key: 'progress',
              label: '还原进度',
              children: frameCount > 0 ? `${resolvedCount} / ${frameCount} 帧` : '--'
            }
          ]}
        />

        <Alert
          showIcon
          type={statusMeta.alertType}
          message={statusMeta.label}
          description={statusMeta.description}
        />

        {resolvedFrames.length > 0 && (
          <Table
            size="small"
            rowKey={(frame, index) => `${frame.generated?.file || 'frame'}-${frame.generated?.line || 0}-${frame.generated?.column || 0}-${index}`}
            columns={frameColumns}
            dataSource={resolvedFrames}
            pagination={false}
            scroll={{ x: 860 }}
          />
        )}
      </Space>
    </Card>
  )
}

export default SourceMapPanel
