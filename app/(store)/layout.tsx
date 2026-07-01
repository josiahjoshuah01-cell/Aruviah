import { Header } from "@/components/store/header";
import { CategoryRail } from "@/components/store/category-rail";
import { getCategoriesForNav } from "@/lib/queries";
import { Suspense } from "react";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const categories = await getCategoriesForNav();

  return (
    <div className="min-h-screen bg-mist">
      <Header />
      <Suspense fallback={null}>
        <CategoryRail categories={categories} />
      </Suspense>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
