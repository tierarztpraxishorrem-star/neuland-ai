'use client';

import { brand } from '../_brand';

type Props = {
  result: string;
  patientLetter: string;
  copied: boolean;
  isMobile: boolean;
  onCopy: () => void;
  onExtractLetter: () => void;
  onPrintLetter: () => void;
  onShare: () => void;
  onDownload: () => void;
  buttonStyle: (bg: string, color: string, disabled: boolean, bordered?: boolean) => React.CSSProperties;
};

export default function ReportActions({
  result,
  patientLetter,
  copied,
  isMobile,
  onCopy,
  onExtractLetter,
  onPrintLetter,
  onShare,
  onDownload,
  buttonStyle,
}: Props) {
  if (!result) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: '12px',
        marginTop: '16px',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <button onClick={onCopy} style={{ ...buttonStyle(brand.primary, 'white', false), width: isMobile ? '100%' : 'auto' }}>
        Bericht kopieren
      </button>

      <button onClick={onExtractLetter} style={{ ...buttonStyle(brand.primary, 'white', false), width: isMobile ? '100%' : 'auto' }}>
        Patientenbrief erstellen
      </button>

      {patientLetter && (
        <button onClick={onPrintLetter} style={{ ...buttonStyle('#0F6B74', 'white', false), width: isMobile ? '100%' : 'auto' }}>
          Patientenbrief drucken
        </button>
      )}

      <button onClick={onShare} style={{ ...buttonStyle(brand.primary, 'white', false), width: isMobile ? '100%' : 'auto' }}>
        Bericht teilen
      </button>

      <button onClick={onDownload} style={{ ...buttonStyle('#fff', brand.primary, false, true), width: isMobile ? '100%' : 'auto' }}>
        Als Datei speichern
      </button>

      {copied && (
        <span style={{ color: '#1f7a1f', fontSize: '14px' }}>In Zwischenablage kopiert</span>
      )}
    </div>
  );
}
