import type { Category } from "@/lib/types";

export type CategoryNavGroup = {
  section: string;
  categories: Category[];
};

const MORE_SECTION = "More";

/** Group nav categories by admin-assigned section; unassigned → "More" last. */
export function groupCategoriesForNav(
  categories: Category[]
): CategoryNavGroup[] {
  const bySection = new Map<string, Category[]>();
  const sectionOrder: string[] = [];

  for (const cat of categories) {
    const trimmed = cat.section?.trim();
    const key = trimmed || MORE_SECTION;
    if (!bySection.has(key)) {
      bySection.set(key, []);
      if (key !== MORE_SECTION) sectionOrder.push(key);
    }
    bySection.get(key)!.push(cat);
  }

  const groups: CategoryNavGroup[] = sectionOrder.map((section) => ({
    section,
    categories: bySection.get(section)!,
  }));

  const more = bySection.get(MORE_SECTION);
  if (more && more.length > 0) {
    groups.push({ section: MORE_SECTION, categories: more });
  }

  return groups;
}
