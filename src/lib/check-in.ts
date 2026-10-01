/**
 * Optimistic check-in for the returns register: the row shows the outcome the moment it is
 * chosen, and goes back to waiting if the server refuses. Pure, so the rollback is tested
 * without a browser.
 */
export type Outcome = 'restocked' | 'damaged';

export interface Pending {
  /** shipment id → the outcome shown while the request is out (or after it succeeded, until the list reloads). */
  shown: Record<string, Outcome>;
  inFlight: string[];
}

export const emptyPending = (): Pending => ({ shown: {}, inFlight: [] });

export const start = (p: Pending, shipmentId: string, outcome: Outcome): Pending =>
  p.inFlight.includes(shipmentId) ? p : { shown: { ...p.shown, [shipmentId]: outcome }, inFlight: [...p.inFlight, shipmentId] };

export const succeed = (p: Pending, shipmentId: string): Pending => ({ ...p, inFlight: p.inFlight.filter((id) => id !== shipmentId) });

/** The server said no: the row is waiting again, as if nothing had been clicked. */
export const fail = (p: Pending, shipmentId: string): Pending => {
  const { [shipmentId]: _dropped, ...shown } = p.shown;
  return { shown, inFlight: p.inFlight.filter((id) => id !== shipmentId) };
};

/** A row as the screen shows it: the server's check-in, or the one just chosen. */
export const withPending = <T extends { id: string; checkedIn: Outcome | null }>(rows: readonly T[], p: Pending): T[] =>
  rows.map((r) => (r.checkedIn === null && p.shown[r.id] ? { ...r, checkedIn: p.shown[r.id]! } : r));

/** How many are still waiting, counting the ones just checked in as done. */
export const stillWaiting = (waiting: readonly string[], p: Pending): number => waiting.filter((id) => !p.shown[id]).length;
