// Homepage — hero, trust strip, category grid, popular products.
// Full interaction reference (filters, cart, admin flows) is in the
// published prototype artifact; this is the Next.js structural port.
import { Hero } from "@/components/storefront/hero";
import { CategoryGrid } from "@/components/storefront/category-grid";
import { ProductGrid } from "@/components/storefront/product-grid";

export default async function HomePage() {
  // const products = await apiFetch<{ data: Product[] }>("/products?limit=6");
  return (
    <>
      <Hero />
      <CategoryGrid />
      <section className="max-w-6xl mx-auto px-6 py-14">
        <h2 className="font-display text-3xl uppercase mb-6">Popular this week</h2>
        <ProductGrid products={[]} />
      </section>
    </>
  );
}
