import {
  Bar,
  BarChart,
  CartesianGrid,
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

function AdminRevenueChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
        <XAxis
          dataKey="shortDate"
          interval={4}
          tick={{ fontSize: 12, fill: "#A7A7A7" }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#A7A7A7" }}
          tickFormatter={(value) => `${Math.round(toNumber(value) / 1000)}k`}
        />
        <Tooltip
          formatter={(value) => formatMoney(value)}
          labelFormatter={(label) => `Date: ${label}`}
        />
        <Bar dataKey="revenue" fill="#C8FF2F" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default AdminRevenueChart;
