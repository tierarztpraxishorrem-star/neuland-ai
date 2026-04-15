"use client";

import { useMemo, useState } from "react";
import { getDaysInYear, formatDateKey, isWeekend } from "@/lib/hr/workdays";

type Absence = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
  absence_type: string;
};

type Member = {
  employee_id: string;
  display_name: string;
};

type VacationCalendarProps = {
  year: number;
  members: Member[];
  absences: Absence[];
  holidays: string[];
};

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-500",
  pending: "bg-amber-400",
  rejected: "bg-red-300",
};

const TYPE_LABELS: Record<string, string> = {
  vacation: "Urlaub",
  sick: "Krank",
  special: "Sonderurlaub",
  overtime: "Überstundenabbau",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

export default function VacationCalendar({
  year,
  members,
  absences,
  holidays,
}: VacationCalendarProps) {
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const days = useMemo(() => getDaysInYear(year), [year]);
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  // Build lookup: employee_id -> dateKey -> absence
  const absenceMap = useMemo(() => {
    const map: Record<string, Record<string, Absence>> = {};
    for (const a of absences) {
      const start = new Date(a.start_date + "T00:00:00");
      const end = new Date(a.end_date + "T00:00:00");
      const cur = new Date(start);
      while (cur <= end) {
        const key = formatDateKey(cur);
        if (!map[a.employee_id]) map[a.employee_id] = {};
        map[a.employee_id][key] = a;
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [absences]);

  // Coverage: how many members are absent on each day
  const coverage = useMemo(() => {
    const cov: Record<string, number> = {};
    for (const d of days) {
      const key = formatDateKey(d);
      if (isWeekend(d) || holidaySet.has(key)) continue;
      let absentCount = 0;
      for (const m of members) {
        const a = absenceMap[m.employee_id]?.[key];
        if (a && a.status !== "rejected") absentCount++;
      }
      cov[key] =
        members.length > 0
          ? Math.round(
              ((members.length - absentCount) / members.length) * 100
            )
          : 100;
    }
    return cov;
  }, [days, members, absenceMap, holidaySet]);

  // Months header positions
  const monthPositions = useMemo(() => {
    const pos: { month: string; startIdx: number; count: number }[] = [];
    let currentMonth = -1;
    for (let i = 0; i < days.length; i++) {
      const m = days[i].getMonth();
      if (m !== currentMonth) {
        pos.push({ month: MONTHS[m], startIdx: i, count: 1 });
        currentMonth = m;
      } else {
        pos[pos.length - 1].count++;
      }
    }
    return pos;
  }, [days]);

  const cellSize = 12;
  const gap = 1;
  const totalW = days.length * (cellSize + gap);
  const nameColW = 140;
  const headerH = 20;
  const rowH = cellSize + gap + 2;

  function handleCellHover(
    e: React.MouseEvent,
    member: Member,
    day: Date,
    absence?: Absence
  ) {
    const dateStr = day.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const key = formatDateKey(day);
    let text = `${member.display_name} – ${dateStr}`;
    if (holidaySet.has(key)) text += " (Feiertag)";
    else if (isWeekend(day)) text += " (Wochenende)";
    else if (absence) {
      const typeLabel = TYPE_LABELS[absence.absence_type] || absence.absence_type;
      const statusLabel =
        absence.status === "approved"
          ? "genehmigt"
          : absence.status === "pending"
            ? "beantragt"
            : absence.status;
      text += ` – ${typeLabel} (${statusLabel})`;
    }
    setTooltip({ x: e.clientX, y: e.clientY, text });
  }

  return (
    <div className="relative overflow-x-auto rounded-lg border border-black/10 bg-white">
      <div
        style={{ minWidth: nameColW + totalW + 20 }}
        className="relative p-3"
      >
        {/* Month headers */}
        <div className="flex" style={{ paddingLeft: nameColW }}>
          {monthPositions.map((mp) => (
            <div
              key={mp.month}
              className="text-xs font-medium text-gray-500"
              style={{ width: mp.count * (cellSize + gap) }}
            >
              {mp.month}
            </div>
          ))}
        </div>

        {/* Member rows */}
        {members.map((member) => (
          <div
            key={member.employee_id}
            className="flex items-center"
            style={{ height: rowH }}
          >
            <div
              className="shrink-0 truncate text-xs"
              style={{ width: nameColW }}
              title={member.display_name}
            >
              {member.display_name}
            </div>
            <div className="flex gap-px">
              {days.map((day, i) => {
                const key = formatDateKey(day);
                const absence = absenceMap[member.employee_id]?.[key];
                const weekend = isWeekend(day);
                const holiday = holidaySet.has(key);

                let color = "bg-gray-100";
                if (weekend || holiday) color = "bg-gray-200";
                else if (absence && absence.status !== "rejected") {
                  color = STATUS_COLORS[absence.status] || "bg-gray-300";
                }

                return (
                  <div
                    key={i}
                    className={`${color} rounded-sm`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      minWidth: cellSize,
                    }}
                    onMouseEnter={(e) =>
                      handleCellHover(e, member, day, absence)
                    }
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Coverage row */}
        <div className="mt-1 flex items-center" style={{ height: rowH }}>
          <div
            className="shrink-0 truncate text-xs font-medium text-gray-600"
            style={{ width: nameColW }}
          >
            Besetzung
          </div>
          <div className="flex gap-px">
            {days.map((day, i) => {
              const key = formatDateKey(day);
              const weekend = isWeekend(day);
              const holiday = holidaySet.has(key);
              const cov = coverage[key];

              let color = "bg-gray-200";
              if (!weekend && !holiday && cov !== undefined) {
                if (cov >= 75) color = "bg-green-300";
                else if (cov >= 50) color = "bg-amber-300";
                else color = "bg-red-300";
              }

              return (
                <div
                  key={i}
                  className={`${color} rounded-sm`}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    minWidth: cellSize,
                  }}
                  onMouseEnter={(e) => {
                    if (!weekend && !holiday && cov !== undefined) {
                      setTooltip({
                        x: e.clientX,
                        y: e.clientY,
                        text: `${day.toLocaleDateString("de-DE")} – ${cov}% besetzt`,
                      });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-gray-500">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />
            Genehmigt
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />
            Beantragt
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-200" />
            Wochenende / Feiertag
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-300" />
            ≥75% besetzt
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-300" />
            50–74%
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-300" />
            &lt;50%
          </span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-md"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
