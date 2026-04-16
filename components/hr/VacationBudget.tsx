import { uiTokens, Card } from "../ui/System";

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
    <Card>
      <div style={{ fontSize: 14, fontWeight: 600, color: uiTokens.textPrimary, marginBottom: 12 }}>Urlaubskontingent</div>
      <div style={{ fontSize: 13, color: uiTokens.textMuted, marginBottom: 8 }}>
        Jahresanspruch: {daysTotal} Tage
        {daysCarry > 0 && <> + {daysCarry} Tage Übertrag</>} = {total} Tage
        gesamt
      </div>

      {/* Progress bar */}
      <div style={{ height: 16, borderRadius: 999, background: "#e5e7eb", overflow: "hidden", marginBottom: 8 }}>
        <div style={{ display: "flex", height: "100%" }}>
          <div style={{ height: "100%", borderRadius: "999px 0 0 999px", background: "#22c55e", width: `${usedPercent}%`, transition: "width 0.3s" }} />
          <div style={{ height: "100%", background: "#fbbf24", width: `${pendingPercent}%`, transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: uiTokens.textSecondary }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
          {daysUsed} genommen
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#fbbf24" }} />
          {daysPending} beantragt
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#e5e7eb" }} />
          {remaining} verfügbar
        </span>
      </div>
    </Card>
  );
}
