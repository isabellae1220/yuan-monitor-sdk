import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer
])

const DAY_IN_MS = 24 * 60 * 60 * 1000

const formatBucket = (timestamp, bucketSize) => {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  if (bucketSize < DAY_IN_MS) {
    const hour = String(date.getHours()).padStart(2, '0')
    return `${month}-${day} ${hour}:00`
  }
  return `${month}-${day}`
}

const formatValue = (value, metric) => {
  if (!Number.isFinite(value)) return '--'
  return metric === 'CLS' ? value.toFixed(3) : `${Math.round(value)} ms`
}

function PerformanceTrendChart({ metric, points, bucketSize, loading }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return undefined

    const chart = echarts.init(containerRef.current)
    const resizeObserver = new ResizeObserver(() => chart.resize())
    resizeObserver.observe(containerRef.current)
    chartRef.current = chart

    return () => {
      resizeObserver.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (loading) chart.showLoading('default', { text: '加载趋势数据...' })
    else chart.hideLoading()

    chart.setOption({
      color: ['#1677ff', '#52c41a', '#fa8c16'],
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          const title = params[0]?.axisValueLabel || ''
          const lines = params.map(item => (
            `${item.marker}${item.seriesName}：${formatValue(item.value, metric)}`
          ))
          return [title, ...lines].join('<br/>')
        }
      },
      legend: { data: ['平均值', 'P75', 'P95'], top: 0 },
      grid: { left: 56, right: 24, top: 48, bottom: 44 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map(point => formatBucket(point.timestamp, bucketSize)),
        axisLabel: { hideOverlap: true }
      },
      yAxis: {
        type: 'value',
        name: metric === 'CLS' ? '分数' : '毫秒',
        min: 0
      },
      series: [
        {
          name: '平均值',
          type: 'line',
          smooth: true,
          connectNulls: false,
          data: points.map(point => point.average)
        },
        {
          name: 'P75',
          type: 'line',
          smooth: true,
          connectNulls: false,
          data: points.map(point => point.p75)
        },
        {
          name: 'P95',
          type: 'line',
          smooth: true,
          connectNulls: false,
          data: points.map(point => point.p95)
        }
      ]
    }, { notMerge: true })
  }, [bucketSize, loading, metric, points])

  return <div ref={containerRef} className="performance-trend-chart" />
}

export default PerformanceTrendChart
