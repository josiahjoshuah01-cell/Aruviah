"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [isFocused, setIsFocused] = useState(false);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) {
        params.set("q", query.trim());
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      router.push(qs ? `/?${qs}` : "/");
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="relative flex-1 max-w-xl"
    >
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search products…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={cn(
          "pl-9 pr-4",
          isPending && "opacity-70"
        )}
        aria-label="Search products"
      />
      {isFocused && (
        <span className="current-underline current-underline--animate" />
      )}
    </form>
  );
}
