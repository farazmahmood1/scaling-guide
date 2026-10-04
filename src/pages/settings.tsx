import { Link, useSearchParams } from 'react-router';

import { useAuth } from '@/auth/auth-context';
import { IntegrationStatus } from '@/components/integration-status';
import { PeriodClose } from '@/components/period-close';
import { AlertsForm, PurchasingForm, TagsForm } from '@/components/settings-forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsersAdmin } from '@/components/users-admin';

const SECTIONS = [
  { key: 'connections', label: 'Connections' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'purchasing', label: 'Purchasing' },
  { key: 'tags', label: 'Order tags' },
  { key: 'close', label: 'Month close' },
  { key: 'users', label: 'Users and roles' },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];
const isSection = (v: string | null): v is SectionKey => SECTIONS.some((s) => s.key === v);

/**
 * Settings, one section at a time (the section is in the address, so a link can point at one).
 * Every change is validated before it is offered for saving, saved with the signed-in user's name,
 * and audited by the server. Which prefixes the team types on parcels is under Reconciliation,
 * beside the match rates it affects.
 */
export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  // Managing users is the owner's alone; a manager sees every other section but not this one.
  const sections = SECTIONS.filter((s) => s.key !== 'users' || can('users.manage'));
  const asked = params.get('section');
  const section: SectionKey = isSection(asked) && sections.some((s) => s.key === asked) ? asked : 'connections';

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Connections, when alerts are raised, reorder levels, and month close. Parcel matching prefixes are in{' '}
          <Link className="underline underline-offset-2" to="/reconciliation">
            Reconciliation
          </Link>
          .
        </p>
      </div>
      <Tabs
        value={section}
        onValueChange={(v) =>
          setParams((p) => {
            if (v === 'connections') p.delete('section');
            else p.set('section', v);
            return p;
          })
        }
      >
        <TabsList className="h-auto flex-wrap justify-start">
          {sections.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="connections" className="mt-3">
          <IntegrationStatus />
        </TabsContent>
        <TabsContent value="alerts" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Alert thresholds</CardTitle>
              <CardDescription>When the time-based alerts are raised on the reconciliation queue.</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertsForm />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="purchasing" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Purchasing</CardTitle>
              <CardDescription>The reorder levels behind the suggestions, and how closely a vendor's bill must match what was ordered and received.</CardDescription>
            </CardHeader>
            <CardContent>
              <PurchasingForm />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tags" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Shopify order tags</CardTitle>
              <CardDescription>Which tags your team puts on an order mean which confirmation outcome.</CardDescription>
            </CardHeader>
            <CardContent>
              <TagsForm />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="close" className="mt-3">
          <Card>
            <CardHeader>
              <CardTitle>Month close</CardTitle>
              <CardDescription>Closing a month makes it final. Months the books are closed for are marked everywhere they appear.</CardDescription>
            </CardHeader>
            <CardContent>
              <PeriodClose />
            </CardContent>
          </Card>
        </TabsContent>
        {can('users.manage') && (
          <TabsContent value="users" className="mt-3">
            <Card>
              <CardHeader>
                <CardTitle>Users and roles</CardTitle>
                <CardDescription>Who can sign in, what each of them may do, and how their sign-in is protected. A change applies to their next request.</CardDescription>
              </CardHeader>
              <CardContent>
                <UsersAdmin />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
