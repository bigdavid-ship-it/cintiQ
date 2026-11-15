export function calcCommissionKobo(grossKobo: number, percent: number, deliveryFeeKobo = 0) {
  const commissionKobo = Math.round((grossKobo * percent) / 100);
  const sellerProceedsKobo = grossKobo - commissionKobo + deliveryFeeKobo;
  return { grossKobo, commissionKobo, deliveryFeeKobo, sellerProceedsKobo };
}
