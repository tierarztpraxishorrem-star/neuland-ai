"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type NavItem = { href: string; label: string; };
type GroupLink = { id: string; name: string };

// ──────────────────────────────────────────
// Sections als klickbare Überschriften
// Alles zugeklappt, nur aktive Section offen
// ──────────────────────────────────────────

type Section = {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
};

const SECTIONS: Section[] = [
  {
    id: "daily",
    label: "Mein Arbeitsplatz",
    items: [
      { href: "/hr", label: "Zeiterfassung" },
      { href: "/hr/absences", label: "Abwesenheiten" },
      { href: "/hr/schedule", label: "Dienstplan" },
      { href: "/hr/overtime", label: "Überstunden" },
      { href: "/hr/vacation", label: "Urlaub" },
    ],
  },
  {
    id: "personal",
    label: "Meine Unterlagen",
    items: [
      { href: "/hr/profile", label: "Mein Profil" },
      { href: "/hr/documents", label: "Dokumente" },
      { href: "/hr/payslips", label: "Lohnunterlagen" },
      { href: "/hr/time-corrections", label: "Zeitkorrekturen" },
      { href: "/hr/notifications", label: "Benachrichtigungen" },
      { href: "/hr/onboarding", label: "Onboarding" },
      { href: "/hr/diamant", label: "Persönlichkeitsprofil" },
    ],
  },
  {
    id: "admin",
    label: "Verwaltung",
    adminOnly: true,
    items: [
      { href: "/hr/admin", label: "Dashboard" },
      { href: "/hr/admin/employees", label: "Mitarbeiter" },
      { href: "/hr/admin/absences", label: "Anträge prüfen" },
      { href: "/hr/admin/overtime", label: "Überstunden prüfen" },
      { href: "/hr/admin/time-corrections", label: "Korrekturen prüfen" },
      { href: "/hr/admin/schedule", label: "Dienstplanung" },
      { href: "/hr/admin/vacation", label: "Urlaubsverwaltung" },
      { href: "/hr/admin/vacation/groups", label: "Urlaubsgruppen" },
      { href: "/hr/admin/payslips", label: "Lohnunterlagen hochladen" },
      { href: "/hr/admin/onboarding", label: "Onboarding-Vorlagen" },
      { href: "/hr/admin/offboarding", label: "Offboarding" },
      { href: "/hr/admin/qualifications", label: "Qualifikationen" },
    ],
  },
  {
    id: "system",
    label: "Einstellungen",
    adminOnly: true,
    items: [
      { href: "/hr/admin/reports", label: "Reports" },
      { href: "/hr/admin/locations", label: "Standorte" },
      { href: "/hr/admin/work-models", label: "Arbeitszeitmodelle" },
      { href: "/hr/admin/import-export", label: "Import / Export" },
      { href: "/hr/admin/audit-log", label: "Audit-Log" },
    ],
  },
];

async function fetchWithAuth(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } });
}

export default function HrLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [groupLinks, setGroupLinks] = useState<GroupLink[]>([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/api/hr/vacation/groups");
      if (!res) return;
      const data = await res.json();
      if (res.ok && data.groups) {
        setGroupLinks(data.groups.map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    async function checkRole() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setLoaded(true); return; }
        const { createClient } = await import("@supabase/supabase-js");
        const userSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { global: { headers: { Authorization: `Bearer ${session.access_token}` } }, auth: { persistSession: false } }
        );
        const { data } = await userSupabase.from("practice_memberships").select("role").limit(1).maybeSingle();
        if (data && ["owner", "admin", "groupleader"].includes(data.role)) setIsAdmin(true);
      } catch { /* silent */ }
      finally { setLoaded(true); }
    }
    checkRole();
    loadGroups();
  }, [loadGroups]);

  // Auto-open section that contains current page
  useEffect(() => {
    for (const section of SECTIONS) {
      if (section.items.some((item) => pathname === item.href || (item.href !== "/hr" && pathname.startsWith(item.href + "/")))) {
        setOpenSection(section.id);
        return;
      }
    }
  }, [pathname]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function isActive(href: string) {
    return pathname === href || (href !== "/hr" && pathname.startsWith(href + "/"));
  }

  const toggle = (id: string) => {
    setOpenSection((prev) => prev === id ? null : id);
  };

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  const sidebar = (
    <div className="flex flex-col">
      {/* Title */}
      <div className="mb-3 px-4 pt-1">
        <div className="text-[13px] font-bold tracking-wide text-[#0f6b74]">HR-Modul</div>
      </div>

      {loaded && (
        <div className="flex flex-col gap-0.5">
          {visibleSections.map((section) => {
            const isOpen = openSection === section.id;
            const hasActive = section.items.some((item) => isActive(item.href));

            return (
              <div key={section.id}>
                {/* Section header – the clickable "folder" */}
                <button
                  onClick={() => toggle(section.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-left transition-colors ${
                    isOpen
                      ? "bg-[#0f6b74]/8 text-[#0f6b74]"
                      : hasActive
                        ? "text-[#0f6b74]"
                        : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  <span className={`text-[13px] ${isOpen || hasActive ? "font-semibold" : "font-medium"}`}>
                    {section.label}
                  </span>
                  <svg
                    width="14" height="14" viewBox="0 0 14 14"
                    className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
                  >
                    <path d="M4 5.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Section items – slide down */}
                {isOpen && (
                  <div className="ml-2 mt-0.5 space-y-0.5 border-l-2 border-gray-200 pb-1">
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block rounded-md py-1.5 pl-4 pr-3 text-[13px] transition-colors ${
                          isActive(item.href)
                            ? "border-l-2 -ml-[2px] border-[#0f6b74] bg-[#0f6b74]/8 font-semibold text-[#0f6b74]"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Group calendars – compact */}
          {groupLinks.length > 0 && (
            <div className="mt-1 border-t border-gray-200 pt-1">
              <div className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Kalender
              </div>
              {groupLinks.map((g) => (
                <Link
                  key={g.id}
                  href={`/hr/vacation/${g.id}`}
                  className={`block rounded-md py-1.5 pl-6 pr-3 text-[13px] transition-colors ${
                    isActive(`/hr/vacation/${g.id}`)
                      ? "font-semibold text-[#0f6b74]"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  {g.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <nav
        className="hidden w-52 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-2 md:block"
        style={{ maxHeight: "100vh", position: "sticky", top: 0 }}
      >
        {sidebar}
      </nav>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 md:hidden">
        <span className="text-[13px] font-bold text-[#0f6b74]">HR-Modul</span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          aria-label="Menü"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            {mobileOpen
              ? <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              : <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />}
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setMobileOpen(false)} />
          <nav className="fixed inset-y-0 left-0 z-50 w-60 overflow-y-auto bg-white p-2 shadow-xl md:hidden">
            {sidebar}
          </nav>
        </>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}
