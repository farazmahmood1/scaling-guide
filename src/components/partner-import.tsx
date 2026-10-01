import { useMemo, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import { toast } from 'sonner';

import { ImportReport } from '@/components/import-report';
import { Button } from '@/components/ui/button';
import { type ImportCommitResult, type SheetReport, apiPost } from '@/lib/api';
import { formatPaisa } from '@/lib/format';
import { TEMPLATE_CSV, type LineFilter, commitStance, reportLines } from '@/lib/import-report';
import { downloadText } from '@/lib/csv';

/** The server reads at most this much text, so a larger file is refused here with a clear reason. */
const MAX_CHARS = 900_000;

/**
 * A partner's sales sheet in two phases. Choosing a file runs a dry run, which writes nothing and
 * reports every row; only then can it be committed. A file with problems is never imported by
 * accident: importing just its valid rows is a separate, confirmed choice.
 */
export function PartnerImport({ partnerId, onImported }: { partnerId: string; onImported: () => void }) {
  const [file, setFile] = useState<{ name: string; csv: string }>();
  const [report, setReport] = useState<SheetReport>();
  const [filter, setFilter] = useState<LineFilter>('all');
  const [busy, setBusy] = useState<'checking' | 'importing'>();
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [newVersion, setNewVersion] = useState(false);

  const lines = useMemo(() => (report && file ? reportLines(report, file.csv) : []), [report, file]);
  const stance = report ? commitStance(report) : 'blocked';

  const reset = () => {
    setFile(undefined);
    setReport(undefined);
    setFilter('all');
    setConfirmPartial(false);
    setNewVersion(false);
  };

  const choose = async (picked: File | undefined) => {
    if (!picked) return;
    const csv = await picked.text();
    if (csv.length > MAX_CHARS) {
      toast.error(`${picked.name} is too large (over ${MAX_CHARS.toLocaleString()} characters). Split it into smaller sheets.`);
      return;
    }
    reset();
    setFile({ name: picked.name, csv });
    setBusy('checking');
    try {
      const result = await apiPost<{ report: SheetReport }>('/api/v1/consignment/imports/dry-run', { partnerId, fileName: picked.name, csv });
      setReport(result.report);
      // With problems, start where they are.
      if (result.report.invalid > 0) setFilter('problems');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The dry run failed');
      setFile(undefined);
    } finally {
      setBusy(undefined);
    }
  };

  const commit = async () => {
    if (!file || !report) return;
    setBusy('importing');
    try {
      const result = await apiPost<ImportCommitResult>('/api/v1/consignment/imports', {
        partnerId,
        fileName: file.name,
        csv: file.csv,
        force: report.invalid > 0,
        newVersion: report.alreadyImported !== null && newVersion,
      });
      const total = result.invoices.reduce((n, i) => n + BigInt(i.total), 0n).toString();
      toast.success(`Imported ${result.rowsImported} rows${result.rowsSkipped ? `, skipped ${result.rowsSkipped}` : ''}: ${result.invoices.length} invoice${result.invoices.length === 1 ? '' : 's'}, ${formatPaisa(total)}`);
      reset();
      onImported();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The import failed');
    } finally {
      setBusy(undefined);
    }
  };

  const needsNewVersion = report?.alreadyImported != null && !newVersion;
  const label =
    stance === 'partial' ? `Import the ${report!.valid} valid rows and skip ${report!.invalid}` : stance === 'all' ? `Import ${report!.valid} rows` : 'Nothing to import';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex">
          <input type="file" accept=".csv,text/csv" className="sr-only peer" onChange={(e) => void choose(e.target.files?.[0])} disabled={busy !== undefined} />
          <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-50 hover:bg-muted">
            <FileUp className="size-4" />
            {file ? 'Choose another file' : 'Choose a sales sheet (CSV)'}
          </span>
        </label>
        <Button variant="ghost" size="sm" onClick={() => downloadText('partner-sales-template.csv', TEMPLATE_CSV)}>
          <Download className="size-4" />
          Template
        </Button>
        {file && <span className="font-mono text-xs text-muted-foreground">{file.name}</span>}
      </div>
      <p className="text-xs text-muted-foreground">Columns: date, sku, quantity, unit_price, tax (optional). Nothing is imported until you have seen the report and confirmed.</p>

      {busy === 'checking' && <p className="text-sm text-muted-foreground">Checking every row…</p>}
      {report && (
        <>
          <ImportReport report={report} lines={lines} filter={filter} onFilter={setFilter} />
          <div className="flex flex-wrap items-center gap-3 border-t pt-3">
            {report.alreadyImported && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={newVersion} onChange={(e) => setNewVersion(e.target.checked)} />
                Import again as a new version
              </label>
            )}
            {stance === 'partial' && confirmPartial ? (
              <>
                <Button variant="destructive" disabled={busy !== undefined || needsNewVersion} onClick={commit}>
                  Yes: {label}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmPartial(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                disabled={busy !== undefined || stance === 'blocked' || stance === 'nothing' || needsNewVersion}
                onClick={stance === 'partial' ? () => setConfirmPartial(true) : commit}
              >
                {busy === 'importing' ? 'Importing…' : label}
              </Button>
            )}
            <Button variant="ghost" onClick={reset} disabled={busy !== undefined}>
              Discard
            </Button>
            {stance === 'partial' && !confirmPartial && <p className="text-xs text-muted-foreground">The {report.invalid} rows with problems will not be imported. Fix the file and re-check to include them.</p>}
          </div>
        </>
      )}
    </div>
  );
}
