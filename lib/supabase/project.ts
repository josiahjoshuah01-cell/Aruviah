/** Aruviah Supabase project — single source of truth for agents and scripts. */
export const ARUVIAH_SUPABASE_PROJECT_REF = "jlbrfsnvzmzcrfaigseb";

export const FORBIDDEN_SUPABASE_PROJECT_REFS = [
  "bdzbfocqfnldkranofny", // lunesalove.com — different app, never touch
] as const;

export function assertAruviahProjectRef(projectId: string): void {
  const ref = projectId.trim();
  if (ref !== ARUVIAH_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Refusing Supabase operation on project "${ref}". Aruviah only: ${ARUVIAH_SUPABASE_PROJECT_REF}.`
    );
  }
  if (
    FORBIDDEN_SUPABASE_PROJECT_REFS.includes(
      ref as (typeof FORBIDDEN_SUPABASE_PROJECT_REFS)[number]
    )
  ) {
    throw new Error(`Refusing operation on forbidden project "${ref}".`);
  }
}
