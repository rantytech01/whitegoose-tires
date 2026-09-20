export function Hero() {
  return (
    <section className="bg-ink text-white">
      <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-2 gap-8 items-center">
        <div>
          <p className="text-goose-orange font-bold text-sm mb-3">NEW &amp; USED TIRES · NAIROBI &amp; BEYOND</p>
          <h1 className="font-display text-6xl uppercase leading-none">
            Drive with<br /><span className="text-goose-orange">Confidence.</span>
          </h1>
          <p className="text-neutral-300 mt-4 max-w-md">
            Genuine Michelin, Bridgestone, Goodyear and Dunlop tires — fitted fast, priced fair.
          </p>
          <a href="/shop" className="inline-block mt-6 bg-goose-orange text-ink font-bold px-6 py-3 rounded">Shop Tires</a>
        </div>
        <div className="aspect-square bg-neutral-900 rounded-full" />
      </div>
    </section>
  );
}
