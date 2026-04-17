"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type NavItem = {
  href: string;
  label: string;
  icon?: string;
  adminOnly?: boolean;
  section?: string;
};

type GroupLink = { id: string; name: string };

// ──────────────────────────────────────────
// Drastisch reduzierte Navigation:
// - Nur 5 Alltags-Punkte immer sichtbar
// - "Mehr" klappt selten gebrauchte Punkte auf
// - Admin-Bereich standardmäßig eingeklappt
// ──────────────────────────────────────────

const PRIMARY_NAV: NavItem[] = [
  { href: "/hr", label: "Zeiterfassung", icon: "clock" },
  { href: "/hr/absences", label: "Abwesenheiten", icon: "calendar" },
  { href: "/hr/schedule", label: "Dienstplan", icon: "grid" },
  { href: "/hr/overtime", label: "Überstunden", icon: "plus" },
  { href: "/hr/vacation", label: "Urlaub", icon: "sun" },
];

const SECONDARY_NAV: NavItem[] = [
  { href: "/hr/time-corrections", label: "Zeitkorrekturen" },
  { href: "/hr/documents", label: "Dokumente" },
  { href: "/hr/payslips", label: "Lohnunterlagen" },
  { href: "/hr/notifications", label: "Benachrichtigungen" },
  { href: "/hr/onboarding", label: "Onboarding" },
  { href: "/hr/diamant", label: "Persönlichkeitsprofil" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/hr/admin", label: "Dashboard", adminOnly: true },
  { href: "/hr/admin/employees", label: "Mitarbeiter", adminOnly: true },
  { href: "/hr/admin/absences", label: "Anträge", adminOnly: true },
  { href: "/hr/admin/overtime", label: "Überstunden", adminOnly: true },
  { href: "/hr/admin/time-corrections", label: "Korrekturen", adminOnly: true },
  { href: "/hr/admin/schedule", label: "Dienstplanung", adminOnly: true },
  { href: "/hr/admin/vacation", label: "Urlaub", adminOnly: true },
  { href: "/hr/admin/vacation/groups", label: "Gruppen", adminOnly: true },
  { href: "/hr/admin/payslips", label: "Lohnunterlagen", adminOnly: true },
  { href: "/hr/admin/offboarding", label: "Offboarding", adminOnly: true },
  { href: "/hr/admin/qualifications", label: "Qualifikationen", adminOnly: true },
  { href: "/hr/admin/reports", label: "Reports", adminOnly: true },
  { href: "/hr/admin/locations", label: "Standorte", adminOnly: true },
  { href: "/hr/admin/work-models", label: "Zeitmodelle", adminOnly: true },
  { href: "/hr/admin/import-export", label: "Import/Export", adminOnly: true },
  { href: "/hr/admin/audit-log", label: "Audit-Log", adminOnly: true },
];

const ICONS: Record<string, string> = {
  clock: "M12 6v6l4 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  grid: "M4 6h16M4 10h16M4 14h16M4 18h16",
  plus: "M12 4v16m8-8H4",
  sun: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z",
};

function NavIcon({ name }: { name: string }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d={d} />
    </svg>
  );
}

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
  const [showMore, setShowMore] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

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

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Auto-open admin section if user is on an admin page
  useEffect(() => {
    if (pathname.startsWith("/hr/admin")) setAdminOpen(true);
  }, [pathname]);

  // Auto-open "more" if user is on a secondary page
  useEffect(() => {
    if (SECONDARY_NAV.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"))) {
      setShowMore(true);
    }
  }, [pathname]);

  function isActive(href: string) {
    return pathname === href || (href !== "/hr" && pathname.startsWith(href + "/"));
  }

  const linkCls = (href: string, hasIcon?: boolean) =>
    `flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] leading-tight transition-colors ${
      isActive(href)
        ? "bg-[#0f6b74]/10 font-semibold text-[#0f6b74]"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    } ${hasIcon ? "" : "pl-7"}`;

  const sectionHeader = (label: string, open: boolean, toggle: () => void, count?: number) => (
    <button onClick={toggle} className="flex w-full items-center justify-between px-3 py-1.5 text-left group">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 group-hover:text-gray-600">
        {label}
        {count !== undefined && count > 0 && (
          <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
            {count}
          </span>
        )}
      </span>
      <svg width="12" height="12" viewBox="0 0 12 12" className={`text-gray-300 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}>
        <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );

  const sidebar = (
    <div className="flex flex-col gap-1">
      {/* Logo / Title */}
      <div className="mb-2 px-3">
        <div className="text-sm font-bold text-[#0f6b74]">HR</div>
      </div>

      {loaded && (
        <>
          {/* Primary: Always visible, with icons */}
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={linkCls(item.href, true)}>
                {item.icon && <NavIcon name={item.icon} />}
                {item.label}
              </Link>
            ))}
          </div>

          {/* Secondary: Behind "Mehr" toggle */}
          <div className="mt-1 border-t border-gray-200 pt-1">
            {sectionHeader("Mehr", showMore, () => setShowMore(!showMore))}
            {showMore && (
              <div className="space-y-0.5">
                {SECONDARY_NAV.map((item) => (
                  <Link key={item.href} href={item.href} className={linkCls(item.href)}>
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Group calendars */}
          {groupLinks.length > 0 && (
            <div className="border-t border-gray-200 pt-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Kalender
              </div>
              <div className="space-y-0.5">
                {groupLinks.map((g) => (
                  <Link key={g.id} href={`/hr/vacation/${g.id}`} className={linkCls(`/hr/vacation/${g.id}`)}>
                    {g.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Admin section */}
          {isAdmin && (
            <div className="mt-1 border-t border-gray-200 pt-1">
              {sectionHeader("Admin", adminOpen, () => setAdminOpen(!adminOpen))}
              {adminOpen && (
                <div className="space-y-0.5">
                  {ADMIN_NAV.map((item) => (
                    <Link key={item.href} href={item.href} className={linkCls(item.href)}>
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <nav className="hidden w-52 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50/80 p-2 md:block" style={{ maxHeight: "100vh", position: "sticky", top: 0 }}>
        {sidebar}
      </nav>

      {/* Mobile: compact top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 md:hidden">
        <span className="text-sm font-bold text-[#0f6b74]">HR</span>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200" aria-label="Menü">
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
          <nav className="fixed inset-y-0 left-0 z-50 w-60 overflow-y-auto bg-white p-3 shadow-xl md:hidden">
            {sidebar}
          </nav>
        </>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}
