import { Card, Typography } from 'antd'

function PagePlaceholder({ title, description }) {
  return (
    <Card className="page-card" bordered={false}>
      <Typography.Title level={2}>{title}</Typography.Title>
      <Typography.Paragraph className="page-description">
        {description}
      </Typography.Paragraph>
    </Card>
  )
}

export default PagePlaceholder
