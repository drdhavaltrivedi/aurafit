import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';

/** Marks fabricated seed figures in demo mode. */
export function SampleDataBadge() {
  return (
    <div>
      <Badge tone="neutral" outline size="sm">
        <FlaskConical aria-hidden="true" className="icon-inline" /> Sample data
      </Badge>
    </div>
  );
}
