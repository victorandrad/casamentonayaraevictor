import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@nv/shared/api';

// Loads data on mount and exposes it as editable state plus a reload().
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [erro, setErro] = useState('');

  const reload = useCallback(async () => {
    try {
      setData(await load());
      setErro('');
    } catch (error) {
      setErro(errorMessage(error));
    }
    // load is a stable module-level function in every caller
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, erro, setErro, reload };
}
