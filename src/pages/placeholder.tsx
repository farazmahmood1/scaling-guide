import { Card, CardContent } from '@/components/ui/card';
import { type ModuleKey, moduleByKey } from '@/lib/nav';

/** A module whose screens are not built yet: its title, what it will hold, and nothing invented. */
export function PlaceholderPage({ moduleKey }: { moduleKey: ModuleKey }) {
  const module = moduleByKey(moduleKey);
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{module.label}</h1>
        <p className="text-sm text-muted-foreground">{module.summary}</p>
      </div>
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">These screens are on their way.</CardContent>
      </Card>
    </>
  );
}
