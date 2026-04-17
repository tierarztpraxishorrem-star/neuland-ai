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
  // === Mitarbeiter-Bereich ===
  { href: "/hr", label: "Zeiterfassung", section: "Mein Bereich" },
  { href: "/hr/absences", label: "Abwesenheiten", section: "Mein Bereich" },
  { href: "/hr/overtime", label: "Überstunden", section: "Mein Bereich" },
  { href: "/hr/schedule", label: "Dienstplan", section: "Mein Bereich" },
  { href: "/hr/vacation", label: "Mein Urlaub", section: "Mein Bereich" },
  { href: "/hr/time-corrections", label: "Zeitkorrekturen", section: "Mein Bereich" },
  { href: "/hr/documents", label: "Dokumente", section: "Mein Bereich" },
  { href: "/hr/payslips", label: "Lohnunterlagen", section: "Mein Bereich" },
  { href: "/hr/notifications", label: "Benachrichtigungen", section: "Mein Bereich" },
  { href: "/hr/onboarding", label: "Onboarding", section: "Mein Bereich" },
  { href: "/hr/diamant", label: "Persönlicher Diamant", section: "Mein Bereich" },
  // === Admin: Personal ===
  { href: "/hr/admin", label: "Dashboard", adminOnly: true, section: "Verwaltung" },
  { href: "/hr/admin/employees", label: "Mitarbeiter", adminOnly: true, section: "Verwaltung" },
  { href: "/hr/admin/offboarding", label: "Offboarding", adminOnly: true, section: "Verwaltung" },
  { href: "/hr/admin/qualifications", label: "Qualifikationen", adminOnly: true, section: "Verwaltung" },
  // === Admin: Planung & Genehmigung ===
  { href: "/hr/admin/absences", label: "Abwesenheiten verwalten", adminOnly: true, section: "Planung" },
  { href: "/hr/admin/overtime", label: "Überstunden verwalten", adminOnly: true, section: "Planung" },
  { href: "/hr/admin/time-corrections", label: "Zeitkorrekturen prüfen", adminOnly: true, section: "Planung" },
  { href: "/hr/admin/schedule", label: "Dienstplanung", adminOnly: true, section: "Planung" },
  { href: "/hr/admin/vacation", label: "Urlaubsverwaltung", adminOnly: true, section: "Planung" },
  { href: "/hr/admin/vacation/groups", label: "Urlaubsgruppen", adminOnly: true, section: "Planung" },
  { href: "/hr/admin/payslips", label: "Lohnunterlagen hochladen", adminOnly: true, section: "Planung" },
  // === Admin: System ===
  { href: "/hr/admin/reports", label: "Reports", adminOnly: true, section: "System" },
  { href: "/hr/admin/locations", label: "Standorte", adminOnly: true, section: "System" },
  { href: "/hr/admin/work-models", label: "Arbeitszeitmodelle", adminOnly: true, section: "System" },
  { href: "/hr/admin/import-export", label: "Import / Export", adminOnly: true, section: "System" },
  { href: "/hr/admin/audit-log", label: "Audit-Log", adminOnly: true, section: "System" },
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

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

        if (data && (data.role === "owner" || data.role === "admin" || data.role === "groupleader")) {
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

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const visibleItems = STATIC_NAV.filter(
    (item) => !item.adminOnly || isAdmin
  );

  // Group items by section
  const sections = new Map<string, NavItem[]>();
  for (const item of visibleItems) {
    const s = item.section || "Mein Bereich";
    if (!sections.has(s)) sections.set(s, []);
    sections.get(s)!.push(item);
  }

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  function isActive(href: string) {
    return (
      pathname === href ||
      (href !== "/hr" && pathname.startsWith(href + "/"))
    );
  }

  const linkClass = (href: string) =>
    `block rounded-md px-3 py-1.5 text-sm transition-colors ${
      isActive(href)
        ? "bg-blue-100 font-medium text-blue-800"
        : "text-gray-700 hover:bg-gray-100"
    }`;

  const sidebarContent = (
    <>
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          HR-Modul
        </span>
      </div>
      {loaded && (
        <div className="space-y-2">
          {[...sections.entries()].map(([section, items]) => {
            const isCollapsed = collapsedSections.has(section);
            const hasActiveItem = items.some((item) => isActive(item.href));
            return (
              <div key={section}>
                <button
                  onClick={() => toggleSection(section)}
                  className="mb-0.5 flex w-full items-center justify-between px-3 py-1 text-left"
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${hasActiveItem ? "text-blue-600" : "text-gray-400"}`}>
                    {section}
                  </span>
                  <span className="text-[10px] text-gray-300">
                    {isCollapsed ? "+" : "\u2013"}
                  </span>
                </button>
                {!isCollapsed && (
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
                )}
              </div>
            );
          })}

          {/* Dynamic group calendar links */}
          {groupLinks.length > 0 && (
            <div>
              <div className="mb-0.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Gruppenkalender
              </div>
              <div className="space-y-0.5">
                {groupLinks.map((g) => (
                  <Link
                    key={g.id}
                    href={`/hr/vacation/${g.id}`}
                    className={linkClass(`/hr/vacation/${g.id}`)}
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <nav className="hidden w-56 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3 md:block" style={{ maxHeight: "100vh", position: "sticky", top: 0 }}>
        {sidebarContent}
      </nav>

      {/* Mobile header + hamburger */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 md:hidden">
        <span className="text-sm font-semibold text-gray-600">HR-Modul</span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200"
          aria-label="Menü"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            {mobileOpen ? (
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            ) : (
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile slide-out menu */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <nav className="fixed inset-y-0 left-0 z-50 w-64 overflow-y-auto bg-white p-4 shadow-xl md:hidden">
            {sidebarContent}
          </nav>
        </>
      )}

      {/* Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
