import { type ParcelPage, type ParcelRow, apiGet } from '@/lib/api';
import { paisaToInput } from '@/lib/format';
import type { ListQuery } from '@/lib/list-query';
import { STAGE_LABELS, parcelsPath } from '@/lib/postex';

/** The most rows one CSV export pulls; well above the ~1,100 parcels there are today. */
export const EXPORT_CAP = 10_000;
const EXPORT_PAGE = 200;

/** Every row of a view (its filters and sort), a page at a time, for the CSV export. */
export async function fetchAllParcels(query: ListQuery): Promise<ParcelRow[]> {
  const rows: ParcelRow[] = [];
  for (let page = 1; ; page++) {
    const result = await apiGet<ParcelPage>(parcelsPath(query, { page, pageSize: EXPORT_PAGE }));
    rows.push(...result.rows);
    if (result.rows.length === 0 || rows.length >= result.total || rows.length >= EXPORT_CAP) return rows;
  }
}

export const STORE_LABELS = { nur: 'NUR by Juggun', organics: "Juggun's Organics" } as const;
export const storeLabel = (store: ParcelRow['store']): string => (store ? STORE_LABELS[store] : '—');

/** The order a parcel belongs to as people name it: the Shopify number, else the reference on the label. */
export const orderLabel = (row: Pick<ParcelRow, 'orderNumber' | 'orderRef'>): string => row.orderNumber ?? row.orderRef ?? '—';

export const stageText = (stage: ParcelRow['stage']): string => STAGE_LABELS[stage] ?? stage;

/** COD as plain rupees for a spreadsheet; empty when PostEx gave no amount. */
export const codCsv = (paisa: string | null): string => (paisa === null ? '' : paisaToInput(paisa));
