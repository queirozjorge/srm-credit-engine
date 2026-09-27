import { rate } from '../../common/http/contracts';
export function addRate(base: string, increment: string): string | null {
  if (!rate.safeParse(base).success || !rate.safeParse(increment).success || !/[1-9]/.test(increment)) return null;
  const units = (value: string) => { const [integer, fraction = ''] = value.split('.'); return BigInt(integer! + fraction.padEnd(12, '0')); };
  const value = (units(base) + units(increment)).toString().padStart(13, '0');
  const result = `${value.slice(0, -12)}.${value.slice(-12)}`.replace(/0+$/, '').replace(/\.$/, '');
  return rate.safeParse(result).success ? result : null;
}
export function exchangeFilters(params: URLSearchParams) {
  const history = params.get('history') === 'quotes' ? 'quotes' as const : 'proposals' as const;
  const status = params.get('status'); const raw = params.get('page') ?? '1'; const page = Number(raw);
  return { history, status: history === 'proposals' && (status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED') ? status : undefined,
    page: /^\d+$/.test(raw) && Number.isSafeInteger(page) && page > 0 ? page : 1,
    size: [5, 10, 20, 50].includes(Number(params.get('size'))) ? Number(params.get('size')) : 20 };
}
