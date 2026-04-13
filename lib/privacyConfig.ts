export const privacyConfig = {
  usesOpenAI: true,
  usesVercel: true,
  storesData: true,
  consentRequired: true,
} as const;

export type PrivacyConfig = typeof privacyConfig;

export const CHAT_CONSENT_STORAGE_KEY = "vetmind_chat_consent_v1";
export const PUBLIC_CHAT_CHANNEL = "public-chat";
