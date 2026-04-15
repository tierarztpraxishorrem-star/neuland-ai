type VacationBudgetProps = {
  daysTotal: number;
  daysCarry: number;
  daysUsed: number;
  daysPending: number;
};

export default function VacationBudget({
  daysTotal,
  daysCarry,
  daysUsed,
  daysPending,
}: VacationBudgetProps) {
  const total = daysTotal + daysCarry;
  const remaining = total - daysUsed - daysPending;
  const usedPercent = total > 0 ? Math.min((daysUsed / total) * 100, 100) : 0;
  const pendingPercent = total > 0 ? Math.min((daysPending / total) * 100, 100 - usedPercent) : 0;

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <div className="mb-3 text-sm font-semibold">Urlaubskontingent</div>
      <div className="mb-2 text-xs text-gray-500">
        Jahresanspruch: {daysTotal} Tage
        {daysCarry > 0 && <> + {daysCarry} Tage Übertrag</>} = {total} Tage
        gesamt
      </div>

      {/* Progress bar */}
      <div className="mb-2 h-4 overflow-hidden rounded-full bg-gray-200">
        <div className="flex h-full">
          <div
            className="h-full rounded-l-full bg-green-500 transition-all"
            style={{ width: `${usedPercent}%` }}
          />
          <div
            className="h-full bg-amber-400 transition-all"
            style={{ width: `${pendingPercent}%` }}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
          {daysUsed} genommen
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
          {daysPending} beantragt
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-200" />
          {remaining} verfügbar
        </span>
      </div>
    </div>
  );
}
