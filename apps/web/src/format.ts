export function moneyFromKopecks(kopecks: number): string {
  const rubles = Math.trunc(kopecks / 100);
  return `${rubles.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ₽`;
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
