'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { motion } from "framer-motion";

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
  LogOut,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const expandedWidth = 260;
  const collapsedWidth = 86;

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUserEmail(data.user?.email || "");
    };
    getUser();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar_collapsed");
    if (stored === "1") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
      window.dispatchEvent(new CustomEvent("sidebar-collapse-change", { detail: { collapsed: next } }));
      return next;
    });
  };

  const sections = [
    {
      title: "PLATTFORM",
      links: [
        { name: "Dashboard", href: "/", icon: LayoutDashboard },
        { name: "Konsultation", href: "/konsultation/start", icon: Stethoscope },
        { name: "Letzte Konsultation", href: "/konsultation/last", icon: History },
        { name: "Kommunikation", href: "/kommunikation", icon: MessageCircle },
        { name: "Patienten", href: "/patienten", icon: PawPrint },
        { name: "Vorlagen", href: "/vorlagen", icon: FileText },
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