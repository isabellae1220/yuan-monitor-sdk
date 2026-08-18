import {
  ApiOutlined,
  BugOutlined,
  DashboardOutlined,
  LineChartOutlined
} from '@ant-design/icons'
import { Layout, Menu, Typography } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import GlobalFilters from '../components/GlobalFilters.jsx'

const { Header, Content, Sider } = Layout

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '数据概览' },
  { key: '/errors', icon: <BugOutlined />, label: '错误监控' },
  { key: '/performance', icon: <LineChartOutlined />, label: '性能分析' },
  { key: '/requests', icon: <ApiOutlined />, label: '慢接口' }
]

function DashboardLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Layout className="dashboard-shell">
      <Sider className="dashboard-sider" width={224} breakpoint="lg" collapsedWidth={0}>
        <div className="brand">TraceLens</div>
        <Menu
          theme="dark"
          mode="inline"
          items={menuItems}
          selectedKeys={[location.pathname]}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>

      <Layout className="dashboard-main">
        <Header className="dashboard-header">
          <Typography.Title level={4} style={{ margin: 0 }}>
            前端监控控制台
          </Typography.Title>
          <GlobalFilters />
        </Header>
        <Content className="dashboard-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default DashboardLayout
