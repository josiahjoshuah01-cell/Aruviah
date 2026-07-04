import { Header } from "@/components/store/header";
import { Footer } from "@/components/store/footer";
import { CategoryRail } from "@/components/store/category-rail";
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
    <div className="flex min-h-screen flex-col bg-mist">
      <Header isAdmin={session.isAdmin} isLoggedIn={session.isLoggedIn} />
      <Suspense fallback={null}>
        <CategoryRail categories={categories} />
      </Suspense>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">
        {children}
      </main>
      <Footer />
    </div>
  );
}
