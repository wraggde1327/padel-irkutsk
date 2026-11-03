export function kopecksToRubles(kopecks: number): string {
  const rubles = Math.trunc(kopecks / 100);
  return `${rubles.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ₽`;
}

export function prizeFundFromPaid(paidKopecks: number[], organizerShareBp = 3000, divisionSharesBp = [6000, 3000, 1000]) {
  const gross = paidKopecks.reduce((sum, n) => sum + n, 0);
  const organizer = Math.floor((gross * organizerShareBp) / 10000);
  const fund = gross - organizer;
  const perDivision = divisionSharesBp.map((share, i, all) => {
    if (i < all.length - 1) return Math.floor((fund * share) / 10000);
    return fund - all.slice(0, -1).reduce((sum, s) => sum + Math.floor((fund * s) / 10000), 0);
  });
  return { gross, organizer, fund, perDivision };
}
