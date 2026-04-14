'use client';

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import Sidebar from "./Sidebar";
import ToastHost from "./ToastHost";

export default function SidebarWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };

    checkUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const readState = () => {
      const stored = localStorage.getItem("sidebar_collapsed");
      setSidebarCollapsed(stored === "1");
    };

    const onSidebarChange = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed?: boolean }>).detail;
      if (typeof detail?.collapsed === "boolean") {
        setSidebarCollapsed(detail.collapsed);
      } else {
        readState();
      }
    };

    readState();
    window.addEventListener("storage", readState);
    window.addEventListener("sidebar-collapse-change", onSidebarChange as EventListener);

    return () => {
      window.removeEventListener("storage", readState);
      window.removeEventListener("sidebar-collapse-change", onSidebarChange as EventListener);
    };
  }, []);

  if (loading) return null;

  const sidebarWidth = sidebarCollapsed ? 86 : 260;

  return (
    <>
      {user && <Sidebar />}
      <ToastHost />
      <main
        style={{
          display: "block",
          padding: "20px",
          marginLeft: user ? `${sidebarWidth}px` : 0,
          width: user ? `calc(100% - ${sidebarWidth}px)` : "100%",
          boxSizing: "border-box",
          minHeight: "100vh",
          overflowY: "auto",
          overflowX: "hidden",
          transition: "margin-left 0.2s ease, width 0.2s ease"
        }}
      >
        {children}
      </main>
    </>
  );
}