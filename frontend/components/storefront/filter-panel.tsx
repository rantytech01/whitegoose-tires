export function FilterPanel() {
  return (
    <aside className="border rounded p-4 h-fit sticky top-20">
      <div className="mb-5">
        <h4 className="text-xs font-bold uppercase text-graphite mb-2">Condition</h4>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" /> New</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" /> Used</label>
      </div>
      <div>
        <h4 className="text-xs font-bold uppercase text-graphite mb-2">Brand</h4>
        {["Michelin", "Bridgestone", "Goodyear", "Dunlop"].map((b) => (
          <label key={b} className="flex items-center gap-2 text-sm"><input type="checkbox" /> {b}</label>
        ))}
      </div>
    </aside>
  );
}
