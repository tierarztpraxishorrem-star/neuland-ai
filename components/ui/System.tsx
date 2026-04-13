import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  fullWidth?: boolean;
};

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  fullWidth?: boolean;
  children: ReactNode;
};

type TextAreaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  fullWidth?: boolean;
};

export const uiTokens = {
  pagePadding: '32px',
  sectionGap: '24px',
  cardGap: '14px',
  radiusCard: '16px',
  cardBorder: '1px solid #e5e7eb',
  cardBackground: '#ffffff',
  pageBackground: '#f4f7f8',
  textPrimary: '#1f2937',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  brand: '#0f6b74'
};

export function Card({ children, style, ...props }: { children: ReactNode; style?: CSSProperties } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        borderRadius: uiTokens.radiusCard,
        border: uiTokens.cardBorder,
        background: uiTokens.cardBackground,
        padding: '20px',
        ...style
      }}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  subtitle,
  actions,
  children,
  style
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Card style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: uiTokens.textPrimary }}>{title}</h2>
          {subtitle && (
            <div style={{ marginTop: '4px', fontSize: '13px', color: uiTokens.textSecondary }}>{subtitle}</div>
          )}
        </div>
        {actions}
      </div>
      <div style={{ display: 'grid', gap: uiTokens.cardGap }}>{children}</div>
    </Card>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  style,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const variantStyle: Record<ButtonVariant, CSSProperties> = {
    primary: {
      background: uiTokens.brand,
      color: '#fff',
      border: 'none'
    },
    secondary: {
      background: '#fff',
      color: uiTokens.textPrimary,
      border: uiTokens.cardBorder
    },
    ghost: {
      background: 'transparent',
      color: uiTokens.textSecondary,
      border: 'none'
    }
  };

  const sizeStyle: Record<ButtonSize, CSSProperties> = {
    sm: { padding: '6px 10px', fontSize: '12px', borderRadius: '10px' },
    md: { padding: '9px 12px', fontSize: '14px', borderRadius: '10px' },
    lg: { padding: '11px 14px', fontSize: '15px', borderRadius: '12px' }
  };

  return (
    <button
      {...props}
      style={{
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600,
        opacity: props.disabled ? 0.7 : 1,
        ...variantStyle[variant],
        ...sizeStyle[size],
        ...style
      }}
    >
      {children}
    </button>
  );
}

const baseFieldStyle: CSSProperties = {
  width: '100%',
  borderRadius: '10px',
  border: uiTokens.cardBorder,
  padding: '10px 12px',
  fontSize: '14px',
  background: '#fff'
};

export function Input({ label, fullWidth = true, style, ...props }: InputProps) {
  return (
    <label style={{ display: 'grid', gap: '6px', width: fullWidth ? '100%' : undefined }}>
      {label && <span style={{ fontSize: '12px', color: uiTokens.textSecondary }}>{label}</span>}
      <input {...props} style={{ ...baseFieldStyle, ...style }} />
    </label>
  );
}

export function SelectInput({ label, fullWidth = true, style, children, ...props }: SelectProps) {
  return (
    <label style={{ display: 'grid', gap: '6px', width: fullWidth ? '100%' : undefined }}>
      {label && <span style={{ fontSize: '12px', color: uiTokens.textSecondary }}>{label}</span>}
      <select {...props} style={{ ...baseFieldStyle, ...style }}>
        {children}
      </select>
    </label>
  );
}

export function TextAreaInput({ label, fullWidth = true, style, ...props }: TextAreaProps) {
  return (
    <label style={{ display: 'grid', gap: '6px', width: fullWidth ? '100%' : undefined }}>
      {label && <span style={{ fontSize: '12px', color: uiTokens.textSecondary }}>{label}</span>}
      <textarea {...props} style={{ ...baseFieldStyle, minHeight: '110px', resize: 'vertical', ...style }} />
    </label>
  );
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'success' | 'danger' }) {
  const tones: Record<string, CSSProperties> = {
    default: { border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569' },
    accent: { border: '1px solid #dbeafe', background: '#eff6ff', color: '#1e3a8a' },
    success: { border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534' },
    danger: { border: '1px solid #fecaca', background: '#fff1f2', color: '#b91c1c' }
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: '999px',
        padding: '3px 8px',
        fontSize: '11px',
        fontWeight: 700,
        ...tones[tone]
      }}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  text,
  actionLabel,
  onAction
}: {
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <Card
      style={{
        borderStyle: 'dashed',
        borderColor: '#cbd5e1',
        background: '#f8fafc',
        minHeight: '190px',
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center'
      }}
    >
      <div style={{ display: 'grid', gap: '12px' }}>
        <div style={{ color: uiTokens.textSecondary }}>{text}</div>
        <div>
          <Button variant='primary' onClick={onAction}>{actionLabel}</Button>
        </div>
      </div>
    </Card>
  );
}

export function ListItem({
  onClick,
  children,
  style
}: {
  onClick?: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Card
      style={{
        padding: '16px',
        cursor: onClick ? 'pointer' : 'default',
        ...style
      }}
    >
      <div onClick={onClick} style={{ display: 'grid', gap: '8px' }}>
        {children}
      </div>
    </Card>
  );
}
