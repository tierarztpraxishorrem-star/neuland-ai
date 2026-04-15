export const brand = {
  dark: '#12353D',
  primary: '#0F6B74',
  soft: '#EAF4F5',
  border: '#D7E6E8',
  text: '#1F2937',
  muted: '#5F6B73',
  danger: '#A12D2F',
  warning: '#D98C10',
  card: '#FFFFFF',
  page: '#F4F7F8',
};

export const practices = {
  TZN: {
    name: 'Tierärztezentrum Neuland',
    logo: '/tzn-logo.jpg',
    address: 'Kopernikusstraße 35\n50126 Bergheim',
    phone: '+49 2271 5885269',
    website: 'tzn-bergheim.de',
    contact: 'https://app.petsxl.com/#/signin/appointment-registration-start/64fe56cd-427b-4757-ad0a-c0a7ad3f7b53?branch=3',
  },
  TPH: {
    name: 'Tierarztpraxis Horrem',
    logo: '/tph-logo.jpg',
    address: 'Ina-Seidel-Str. 1a\n50169 Kerpen',
    phone: '02273 4088',
    website: 'tierarztpraxis-horrem.de',
    contact: 'https://tierarztpraxis-horrem.de/kontakt',
  },
  TPW: {
    name: 'Tierarztpraxis Weiden',
    logo: '/tpw-logo.jpg',
    address: 'Aachener Str. 1248\n50859 Köln',
    phone: '02234 74661',
    website: 'tp-weiden.de',
    contact: 'https://tp-weiden.de/354-2/',
  },
} as const;

export type PracticeKey = keyof typeof practices;

export type CaseRecord = {
  id: string;
  patient_name: string | null;
  species: string | null;
  vet: string | null;
  practice: string | null;
  result: string | null;
  created_at: string;
  [key: string]: unknown;
};
