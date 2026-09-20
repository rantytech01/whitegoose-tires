// Catalog page: search + filter panel (condition, brand, price range) + grid.
// Filters should map directly onto GET /products query params — see
// docs/database-and-api-design.md, section 3, Catalog.
import { ProductGrid } from "@/components/storefront/product-grid";
import { FilterPanel } from "@/components/storefront/filter-panel";

export default async function ShopPage({ searchParams }: { searchParams: Record<string, string> }) {
  // const products = await apiFetch<{ data: Product[] }>(`/products?${new URLSearchParams(searchParams)}`);
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-[220px_1fr] gap-8">
      <FilterPanel />
      <ProductGrid products={[]} />
    </div>
  );
}
