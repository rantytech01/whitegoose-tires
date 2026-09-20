const CATEGORIES = [
  { name: "New Tires", note: "Full manufacturer warranty" },
  { name: "Used Tires", note: "Inspected, graded, guaranteed" },
  { name: "Rims", note: "Alloy & steel, all fitments" },
  { name: "Accessories", note: "Valves, balancing, more" },
];

export function CategoryGrid() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-4 gap-4">
      {CATEGORIES.map((c) => (
        <div key={c.name} className="bg-ink text-white p-5 rounded border-b-[3px] border-goose-orange">
          <h3 className="font-display text-xl uppercase">{c.name}</h3>
          <p className="text-neutral-400 text-xs mt-1">{c.note}</p>
        </div>
      ))}
    </section>
  );
}
