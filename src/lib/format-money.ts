const renminbiFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

export function formatMoney(fen: number): string {
  return renminbiFormatter.format(fen / 100);
}
