import type { Product } from "@/lib/types";

export function ProductGrid({ products }: { products: Product[] }) {
  if (!products.length) {
    return <p className="text-graphite text-sm">No products loaded — wire this up to GET /products.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-5">
      {products.map((p) => (
        <div key={p.id} className="border rounded overflow-hidden">
          <div className="aspect-[4/3] bg-tarmac" />
          <div className="p-4">
            <p className="text-xs uppercase text-graphite">{p.brand}</p>
            <p className="font-semibold">{p.name}</p>
            <p className="font-display text-xl mt-2">KSh {p.price.toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
