const NAV = ["Dashboard", "Products", "Inventory", "Orders", "Customers", "Reports", "Branches", "Settings"];

export function AdminSidebar() {
  return (
    <aside className="bg-ink text-white py-5">
      <div className="px-5 pb-5 border-b border-neutral-800 mb-3 font-display font-bold">WHITEGOOSE</div>
      {NAV.map((item, i) => (
        <div key={item} className={`px-5 py-2.5 text-sm ${i === 0 ? "text-white bg-goose-orange/10 border-r-2 border-goose-orange" : "text-neutral-400"}`}>
          {item}
        </div>
      ))}
    </aside>
  );
}
