import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] min-h-screen bg-tarmac">
      <AdminSidebar />
      <div className="p-8">{children}</div>
    </div>
  );
}
