import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <p className="text-sm font-medium text-brand-coral">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">There is no page at this address. It may have moved.</p>
      <Button className="mt-6" asChild>
        <Link to="/">Back to the overview</Link>
      </Button>
    </div>
  );
}
