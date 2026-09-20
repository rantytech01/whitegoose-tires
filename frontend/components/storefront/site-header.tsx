export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-ink border-b-[3px] border-goose-orange">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
        <span className="font-display font-extrabold text-white text-lg">
          WHITEGOOSE <span className="text-goose-orange">TIRES</span>
        </span>
        <nav className="flex gap-4 text-sm text-neutral-300">
          <a href="/">Home</a>
          <a href="/shop">Shop Tires</a>
        </nav>
        <div className="flex-1" />
        <a href="/cart" className="bg-goose-orange text-ink font-bold text-sm px-4 py-2 rounded">Cart</a>
      </div>
    </header>
  );
}
