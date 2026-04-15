'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";
import { isPersonalDiamondEnabled } from "@/lib/features";

import {
  LayoutDashboard,
  Stethoscope,
  MessageCircle,
  PawPrint,
  FileText,
  Bot,
  HelpCircle,
  Settings,
  History,
  Gem,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  CalendarDays,
  Briefcase,
  MessageSquare,
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState("");
  const [navigationHint, setNavigationHint] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar_collapsed") === "1";
  });
  const expandedWidth = 260;
  const collapsedWidth = 86;
  const diamondEnabled = isPersonalDiamondEnabled();
  const [hrRunning, setHrRunning] = useState(false);

  const loadHrStatus = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setHrRunning(false);
      return;
    }

    try {
      const res = await fetch("/api/debug/system-state", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = (await res.json().catch(() => ({}))) as { work_sessions?: Array<{ ended_at: string | null }> };
      if (!res.ok) {
        setHrRunning(false);
        return;
      }

      const hasOpenSession = Array.isArray(data.work_sessions)
        ? data.work_sessions.some((entry) => entry?.ended_at === null)
        : false;

      setHrRunning(hasOpenSession);
    } catch {
      setHrRunning(false);
    }
  };

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email || "");
    };
    getUser();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHrStatus();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pathname]);

  useEffect(() => {
    const onFocus = () => {
      void loadHrStatus();
    };

    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
    window.dispatchEvent(new CustomEvent("sidebar-collapse-change", { detail: { collapsed: next } }));
  };

  const handleNavGuard = (href: string, event: React.MouseEvent<HTMLAnchorElement>) => {
    if (href !== "/konsultation/last") return;

    const storedLastCaseId = localStorage.getItem("last_consultation_case_id") || localStorage.getItem("current_case_id");
    let snapshotCaseId = "";

    const snapshotRaw = localStorage.getItem("last_consultation_snapshot");
    if (snapshotRaw) {
      try {
        const snapshot = JSON.parse(snapshotRaw);
        if (typeof snapshot?.caseId === "string") {
          snapshotCaseId = snapshot.caseId;
        }
      } catch {
        snapshotCaseId = "";
      }
    }

    if (storedLastCaseId || snapshotCaseId) return;

    event.preventDefault();
    setNavigationHint("Keine letzte Konsultation vorhanden. Bitte starte zuerst eine neue Konsultation.");
  };

  useEffect(() => {
    if (!navigationHint) return;
    const timeout = window.setTimeout(() => setNavigationHint(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [navigationHint]);

  const sections = [
    {
      title: "PLATTFORM",
      links: [
        { name: "Dashboard", href: "/", icon: LayoutDashboard },
        { name: "Konsultation", href: "/konsultation/start", icon: Stethoscope },
        { name: "Letzte Konsultation", href: "/konsultation/last", icon: History },
        { name: "Kommunikation", href: "/kommunikation", icon: MessageCircle },
        { name: "WhatsApp", href: "/kommunikation/whatsapp", icon: MessageSquare },
        { name: "Patienten", href: "/patienten", icon: PawPrint },
        { name: "Termine", href: "/termine", icon: CalendarDays },
        { name: "Vorlagen", href: "/vorlagen", icon: FileText },
        { name: "HR", href: "/hr", icon: Briefcase },
        { name: "VetMind", href: "/vetmind", icon: Bot, highlight: true },
      ],
    },
    {
      title: "HILFE",
      links: [
        { name: "Hilfe", href: "/hilfe", icon: HelpCircle },
      ],
    },
    {
      title: "ARBEITSBEREICH",
      links: [
        { name: "Admin", href: "/admin", icon: Settings },
      ],
    },
  ];

  return (
    <motion.aside
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 10,
        boxSizing: "border-box",
        width: collapsed ? `${collapsedWidth}px` : `${expandedWidth}px`,
        minWidth: collapsed ? `${collapsedWidth}px` : `${expandedWidth}px`,
        maxWidth: collapsed ? `${collapsedWidth}px` : `${expandedWidth}px`,
        height: "100vh",
        overflowY: "auto",
        background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        padding: collapsed ? "20px 10px" : "20px 14px",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "6px 0 24px rgba(2, 6, 23, 0.28)",
        transition: "width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease, padding 0.2s ease",
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: collapsed ? "center" : "space-between" }}>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700 }}>Neuland AI</div>
              <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                Tierärztezentrum
              </div>
              <Link
                href="/hr"
                style={{
                  marginTop: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  color: "#cbd5e1",
                  textDecoration: "none",
                  borderRadius: "999px",
                  border: "1px solid rgba(148, 163, 184, 0.35)",
                  padding: "4px 10px",
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "999px",
                    background: hrRunning ? "#22c55e" : "#94a3b8",
                  }}
                />
                {hrRunning ? "Arbeitszeit läuft" : "Nicht aktiv"}
              </Link>
            </div>
          )}

          <button
            onClick={toggleCollapsed}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {!collapsed && navigationHint ? (
          <div
            style={{
              marginTop: "10px",
              fontSize: "12px",
              color: "#fecaca",
              background: "rgba(127, 29, 29, 0.25)",
              border: "1px solid rgba(248, 113, 113, 0.45)",
              borderRadius: "8px",
              padding: "8px",
            }}
          >
            {navigationHint}
          </div>
        ) : null}
      </div>

      {/* NAV */}
      <div style={{ flex: 1 }}>
        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom: "24px" }}>
            {!collapsed && (
              <div
                style={{
                  fontSize: "11px",
                  color: "#64748b",
                  marginBottom: "10px",
                  fontWeight: 600,
                }}
              >
                {section.title}
              </div>
            )}

            {section.links.map((link, j) => {
              const active = pathname === link.href;
              const Icon = link.icon;

              return (
                <Link
                  key={j}
                  href={link.href}
                  onClick={(event) => handleNavGuard(link.href, event)}
                  title={collapsed ? link.name : ""}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: collapsed ? "center" : "flex-start",
                    gap: collapsed ? "0" : "12px",
                    padding: "12px",
                    borderRadius: "12px",
                    marginBottom: "6px",
                    textDecoration: "none",
                    background: active
                      ? "#0F6B74"
                      : link.highlight
                      ? "rgba(15,107,116,0.15)"
                      : "transparent",
                    color: "#fff",
                    position: "relative",
                  }}
                >
                  {/* ACTIVE INDICATOR */}
                  {active && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "20%",
                        bottom: "20%",
                        width: "3px",
                        background: "#22d3ee",
                        borderRadius: "2px",
                      }}
                    />
                  )}

                  <Icon size={18} />

                  {!collapsed && <span>{link.name}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          paddingTop: "16px",
        }}
      >
        {!collapsed && (
          <>
            <div style={{ fontSize: "12px", color: "#64748b" }}>
              Benutzer
            </div>

            <div style={{ fontSize: "13px", marginBottom: "10px" }}>
              {userEmail}
            </div>
          </>
        )}

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/";
          }}
          style={{
            width: "100%",
            padding: "10px",
            borderRadius: "10px",
            border: "none",
            background: "#1e293b",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <LogOut size={16} />
        </button>
      </div>
    </motion.aside>
  );
}