// Tiny fetch wrapper for the wedding API. Requests go to /api on the site's own
// origin (the dev servers proxy it to the API container), so cookies stay first-party.
import type { ApiErro } from './types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal };

export async function api<T>(path: string, { method = 'GET', body, signal }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'Sem conexão com o servidor. Tente novamente.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data as ApiErro | null)?.erro ?? 'Algo deu errado. Tente novamente.');
  return data as T;
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.';

const brlInteiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brlCentavos = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
// R$ 90 for whole amounts, R$ 249,90 when there are cents.
export const formatBRL = (centavos: number) => (centavos % 100 === 0 ? brlInteiro : brlCentavos).format(centavos / 100);
