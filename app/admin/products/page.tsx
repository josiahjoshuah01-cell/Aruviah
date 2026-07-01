import type { Metadata } from "next";
import { AdminProductsTable } from "@/components/admin/products-table";
import { listAdminProducts } from "@/lib/admin-products";

export const metadata: Metadata = { title: "Products" };

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await listAdminProducts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage live catalog items. Products with order history can only be
          deactivated, not deleted.
        </p>
      </div>
      <AdminProductsTable products={products} />
    </div>
  );
}
