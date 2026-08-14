"use client";

import { IconChartLine } from "@tabler/icons-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "@/lib/format-money";

type TrendItem = { date: string; amountFen: number };

function axisAmount(fen: number): string {
  const yuan = fen / 100;
  if (yuan >= 10_000) return `${Math.round(yuan / 10_000)}万`;
  if (yuan >= 1_000) return `${Math.round(yuan / 1_000)}千`;
  return `${Math.round(yuan)}`;
}

export function PaymentTrendChart({ data }: { data: TrendItem[] }) {
  const hasData = data.some(({ amountFen }) => amountFen > 0);

  if (!hasData) {
    return (
      <div className="grid h-[310px] place-items-center p-6 text-center max-md:h-[250px]">
        <div className="grid justify-items-center">
          <span className="grid size-12 place-items-center rounded-full bg-[#f2f4f7] text-[#667085]">
            <IconChartLine aria-hidden size={23} />
          </span>
          <h3 className="mt-3 text-sm font-semibold">最近 30 天暂无有效收款</h3>
          <p className="mt-1 text-xs leading-5 text-[#667085]">
            登记有效收款后，将按收款日期显示趋势。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label="最近 30 天有效收款金额折线图"
      className="h-[310px] min-w-0 px-2 pt-[18px] pr-[18px] pb-2 max-md:h-[250px] max-md:pr-3"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="#e4e7ec" />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            minTickGap={28}
            tick={{ fontSize: 11, fill: "#667085" }}
            tickFormatter={(value: string) => value.slice(5)}
          />
          <YAxis
            width={48}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#667085" }}
            tickFormatter={axisAmount}
          />
          <Tooltip
            labelFormatter={(label) => `收款日期 ${String(label)}`}
            formatter={(value) => [formatMoney(Number(value)), "收款金额"]}
            contentStyle={{
              border: "1px solid #e4e7ec",
              borderRadius: 8,
              boxShadow: "0 10px 24px rgba(16, 24, 40, 0.1)",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="amountFen"
            name="收款金额"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
