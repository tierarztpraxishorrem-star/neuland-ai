export type RegistrationConfig = {
  registrationTitle: string;
  registrationSubtitle: string;
  requireFirstName: boolean;
  requireLastName: boolean;
  requireTerms: boolean;
  requirePrivacy: boolean;
  allowProductUpdates: boolean;
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSpecialChar: boolean;
  termsLabel: string;
  privacyLabel: string;
  productUpdatesLabel: string;
};

export type PasswordRuleResult = {
  minLength: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
};

export const DEFAULT_REGISTRATION_CONFIG: RegistrationConfig = {
  registrationTitle: 'Konto erstellen',
  registrationSubtitle: 'Bitte Registrierungsdaten vollständig ausfüllen.',
  requireFirstName: true,
  requireLastName: true,
  requireTerms: true,
  requirePrivacy: true,
  allowProductUpdates: true,
  minPasswordLength: 10,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecialChar: true,
  termsLabel: 'AGB akzeptieren (Pflicht)',
  privacyLabel: 'Datenschutz akzeptieren (Pflicht)',
  productUpdatesLabel: 'Produkt-Updates per E-Mail erhalten (optional)',
};

export const evaluatePasswordRules = (password: string, config: RegistrationConfig): PasswordRuleResult => {
  return {
    minLength: password.length >= Math.max(6, config.minPasswordLength || 10),
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
};

export const isPasswordValid = (rules: PasswordRuleResult, config: RegistrationConfig) => {
  const checks = [
    rules.minLength,
    config.requireUppercase ? rules.upper : true,
    config.requireLowercase ? rules.lower : true,
    config.requireDigit ? rules.digit : true,
    config.requireSpecialChar ? rules.special : true,
  ];
  return checks.every(Boolean);
};
