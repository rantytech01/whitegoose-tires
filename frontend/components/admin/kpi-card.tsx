export function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded p-4">
      <p className="text-xs text-graphite font-semibold mb-2">{label}</p>
      <p className="font-display text-2xl">{value}</p>
    </div>
  );
}
