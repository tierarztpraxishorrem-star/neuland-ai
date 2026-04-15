"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type OnboardingTask = {
  id: string;
  title: string;
  done: boolean;
  due_on?: string | null;
};

async function fetchWithAuth(url: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Nicht angemeldet.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function OnboardingPage() {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth("/api/hr/onboarding");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleToggle(task: OnboardingTask) {
    setToggling(task.id);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/hr/onboarding/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !task.done }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Aktualisieren.");
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setToggling(null);
    }
  }

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.done).length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="mx-auto max-w-[800px] space-y-6 p-4">
      <h1 className="text-2xl font-bold">Onboarding</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Laden…</p>
      ) : totalTasks === 0 ? (
        <div className="rounded-lg border border-black/10 bg-white p-4">
          <p className="text-sm text-gray-500">
            Keine Onboarding-Aufgaben vorhanden.
          </p>
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Fortschritt</span>
              <span className="text-gray-600">
                {doneTasks} von {totalTasks} erledigt ({progress}%)
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Task list */}
          <div className="rounded-lg border border-black/10 bg-white p-4">
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 rounded-md border p-3 ${
                    task.done
                      ? "border-gray-100 bg-gray-50 opacity-60"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <button
                    onClick={() => handleToggle(task)}
                    disabled={toggling === task.id}
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                      task.done
                        ? "border-green-500 bg-green-500 text-white"
                        : "border-gray-300 hover:border-blue-400"
                    }`}
                  >
                    {task.done && (
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1">
                    <span
                      className={`text-sm ${task.done ? "line-through text-gray-400" : "font-medium"}`}
                    >
                      {task.title}
                    </span>
                    {task.due_on && (
                      <span className="ml-2 text-xs text-gray-400">
                        Fällig: {formatDate(task.due_on)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
