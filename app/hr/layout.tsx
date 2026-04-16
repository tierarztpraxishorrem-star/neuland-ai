"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type NavItem = {
  href: string;
  label: string;
  adminOnly?: boolean;
  section?: string;
};

type GroupLink = {
  id: string;
  name: string;
};

const STATIC_NAV: NavItem[] = [
  { href: "/hr", label: "Zeiterfassung", section: "Allgemein" },
  { href: "/hr/absences", label: "Abwesenheiten", section: "Allgemein" },
  { href: "/hr/schedule", label: "Dienstplan", section: "Allgemein" },
  { href: "/hr/documents", label: "Dokumente", section: "Allgemein" },
  { href: "/hr/payslips", label: "Lohnunterlagen", section: "Allgemein" },
  { href: "/hr/onboarding", label: "Onboarding", section: "Allgemein" },
  { href: "/hr/diamant", label: "Persönlicher Diamant", section: "Persönlich" },
  { href: "/hr/vacation", label: "Mein Urlaub", section: "Urlaubsplaner" },
  { href: "/hr/admin", label: "Admin Dashboard", adminOnly: true, section: "Admin" },
  { href: "/hr/admin/absences", label: "Abwesenheiten", adminOnly: true, section: "Admin" },
  { href: "/hr/admin/schedule", label: "Dienstplanung", adminOnly: true, section: "Admin" },
  { href: "/hr/admin/payslips", label: "Lohnunterlagen", adminOnly: true, section: "Admin" },
  { href: "/hr/admin/vacation", label: "Urlaubsverwaltung", adminOnly: true, section: "Admin" },
  { href: "/hr/admin/vacation/groups", label: "Gruppen", adminOnly: true, section: "Admin" },
];

async function fetchWithAuth(url: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { headers });
}

export default function HrLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [groupLinks, setGroupLinks] = useState<GroupLink[]>([]);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/hr/vacation/groups");
      if (!res) return;
      const data = await res.json();
      if (res.ok && data.groups) {
        setGroupLinks(
          data.groups.map((g: { id: string; name: string }) => ({
            id: g.id,
            name: g.name,
          }))
        );
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    async function checkRole() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setLoaded(true);
          return;
        }

        const { createClient } = await import("@supabase/supabase-js");
        const userSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            global: {
              headers: { Authorization: `Bearer ${session.access_token}` },
            },
            auth: { persistSession: false },
          }
        );

        const { data } = await userSupabase
          .from("practice_memberships")
          .select("role")
          .limit(1)
          .maybeSingle();

        if (data && (data.role === "owner" || data.role === "admin")) {
          setIsAdmin(true);
        }
      } catch {
        // Silently fail – default to non-admin
      } finally {
        setLoaded(true);
      }
    }
    checkRole();
    loadGroups();
  }, [loadGroups]);

  const visibleItems = STATIC_NAV.filter(
    (item) => !item.adminOnly || isAdmin
  );

  // Group items by section
  const sections = new Map<string, NavItem[]>();
  for (const item of visibleItems) {
    const s = item.section || "Allgemein";
    if (!sections.has(s)) sections.set(s, []);
    sections.get(s)!.push(item);
  }

  function isActive(href: string) {
    return (
      pathname === href ||
      (href !== "/hr" && pathname.startsWith(href + "/"))
    );
  }

  const linkClass = (href: string) =>
    `block rounded-md px-3 py-2 text-sm transition-colors ${
      isActive(href)
        ? "bg-blue-100 font-medium text-blue-800"
        : "text-gray-700 hover:bg-gray-100"
    }`;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <nav className="hidden w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 p-4 md:block">
        <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
          HR-Modul
        </div>
        {loaded && (
          <div className="space-y-4">
            {[...sections.entries()].map(([section, items]) => (
              <div key={section}>
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  {section}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={linkClass(item.href)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {/* Dynamic group calendar links */}
            {groupLinks.length > 0 && (
              <div>
                <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Gruppenkalender
                </div>
                <div className="space-y-0.5">
                  {groupLinks.map((g) => (
                    <Link
                      key={g.id}
                      href={`/hr/vacation/${g.id}`}
                      className={linkClass(`/hr/vacation/${g.id}`)}
                    >
                      📅 {g.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Mobile tabs */}
      <nav className="flex overflow-x-auto border-b border-gray-200 bg-gray-50 md:hidden">
        {loaded &&
          visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                isActive(item.href)
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {item.label}
            </Link>
          ))}
      </nav>

      {/* Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
