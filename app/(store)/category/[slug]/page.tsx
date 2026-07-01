import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProductCatalog } from "@/components/store/product-catalog";
import { ProductGridSkeleton } from "@/components/ui/skeleton";
import { getCategoryBySlug, getCategories } from "@/lib/queries";
import type { Metadata } from "next";

export const revalidate = 60;

export async function generateStaticParams() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return [];
  try {
    const categories = await getCategories();
    return categories.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: category.name,
    description: `Browse ${category.name} products on Aruviah`,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedParams = await searchParams;
  const category = await getCategoryBySlug(slug);

  if (!category) notFound();

  return (
    <div>
      <h1 className="mb-6 font-display text-2xl font-bold">{category.name}</h1>
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductCatalog
          searchParams={resolvedParams}
          categorySlug={slug}
          basePath={`/category/${slug}`}
        />
      </Suspense>
    </div>
  );
}
