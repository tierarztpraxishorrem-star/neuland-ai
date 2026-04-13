type AiDisclaimerProps = {
  className?: string;
  showIcon?: boolean;
};

export default function AiDisclaimer({ className, showIcon = true }: AiDisclaimerProps) {
  return (
    <p
      className={className}
      style={{
        marginTop: '12px',
        fontSize: '0.875rem',
        lineHeight: 1.45,
        color: '#6B7280',
        opacity: 0.85,
        whiteSpace: 'normal',
        wordBreak: 'normal'
      }}
    >
      {showIcon ? 'ℹ️ ' : ''}
      KI-gestützt erstellt – bitte fachlich prüfen, kann Fehler enthalten. Die Verantwortung liegt beim Tierarzt.
    </p>
  );
}