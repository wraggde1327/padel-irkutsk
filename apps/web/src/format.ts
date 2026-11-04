export function moneyFromKopecks(kopecks: number): string {
  const rubles = Math.trunc(kopecks / 100);
  return `${rubles.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ₽`;
}

export function statusLabel(status: string, startsAt?: string | null): string {
  if (status === 'REGISTRATION') return `Регистрация${startsAt ? ` · старт ${formatDate(startsAt)}` : ''}`;
  if (status === 'QUALIFICATION') return 'Квалификация';
  if (status === 'DIVISIONS_READY') return 'Дивизионы';
  if (status === 'PLAYOFF') return 'Плей-офф';
  if (status === 'FINALS') return 'Финал';
  if (status === 'DONE') return 'Завершён';
  if (status === 'DRAFT') return 'Черновик';
  if (status === 'CANCELLED') return 'Отменён';
  return status;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Irkutsk',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}
