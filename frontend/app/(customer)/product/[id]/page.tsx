// Product detail: gallery, price, stock, spec table, add-to-cart.
export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  // const product = await apiFetch<Product>(`/products/${params.id}`);
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 gap-12">
      <div className="aspect-square bg-tarmac rounded" />
      <div>{/* brand, name, size, price, stock badge, qty stepper, add-to-cart, spec table */}</div>
    </div>
  );
}
