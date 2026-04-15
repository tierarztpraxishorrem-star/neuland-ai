"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import VacationCalendar from "@/components/hr/VacationCalendar";

type Member = {
  employee_id: string;
  display_name: string;
};

type Absence = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
  absence_type: string;
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

export default function GroupCalendarPage() {
  const params = useParams();
  const groupId = params.groupId as string;

  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWithAuth(
        `/api/hr/vacation/group/${groupId}?year=${year}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Laden.");
      setGroupName(data.group?.name || "Gruppe");
      setMembers(data.members || []);
      setAbsences(data.absences || []);
      setHolidays(data.holidays || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [groupId, year]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📅 {groupName}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            ←
          </button>
          <span className="text-sm font-medium">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            →
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Laden…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-gray-500">
          Keine Mitglieder in dieser Gruppe.
        </p>
      ) : (
        <VacationCalendar
          year={year}
          members={members}
          absences={absences}
          holidays={holidays}
        />
      )}
    </div>
  );
}
