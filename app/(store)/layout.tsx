import { Header } from "@/components/store/header";
import { Footer } from "@/components/store/footer";
import { CategoryMegaMenu } from "@/components/store/category-mega-menu";
import { getCategoriesForNav } from "@/lib/queries";
import { getSessionInfo } from "@/lib/admin-auth";
import { Suspense } from "react";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, session] = await Promise.all([
    getCategoriesForNav(),
    getSessionInfo(),
  ]);

  return (
    <div className="min-h-screen bg-mist">
      <Header isAdmin={session.isAdmin} isLoggedIn={session.isLoggedIn} />
      <Suspense fallback={null}>
        <CategoryMegaMenu categories={categories} />
      </Suspense>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
      <Footer />
    </div>
  );
}
