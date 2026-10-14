import { Card, Heading, Button, Icon, type Screen } from '../../App';

export default function AccessDenied({
  title = "Access Restricted",
  message = "You do not have permission to view or manage this administrative section.",
  onGoBack,
}: {
  title?: string;
  message?: string;
  onGoBack: () => void;
}) {
  return (
    <Card className="access-denied-card">
      <span className="state-icon rejected" style={{ margin: "0 auto 12px" }}>
        <Icon name="shield" size={36} />
      </span>
      <Heading level={2}>{title}</Heading>
      <p style={{ color: "var(--muted)", maxWidth: "420px", margin: "4px auto 16px" }}>
        {message}
      </p>
      <Button variant="secondary" onClick={onGoBack}>
        Return to Overview
      </Button>
    </Card>
  );
}
