const quantityFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

export function formatQuantity(value: number): string {
  return quantityFormatter.format(value);
}

export function formatSignedQuantity(value: number): string {
  return value > 0 ? `+${formatQuantity(value)}` : formatQuantity(value);
}
