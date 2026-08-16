import { createBrowserRouter } from 'react-router-dom'
import DashboardLayout from '../layouts/DashboardLayout.jsx'
import ErrorsPage from '../pages/ErrorsPage.jsx'
import OverviewPage from '../pages/OverviewPage.jsx'
import PerformancePage from '../pages/PerformancePage.jsx'
import RequestsPage from '../pages/RequestsPage.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <DashboardLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'errors', element: <ErrorsPage /> },
      { path: 'performance', element: <PerformancePage /> },
      { path: 'requests', element: <RequestsPage /> }
    ]
  }
])

export default router
