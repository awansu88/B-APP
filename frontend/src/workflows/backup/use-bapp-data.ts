/**
 * React hook: load the authoritative dataset projection for the Statistics /
 * Export / Diagnostics screens and expose the runtime-aware data source.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BappDataset } from '@/src/domain/backup';
import { createDataSource } from './create-data-source';
import type { DataSource, RuntimeKind } from './data-source';

export interface UseBappData {
  readonly dataset: BappDataset | null;
  readonly runtime: RuntimeKind | null;
  readonly canWrite: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly source: DataSource | null;
  reload: () => Promise<void>;
}

export function useBappData(): UseBappData {
  const [dataset, setDataset] = useState<BappDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<DataSource | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!sourceRef.current) sourceRef.current = await createDataSource();
      const data = await sourceRef.current.loadDataset();
      setDataset(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    dataset,
    runtime: sourceRef.current?.runtime ?? null,
    canWrite: sourceRef.current?.canWrite ?? false,
    loading,
    error,
    source: sourceRef.current,
    reload,
  };
}
