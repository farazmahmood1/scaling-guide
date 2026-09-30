import { IntegrationStatus } from '@/components/integration-status';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Headline figures the platform will report. They stay empty on purpose until the sync and
 * reconciliation jobs exist: a dashboard that shows invented numbers is worse than an empty one.
 */
const TILES = [
  { label: 'Delivered revenue', hint: 'Cash collected on delivered parcels' },
  { label: 'Net profit', hint: 'After product cost, PostEx charges and expenses' },
  { label: 'Return rate', hint: 'Returned ÷ parcels with a final outcome' },
  { label: 'Cash with PostEx', hint: 'Delivered but not yet paid out' },
] as const;

export function OverviewPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Orders, returns, stock and profit across both brands, joined from Shopify and PostEx.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <Card key={tile.label}>
            <CardHeader className="pb-2">
              <CardDescription>{tile.label}</CardDescription>
              <CardTitle className="text-2xl text-muted-foreground/50">—</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{tile.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <IntegrationStatus />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Next to build</CardTitle>
            <CardDescription>In order</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm text-muted-foreground">
              <li>1. Database schema: orders, shipments, stock, money</li>
              <li>2. PostEx sync: parcels, returns and charges</li>
              <li>3. Shopify sync: webhooks and the catch-up poll</li>
              <li>4. Reconciliation: order ↔ parcel ↔ cash</li>
              <li>5. These tiles, filled with real figures</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
