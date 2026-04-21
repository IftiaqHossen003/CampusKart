import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function toNumber(value) {
  const number = Number(value);
  return Number.isNaN(number) ? 0 : number;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(toNumber(value));
}

function formatDate(value) {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function RevenueTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-semibold text-slate-700">
        {formatDate(point.date)}
      </p>
      <p className="mt-1 text-xs text-slate-700">
        Revenue: {formatMoney(point.revenue)}
      </p>
      <p className="text-xs text-slate-700">
        Orders: {formatCount(point.orders)}
      </p>
    </div>
  );
}

function VendorRevenueChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
        <XAxis
          dataKey="shortDate"
          interval="preserveStartEnd"
          tick={{ fontSize: 12, fill: "#64748B" }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#64748B" }}
          tickFormatter={(value) => `${Math.round(toNumber(value) / 1000)}k`}
        />
        <Tooltip content={<RevenueTooltip />} />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="#2E86AB"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default VendorRevenueChart;
