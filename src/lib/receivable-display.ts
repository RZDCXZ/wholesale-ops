export const paymentMethodValues = [
  "CASH",
  "BANK_TRANSFER",
  "WECHAT",
  "ALIPAY",
  "OTHER",
] as const;

export type PaymentMethodValue = (typeof paymentMethodValues)[number];

export const paymentMethodLabels: Record<PaymentMethodValue, string> = {
  CASH: "现金",
  BANK_TRANSFER: "银行转账",
  WECHAT: "微信",
  ALIPAY: "支付宝",
  OTHER: "其他",
};

export const receivableStatusConfig = {
  PENDING: {
    label: "待收款",
    tone: "border-[#f0c36d] bg-[#fff8e6] text-[#8a5a00]",
  },
  PARTIAL: {
    label: "部分收款",
    tone: "border-[#f0c36d] bg-[#fff8e6] text-[#8a5a00]",
  },
  SETTLED: {
    label: "已结清",
    tone: "border-[#a7d9b6] bg-[#ecfdf3] text-[#027a48]",
  },
} as const;
