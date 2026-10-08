import { AlertCircle, CheckCircle2, MinusCircle, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ListSkeleton, SmallLine } from '@/components/skeletons';
import { useApi } from '@/hooks/use-api';
import type { ConnectionHealth, IntegrationHealth } from '@/lib/api';

function Row({ connection }: { connection: ConnectionHealth }) {
  const { status, message } = connection;
  return (
    <div className="flex items-start justify-between gap-3 border-b py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{connection.label}</p>
        <p className="truncate text-xs text-muted-foreground">{connection.detail}</p>
        {status !== 'ok' && message && <p className="mt-1 text-xs text-brand-coral">{message}</p>}
      </div>
      <Badge variant={status === 'ok' ? 'secondary' : 'outline'} className="shrink-0 gap-1">
        {status === 'ok' && <CheckCircle2 className="size-3" />}
        {status === 'error' && <AlertCircle className="size-3 text-brand-coral" />}
        {status === 'not_configured' && <MinusCircle className="size-3" />}
        {status === 'ok' ? 'Working' : status === 'error' ? 'Not working' : 'Not set up'}
      </Badge>
    </div>
  );
}

export function IntegrationStatus() {
  const { data, error, loading, reload } = useApi<IntegrationHealth>('/api/v1/integrations/health');

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Connections</CardTitle>
          <CardDescription>
            {data ? `Checked ${new Date(data.checkedAt).toLocaleTimeString()}` : 'Both Shopify stores and both PostEx accounts'}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? 'size-4 animate-spin' : 'size-4'} />
          Check again
        </Button>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {loading && (
          <div className="grid gap-6 sm:grid-cols-2">
            {['Shopify', 'PostEx'].map((side) => (
              <div key={side}>
                <div aria-hidden>
                  <SmallLine className="mb-1 w-20" />
                </div>
                <ListSkeleton rows={2} trailing="badge" rowClassName="py-2.5" label={`Checking ${side}`} />
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-brand-coral">
            Cannot reach the backend: {error}. Start it with <code className="font-mono">npm run dev</code> in{' '}
            <code className="font-mono">backend/</code>.
          </p>
        )}

        {data && !loading && (
          <div className="grid gap-6 sm:grid-cols-2">
            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shopify</h3>
              {data.shopify.map((connection) => (
                <Row key={connection.key} connection={connection} />
              ))}
            </section>

            <section>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                PostEx · read-only
              </h3>
              {data.postex.map((connection) => (
                <Row key={connection.key} connection={connection} />
              ))}
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
