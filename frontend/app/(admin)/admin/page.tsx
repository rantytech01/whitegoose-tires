// Executive dashboard: KPI cards + sales trend + tire-type donut + top sellers.
// Data comes from GET /admin/dashboard/summary and GET /admin/reports/sales.
import { KpiCard } from "@/components/admin/kpi-card";

export default async function AdminDashboardPage() {
  return (
    <>
      <h1 className="font-display text-2xl uppercase mb-6">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard label="Today\u2019s Sales" value="KSh 0" />
        <KpiCard label="Total Orders (30d)" value="0" />
        <KpiCard label="Active Customers" value="0" />
        <KpiCard label="Inventory Value" value="KSh 0" />
      </div>
      {/* sales trend chart, tire-type donut, top sellers table */}
    </>
  );
}
