import type { Metadata } from "next";
import { requireAdminUser } from "@/lib/admin-auth";
import {
  listAdminCategories,
  listCategorySections,
} from "@/lib/admin-queries";
import { CategoryTable } from "./category-table";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  await requireAdminUser();
  const [categories, knownSections] = await Promise.all([
    listAdminCategories(),
    listCategorySections(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign section labels for the storefront mega-menu. Categories remain
          flat — sections are display grouping only.
        </p>
      </div>
      <CategoryTable categories={categories} knownSections={knownSections} />
    </div>
  );
}
