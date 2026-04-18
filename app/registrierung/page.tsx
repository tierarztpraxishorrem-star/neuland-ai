'use client';

import React, { useState, useCallback, type CSSProperties, type ChangeEvent } from 'react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { COMMON_BREEDS } from '../../lib/patientBreeds';

const SignaturePad = dynamic(() => import('../../components/SignaturePad'), { ssr: false });

// ── Types ──────────────────────────────────────────────
type OwnerData = {
  salutation: string;
  firstName: string;
  lastName: string;
  street: string;
  houseNumber: string;
  zip: string;
  city: string;
  birthDate: string;
  phone: string;
  email: string;
  emailConfirm: string;
  isAdult: boolean;
};

type AnimalData = {
  id: string;
  species: string;
  name: string;
  breed: string;
  birthDate: string;
  gender: string;
  isCastrated: string;
  coatColor: string;
  chipNumber: string;
  hasInsurance: string;
  insuranceCompany: string;
  insuranceCustom: string;
  insuranceType: string;
  insuranceNumber: string;
  wantsDirectBilling: string;
  wantsInsuranceInfo: boolean;
  signatureData: string;
  collapsed: boolean;
};

type AppointmentData = {
  date: string;
  time: string;
  referralSource: string;
  referralCustom: string;
  visitReason: string;
  hasReferringVet: string;
  referringVetName: string;
};

// ── Translations ───────────────────────────────────────
const T: Record<string, Record<string, string>> = {
  de: {
    welcome: 'Herzlich willkommen beim Tierärztezentrum Neuland!',
    welcomeSub: 'Bitte nehmen Sie sich 3-4 Minuten Zeit für Ihre Anmeldung.',
    start: 'Jetzt starten',
    back: 'Zurück',
    next: 'Weiter',
    submit: 'Jetzt anmelden',
    step2Title: 'Ihre Daten',
    step3Title: 'Ihre Tiere',
    step4Title: 'Versicherung',
    step5Title: 'Vorbefunde',
    step5Sub: 'Laden Sie vorhandene Befunde, Laborergebnisse oder Arztbriefe hoch (optional).',
    step5Drag: 'Dateien hierher ziehen oder klicken',
    step5Camera: 'Kamera',
    step5Formats: 'Bilder (JPG, PNG), PDF, Word – max. 20 MB pro Datei',
    visitReasonLabel: 'Grund Ihres Termins',
    visitReasonPlaceholder: 'Optional – beschreiben Sie in eigenen Worten, warum Sie zu uns kommen möchten. Je ausführlicher, desto besser können wir uns vorbereiten.',
    step6Title: 'Termin',
    step7Title: 'Bestätigung',
    salutation: 'Anrede',
    firstName: 'Vorname *',
    lastName: 'Nachname *',
    street: 'Straße *',
    houseNumber: 'Hausnr. *',
    zip: 'PLZ *',
    city: 'Ort *',
    birthDate: 'Geburtsdatum *',
    phone: 'Telefon *',
    email: 'E-Mail *',
    emailConfirm: 'E-Mail bestätigen *',
    adultConfirm: 'Ich bestätige, dass ich über 18 Jahre alt bin',
    species: 'Tierart *',
    animalName: 'Name *',
    breed: 'Rasse',
    animalBirthDate: 'Geburtsdatum',
    gender: 'Geschlecht',
    castrated: 'Kastriert',
    coatColor: 'Fellfarbe',
    chipNumber: 'Chipnummer',
    addAnimal: '+ Weiteres Tier hinzufügen',
    hasInsurance: 'Tierkrankenversicherung?',
    insuranceCompany: 'Versicherung',
    insuranceNumber: 'Versicherungsnummer',
    directBilling: 'Direktabrechnung gewünscht?',
    assignmentTitle: 'Abtretungserklärung',
    insuranceInfo: 'Infos zu Tierkrankenversicherungen gewünscht?',
    appointmentDate: 'Termindatum',
    appointmentTime: 'Terminuhrzeit',
    referral: 'Wie aufmerksam geworden?',
    hasVet: 'Haustierarzt?',
    vetName: 'Name der Praxis',
    confirmData: 'Ich bestätige die Richtigkeit meiner Angaben und stimme der Datenschutzerklärung zu',
    confirmFees: 'Ich erkenne die Gebührenordnung für Tierärzte und die AGB an',
    confirmPayment: 'Die Bezahlung erfolgt unmittelbar nach der Behandlung oder wird, sofern die Tierkrankenversicherung dies zulässt, direkt mit dieser abgerechnet',
    confirmPaymentDirect: 'Die Bezahlung erfolgt unmittelbar nach der Behandlung',
    thankYou: 'Vielen Dank',
    confirmationText: 'Ihre Anmeldung ist bei uns eingegangen. Wir freuen uns darauf, Sie und Ihren Liebling kennenzulernen!',
    confirmationHint: 'Sie erhalten in Kürze eine Bestätigung per E-Mail.',
    appointmentLabel: 'Ihr Termin',
    errorRequired: 'Bitte füllen Sie alle Pflichtfelder aus.',
    errorEmailMatch: 'Die E-Mail-Adressen stimmen nicht überein.',
    errorAdult: 'Sie müssen bestätigen, dass Sie über 18 Jahre alt sind.',
    errorAnimal: 'Bitte geben Sie mindestens ein Tier mit Name und Tierart an.',
    errorConfirm: 'Bitte bestätigen Sie alle erforderlichen Checkboxen.',
    errorSubmit: 'Beim Absenden ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.',
    yes: 'Ja',
    no: 'Nein',
    mr: 'Herr',
    mrs: 'Frau',
    diverse: 'Divers',
    male: 'männlich',
    female: 'weiblich',
    dog: 'Hund',
    cat: 'Katze',
    rabbit: 'Kaninchen',
    guineaPig: 'Meerschweinchen',
    bird: 'Vogel',
    reptile: 'Reptil',
    other: 'Sonstiges',
    google: 'Google',
    recommendation: 'Empfehlung',
    referralVet: 'Überweisung (vom Tierarzt)',
    socialMedia: 'Social Media',
    newspaper: 'Zeitung',
    otherCustom: 'Andere',
    referralCustomLabel: 'Wie genau?',
  },
  en: {
    welcome: 'Welcome to Tierärztezentrum Neuland!',
    welcomeSub: 'Please take 3-4 minutes to complete your registration.',
    start: 'Get started',
    back: 'Back',
    next: 'Next',
    submit: 'Submit registration',
    step2Title: 'Your details',
    step3Title: 'Your animals',
    step4Title: 'Insurance',
    step5Title: 'Previous Records',
    step5Sub: 'Upload existing reports, lab results, or veterinary letters (optional).',
    step5Drag: 'Drag files here or click to browse',
    step5Camera: 'Camera',
    step5Formats: 'Images (JPG, PNG), PDF, Word – max 20 MB per file',
    visitReasonLabel: 'Reason for your visit',
    visitReasonPlaceholder: 'Optional – describe in your own words why you are coming to see us. The more detail, the better we can prepare.',
    step6Title: 'Appointment',
    step7Title: 'Confirmation',
    salutation: 'Salutation',
    firstName: 'First name *',
    lastName: 'Last name *',
    street: 'Street *',
    houseNumber: 'House no. *',
    zip: 'ZIP code *',
    city: 'City *',
    birthDate: 'Date of birth *',
    phone: 'Phone *',
    email: 'Email *',
    emailConfirm: 'Confirm email *',
    adultConfirm: 'I confirm that I am over 18 years old',
    species: 'Species *',
    animalName: 'Name *',
    breed: 'Breed',
    animalBirthDate: 'Date of birth',
    gender: 'Gender',
    castrated: 'Neutered',
    coatColor: 'Coat color',
    chipNumber: 'Chip number',
    addAnimal: '+ Add another animal',
    hasInsurance: 'Pet insurance?',
    insuranceCompany: 'Insurance provider',
    insuranceNumber: 'Policy number',
    directBilling: 'Direct billing desired?',
    assignmentTitle: 'Assignment declaration',
    insuranceInfo: 'Would you like info about pet insurance?',
    appointmentDate: 'Appointment date',
    appointmentTime: 'Appointment time',
    referral: 'How did you hear about us?',
    hasVet: 'Do you have a regular vet?',
    vetName: 'Practice name',
    confirmData: 'I confirm the accuracy of my data and agree to the privacy policy',
    confirmFees: 'I accept the veterinary fee schedule and the terms & conditions',
    confirmPayment: 'Payment is due immediately after treatment or, if permitted by the pet insurance, billed directly through them',
    confirmPaymentDirect: 'Payment is due immediately after treatment',
    thankYou: 'Thank you',
    confirmationText: 'Your registration has been received. We look forward to meeting you and your furry friend!',
    confirmationHint: 'You will receive a confirmation email shortly.',
    appointmentLabel: 'Your appointment',
    errorRequired: 'Please fill in all required fields.',
    errorEmailMatch: 'Email addresses do not match.',
    errorAdult: 'You must confirm that you are over 18 years old.',
    errorAnimal: 'Please add at least one animal with name and species.',
    errorConfirm: 'Please confirm all required checkboxes.',
    errorSubmit: 'An error occurred while submitting. Please try again.',
    yes: 'Yes',
    no: 'No',
    mr: 'Mr',
    mrs: 'Mrs',
    diverse: 'Diverse',
    male: 'male',
    female: 'female',
    dog: 'Dog',
    cat: 'Cat',
    rabbit: 'Rabbit',
    guineaPig: 'Guinea pig',
    bird: 'Bird',
    reptile: 'Reptile',
    other: 'Other',
    google: 'Google',
    recommendation: 'Recommendation',
    referralVet: 'Referral (from vet)',
    socialMedia: 'Social Media',
    newspaper: 'Newspaper',
    otherCustom: 'Other',
    referralCustomLabel: 'Please specify',
  },
};

// ── Helpers ────────────────────────────────────────────
const BRAND = '#0f6b74';

function makeAnimal(): AnimalData {
  return {
    id: crypto.randomUUID(),
    species: '',
    name: '',
    breed: '',
    birthDate: '',
    gender: '',
    isCastrated: '',
    coatColor: '',
    chipNumber: '',
    hasInsurance: '',
    insuranceCompany: '',
    insuranceCustom: '',
    insuranceType: '',
    insuranceNumber: '',
    wantsDirectBilling: '',
    wantsInsuranceInfo: false,
    signatureData: '',
    collapsed: false,
  };
}

const timeSlots: string[] = [];
for (let h = 8; h < 20; h++) {
  for (const m of ['00', '15', '30', '45']) {
    timeSlots.push(`${String(h).padStart(2, '0')}:${m}`);
  }
}
timeSlots.push('20:00');

const insuranceProviders = [
  'Agila', 'Allianz', 'ARAG', 'Barmenia', 'DA Direkt', 'Deutsche Familienversicherung',
  'Gothaer', 'HanseMerkur', 'Helvetia', 'Lassie', 'Petolo', 'Petplan', 'Uelzener', 'Andere',
];

// ── Styles ─────────────────────────────────────────────
const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: '#f8fafb',
  margin: '-20px',
  padding: 0,
};

const cardStyle: CSSProperties = {
  width: 'min(680px, 100%)',
  margin: '0 auto',
  background: '#fff',
  borderRadius: '16px',
  boxShadow: '0 2px 20px rgba(0,0,0,0.06)',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 24px',
  borderBottom: '1px solid #e5e7eb',
};

const bodyStyle: CSSProperties = {
  padding: '32px 24px',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '13px',
  color: '#64748b',
  marginBottom: '6px',
  fontWeight: 500,
};

const inputStyle: CSSProperties = {
  width: '100%',
  borderRadius: '10px',
  border: '1px solid #e5e7eb',
  padding: '10px 12px',
  fontSize: '14px',
  background: '#fff',
  boxSizing: 'border-box',
};

const rowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '14px',
};

const btnPrimary: CSSProperties = {
  background: BRAND,
  color: '#fff',
  border: 'none',
  borderRadius: '12px',
  padding: '12px 28px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnSecondary: CSSProperties = {
  background: '#fff',
  color: '#1f2937',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '12px 28px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

const errorBanner: CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '10px',
  padding: '10px 14px',
  color: '#b91c1c',
  fontSize: '13px',
  marginBottom: '16px',
};

const checkboxRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  fontSize: '14px',
  color: '#1f2937',
  lineHeight: '1.4',
};

// ── Reusable field components (outside render body to prevent focus loss) ──
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <span style={labelStyle}>{label}</span>
    {children}
  </div>
);

const TextInput = ({
  label, value, onChange, type = 'text', placeholder, autoComplete,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; autoComplete?: string;
}) => (
  <Field label={label}>
    <input
      type={type} value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      placeholder={placeholder} autoComplete={autoComplete} style={inputStyle}
    />
  </Field>
);

const SelectField = ({
  label, value, onChange, options, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) => (
  <Field label={label}>
    <select value={value} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)} style={inputStyle}>
      <option value="">{placeholder || '-- Bitte wählen --'}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Field>
);

// ── Component ──────────────────────────────────────────
export default function RegistrierungPage() {
  const [lang, setLang] = useState<'de' | 'en'>('de');
  const t = useCallback((key: string) => T[lang]?.[key] ?? T.de[key] ?? key, [lang]);

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [registrationId, setRegistrationId] = useState('');

  // Honeypot
  const [website, setWebsite] = useState('');

  const [owner, setOwner] = useState<OwnerData>({
    salutation: '',
    firstName: '',
    lastName: '',
    street: '',
    houseNumber: '',
    zip: '',
    city: '',
    birthDate: '',
    phone: '',
    email: '',
    emailConfirm: '',
    isAdult: false,
  });

  const [animals, setAnimals] = useState<AnimalData[]>([makeAnimal()]);

  const [appointment, setAppointment] = useState<AppointmentData>({
    date: '',
    time: '',
    referralSource: '',
    referralCustom: '',
    visitReason: '',
    hasReferringVet: '',
    referringVetName: '',
  });

  // Vorbefunde upload
  type UploadedFile = { file: File; preview: string; uploaded: boolean; key?: string };
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadSessionId, setUploadSessionId] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  const [confirmData, setConfirmData] = useState(false);
  const [confirmFees, setConfirmFees] = useState(false);
  const [confirmPayment, setConfirmPayment] = useState(false);

  // ── Owner helpers ──────────────────────────────────────
  const setOwnerField = (field: keyof OwnerData, value: string | boolean) =>
    setOwner((prev) => ({ ...prev, [field]: value }));

  // ── Animal helpers ─────────────────────────────────────
  const setAnimalField = (idx: number, field: keyof AnimalData, value: string | boolean) => {
    setAnimals((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  };

  const addAnimal = () => {
    if (animals.length >= 3) return;
    // collapse existing
    setAnimals((prev) => [...prev.map((a) => ({ ...a, collapsed: true })), makeAnimal()]);
  };

  const removeAnimal = (idx: number) => {
    if (animals.length <= 1) return;
    setAnimals((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleAnimalCollapsed = (idx: number) => {
    setAnimals((prev) => prev.map((a, i) => (i === idx ? { ...a, collapsed: !a.collapsed } : a)));
  };

  // ── File upload helpers ────────────────────────────────
  const addFiles = (files: FileList | File[]) => {
    const newFiles: UploadedFile[] = Array.from(files).map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      uploaded: false,
    }));
    setUploadedFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (idx: number) => {
    setUploadedFiles((prev) => {
      const removed = prev[idx];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const uploadFiles = async () => {
    const pending = uploadedFiles.filter((f) => !f.uploaded);
    if (!pending.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      pending.forEach((f) => formData.append('files', f.file));
      const res = await fetch('/api/registration/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setUploadSessionId(data.sessionId);
        setUploadedFiles((prev) =>
          prev.map((f) => {
            const match = data.files?.find((r: { name: string }) => r.name === f.file.name);
            return match ? { ...f, uploaded: true, key: match.key } : f;
          }),
        );
      }
    } catch { /* silent */ }
    setUploading(false);
  };

  // ── Validation ─────────────────────────────────────────
  const validateStep2 = () => {
    const { firstName, lastName, street, houseNumber, zip, city, birthDate, phone, email, emailConfirm, isAdult } = owner;
    if (!firstName || !lastName || !street || !houseNumber || !zip || !city || !birthDate || !phone || !email || !emailConfirm) {
      return t('errorRequired');
    }
    if (email !== emailConfirm) return t('errorEmailMatch');
    return '';
  };

  const validateStep3 = () => {
    for (const a of animals) {
      if (!a.name || !a.species) return t('errorAnimal');
    }
    return '';
  };

  const validateStep6 = () => {
    if (!confirmData || !confirmFees || !confirmPayment) return t('errorConfirm');
    return '';
  };

  const goNext = () => {
    setError('');
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
    }
    if (step === 3) {
      const err = validateStep3();
      if (err) { setError(err); return; }
    }
    // Upload files when leaving step 5
    if (step === 5 && uploadedFiles.some((f) => !f.uploaded)) {
      uploadFiles();
    }
    setStep((s) => Math.min(s + 1, 7));
  };

  const goBack = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 1));
  };

  // ── Submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
    setError('');
    const err = validateStep6();
    if (err) { setError(err); return; }

    setSubmitting(true);
    try {
      const payload = {
        owner: {
          salutation: owner.salutation,
          firstName: owner.firstName,
          lastName: owner.lastName,
          street: owner.street,
          houseNumber: owner.houseNumber,
          zip: owner.zip,
          city: owner.city,
          birthDate: owner.birthDate,
          phone: owner.phone,
          email: owner.email,
          isAdult: owner.isAdult,
        },
        animals: animals.map((a, idx) => ({
          sortOrder: idx + 1,
          species: a.species,
          name: a.name,
          breed: a.breed,
          birthDate: a.birthDate,
          gender: a.gender,
          isCastrated: a.isCastrated === 'ja',
          coatColor: a.coatColor,
          chipNumber: a.chipNumber,
          hasInsurance: a.hasInsurance === 'ja',
          insuranceCompany: a.insuranceCompany === 'Andere' ? a.insuranceCustom : a.insuranceCompany,
          insuranceType: a.insuranceType || null,
          insuranceNumber: a.insuranceNumber,
          wantsDirectBilling: a.wantsDirectBilling === 'ja',
          wantsInsuranceInfo: a.wantsInsuranceInfo,
          signatureData: a.signatureData || null,
        })),
        appointment: {
          date: appointment.date,
          time: appointment.time,
          referralSource: appointment.referralSource === 'Andere' ? appointment.referralCustom : appointment.referralSource,
          visitReason: appointment.visitReason || null,
          referringVetName: appointment.hasReferringVet === 'ja' ? appointment.referringVetName : null,
        },
        documents: uploadSessionId ? {
          sessionId: uploadSessionId,
          files: uploadedFiles.filter((f) => f.uploaded).map((f) => ({ key: f.key, name: f.file.name, type: f.file.type })),
        } : null,
        language: lang,
        website, // honeypot
      };

      const res = await fetch('/api/registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('errorSubmit'));
      }

      const result = await res.json();
      setRegistrationId(result.registration_id || '');
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Progress dots ──────────────────────────────────────
  const ProgressDots = () => (
    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px' }}>
      {[1, 2, 3, 4, 5, 6, 7].map((s) => (
        <div
          key={s}
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: s <= step ? BRAND : '#d1d5db',
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  );

  // ── Nav buttons ────────────────────────────────────────
  const NavButtons = ({ showSubmit }: { showSubmit?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px' }}>
      {step > 1 ? (
        <button type="button" onClick={goBack} style={btnSecondary}>{t('back')}</button>
      ) : (
        <div />
      )}
      {showSubmit ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          style={{ ...btnPrimary, opacity: submitting ? 0.6 : 1, minWidth: '180px' }}
        >
          {submitting ? '...' : t('submit')}
        </button>
      ) : (
        <button type="button" onClick={goNext} style={btnPrimary}>{t('next')}</button>
      )}
    </div>
  );

  // Field components moved outside render body – see top of file

  // ── Confirmation view ──────────────────────────────────
  if (submitted) {
    return (
      <div style={pageStyle}>
        <div style={{ padding: '40px 20px' }}>
          <div style={cardStyle}>
            <div style={headerStyle}>
              <Image src="/tzn-logo.jpg" alt="TZN" width={120} height={48} style={{ height: '48px', width: 'auto' }} />
            </div>
            <div style={{ ...bodyStyle, textAlign: 'center' }}>
              <div style={{
                width: '72px', height: '72px', borderRadius: '50%',
                background: '#f0fdfa', border: `2px solid ${BRAND}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px', fontSize: '32px', color: BRAND,
              }}>
                &#10003;
              </div>
              <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>
                {t('thankYou')}, {owner.salutation} {owner.lastName}!
              </h1>
              <p style={{ color: '#64748b', marginBottom: '8px', lineHeight: 1.6 }}>
                {lang === 'de'
                  ? `Ihre Anmeldung ist bei uns eingegangen. Wir freuen uns darauf, Sie und ${animals.length === 1 ? animals[0].name : animals.map((a) => a.name).join(', ')} kennenzulernen!`
                  : `Your registration has been received. We look forward to meeting you and ${animals.length === 1 ? animals[0].name : animals.map((a) => a.name).join(', ')}!`
                }
              </p>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '24px' }}>{t('confirmationHint')}</p>
              {appointment.date && (
                <div
                  style={{
                    display: 'inline-block',
                    background: '#f0fdfa',
                    border: '1px solid #99f6e4',
                    borderRadius: '12px',
                    padding: '16px 24px',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: '13px', color: BRAND, fontWeight: 600, marginBottom: '4px' }}>
                    {t('appointmentLabel')}
                  </div>
                  <div style={{ fontSize: '16px', color: '#1f2937' }}>
                    {appointment.time === 'Notfallsprechstunde'
                      ? 'Notfallsprechstunde (ohne Termin)'
                      : (
                        <>
                          {new Date(appointment.date + 'T00:00:00').toLocaleDateString('de-DE', {
                            weekday: 'long',
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })}
                          {appointment.time ? ` um ${appointment.time} Uhr` : ''}
                        </>
                      )
                    }
                  </div>
                </div>
              )}
              {registrationId && (
                <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '20px' }}>
                  Registrierungs-Nr.: {registrationId}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step content ───────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      // ────── Step 1: Welcome ──────
      case 1:
        return (
          <div
            style={{
              background: 'linear-gradient(135deg, #0f6b74, #134e5e)',
              minHeight: '500px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 24px',
              textAlign: 'center',
              borderRadius: '0 0 16px 16px',
            }}
          >
            <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 700, marginBottom: '16px', lineHeight: 1.3, maxWidth: '500px' }}>
              {t('welcome')}
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '16px', marginBottom: '36px', maxWidth: '440px' }}>
              {t('welcomeSub')}
            </p>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={{
                background: '#fff',
                color: BRAND,
                border: 'none',
                borderRadius: '14px',
                padding: '16px 44px',
                fontSize: '17px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              }}
            >
              {t('start')}
            </button>
          </div>
        );

      // ────── Step 2: Owner data ──────
      case 2:
        return (
          <div style={bodyStyle}>
            <ProgressDots />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '20px' }}>{t('step2Title')}</h2>
            {error && <div style={errorBanner}>{error}</div>}

            {/* Honeypot – hidden from real users */}
            <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </div>

            <div style={{ display: 'grid', gap: '14px' }}>
              <SelectField
                label={t('salutation')}
                value={owner.salutation}
                onChange={(v) => setOwnerField('salutation', v)}
                options={[
                  { value: 'Herr', label: t('mr') },
                  { value: 'Frau', label: t('mrs') },
                  { value: 'Divers', label: t('diverse') },
                ]}
              />

              <div style={rowStyle}>
                <TextInput label={t('firstName')} value={owner.firstName} onChange={(v) => setOwnerField('firstName', v)} autoComplete="given-name" />
                <TextInput label={t('lastName')} value={owner.lastName} onChange={(v) => setOwnerField('lastName', v)} autoComplete="family-name" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
                <TextInput label={t('street')} value={owner.street} onChange={(v) => setOwnerField('street', v)} autoComplete="street-address" />
                <TextInput label={t('houseNumber')} value={owner.houseNumber} onChange={(v) => setOwnerField('houseNumber', v)} autoComplete="address-line2" />
              </div>

              <div style={rowStyle}>
                <TextInput label={t('zip')} value={owner.zip} onChange={(v) => setOwnerField('zip', v)} autoComplete="postal-code" />
                <TextInput label={t('city')} value={owner.city} onChange={(v) => setOwnerField('city', v)} autoComplete="address-level2" />
              </div>

              <TextInput label={t('birthDate')} value={owner.birthDate} onChange={(v) => setOwnerField('birthDate', v)} autoComplete="bday" placeholder="TT.MM.JJJJ" />
              <TextInput label={t('phone')} type="tel" value={owner.phone} onChange={(v) => setOwnerField('phone', v)} autoComplete="tel" />
              <TextInput label={t('email')} type="email" value={owner.email} onChange={(v) => setOwnerField('email', v)} autoComplete="email" />
              <TextInput label={t('emailConfirm')} type="email" value={owner.emailConfirm} onChange={(v) => setOwnerField('emailConfirm', v)} autoComplete="email" />

            </div>

            <NavButtons />
          </div>
        );

      // ────── Step 3: Animals ──────
      case 3:
        return (
          <div style={bodyStyle}>
            <ProgressDots />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '20px' }}>{t('step3Title')}</h2>
            {error && <div style={errorBanner}>{error}</div>}

            <div style={{ display: 'grid', gap: '16px' }}>
              {animals.map((animal, idx) => (
                <div
                  key={animal.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Animal header */}
                  <div
                    onClick={() => toggleAnimalCollapsed(idx)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: '#f8fafb',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '14px', color: '#1f2937' }}>
                      {animal.name || `Tier ${idx + 1}`}
                      {animal.species ? ` (${animal.species})` : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {animals.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeAnimal(idx); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '18px',
                            padding: '0 4px',
                          }}
                        >
                          &times;
                        </button>
                      )}
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                        {animal.collapsed ? '&#9660;' : '&#9650;'}
                      </span>
                    </div>
                  </div>

                  {/* Animal fields */}
                  {!animal.collapsed && (
                    <div style={{ padding: '16px', display: 'grid', gap: '14px' }}>
                      <SelectField
                        label={t('species')}
                        value={animal.species}
                        onChange={(v) => setAnimalField(idx, 'species', v)}
                        options={[
                          { value: 'Hund', label: t('dog') },
                          { value: 'Katze', label: t('cat') },
                          { value: 'Kaninchen', label: t('rabbit') },
                          { value: 'Meerschweinchen', label: t('guineaPig') },
                          { value: 'Vogel', label: t('bird') },
                          { value: 'Reptil', label: t('reptile') },
                          { value: 'Sonstiges', label: t('other') },
                        ]}
                      />
                      <TextInput label={t('animalName')} value={animal.name} onChange={(v) => setAnimalField(idx, 'name', v)} />
                      <div style={rowStyle}>
                        <Field label={t('breed')}>
                          <input
                            list={`breeds-${idx}`}
                            value={animal.breed}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setAnimalField(idx, 'breed', e.target.value)}
                            placeholder="Rasse eingeben oder wählen..."
                            style={inputStyle}
                          />
                          <datalist id={`breeds-${idx}`}>
                            <option value="Mischling (klein)" />
                            <option value="Mischling (mittel)" />
                            <option value="Mischling (groß)" />
                            {COMMON_BREEDS.map((b) => <option key={b} value={b} />)}
                          </datalist>
                        </Field>
                        <TextInput label={t('animalBirthDate')} value={animal.birthDate} onChange={(v) => setAnimalField(idx, 'birthDate', v)} placeholder="TT.MM.JJJJ" />
                      </div>
                      <div style={rowStyle}>
                        <SelectField
                          label={t('gender')}
                          value={animal.gender}
                          onChange={(v) => setAnimalField(idx, 'gender', v)}
                          options={[
                            { value: 'männlich', label: t('male') },
                            { value: 'weiblich', label: t('female') },
                          ]}
                        />
                        <SelectField
                          label={t('castrated')}
                          value={animal.isCastrated}
                          onChange={(v) => setAnimalField(idx, 'isCastrated', v)}
                          options={[
                            { value: 'ja', label: t('yes') },
                            { value: 'nein', label: t('no') },
                          ]}
                        />
                      </div>
                      <div style={rowStyle}>
                        <TextInput label={t('coatColor')} value={animal.coatColor} onChange={(v) => setAnimalField(idx, 'coatColor', v)} />
                        <TextInput label={t('chipNumber')} value={animal.chipNumber} onChange={(v) => setAnimalField(idx, 'chipNumber', v)} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {animals.length < 3 && (
                <button
                  type="button"
                  onClick={addAnimal}
                  style={{
                    background: '#f0fdfa',
                    color: BRAND,
                    border: `1px dashed ${BRAND}`,
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t('addAnimal')}
                </button>
              )}
            </div>

            <NavButtons />
          </div>
        );

      // ────── Step 4: Insurance ──────
      case 4:
        return (
          <div style={bodyStyle}>
            <ProgressDots />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '20px' }}>{t('step4Title')}</h2>

            <div style={{ display: 'grid', gap: '20px' }}>
              {animals.map((animal, idx) => (
                <div
                  key={animal.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '16px',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '15px', color: '#1f2937', marginBottom: '14px' }}>
                    {animal.name || `Tier ${idx + 1}`}
                  </div>

                  <div style={{ display: 'grid', gap: '14px' }}>
                    <SelectField
                      label={t('hasInsurance')}
                      value={animal.hasInsurance}
                      onChange={(v) => setAnimalField(idx, 'hasInsurance', v)}
                      options={[
                        { value: 'ja', label: t('yes') },
                        { value: 'nein', label: t('no') },
                      ]}
                    />

                    {animal.hasInsurance === 'ja' && (
                      <>
                        <SelectField
                          label={t('insuranceCompany')}
                          value={animal.insuranceCompany}
                          onChange={(v) => setAnimalField(idx, 'insuranceCompany', v)}
                          options={insuranceProviders.map((p) => ({ value: p, label: p }))}
                        />
                        {animal.insuranceCompany === 'Andere' && (
                          <TextInput
                            label="Versicherungsname eingeben"
                            value={animal.insuranceCustom}
                            onChange={(v) => setAnimalField(idx, 'insuranceCustom', v)}
                            placeholder="Name der Versicherung"
                          />
                        )}

                        <SelectField
                          label="Art der Versicherung"
                          value={animal.insuranceType}
                          onChange={(v) => setAnimalField(idx, 'insuranceType', v)}
                          options={[
                            { value: 'Vollversicherung', label: 'Vollversicherung' },
                            { value: 'OP-Versicherung', label: 'OP-Versicherung' },
                          ]}
                        />

                        <SelectField
                          label={t('directBilling')}
                          value={animal.wantsDirectBilling}
                          onChange={(v) => setAnimalField(idx, 'wantsDirectBilling', v)}
                          options={[
                            { value: 'ja', label: t('yes') },
                            { value: 'nein', label: t('no') },
                          ]}
                        />

                        {animal.wantsDirectBilling === 'ja' && (
                          <>
                            <TextInput
                              label={t('insuranceNumber')}
                              value={animal.insuranceNumber}
                              onChange={(v) => setAnimalField(idx, 'insuranceNumber', v)}
                            />
                            <div>
                              <div style={{ ...labelStyle, fontWeight: 600, color: '#1f2937', marginBottom: '10px' }}>
                                {t('assignmentTitle')}
                              </div>
                              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px', lineHeight: 1.5 }}>
                                Hiermit trete ich meinen Erstattungsanspruch aus dem Versicherungsvertrag
                                an das Tierärztezentrum Neuland ab. Die Abtretung gilt für die Behandlung
                                des oben genannten Tieres.
                              </p>
                              <SignaturePad
                                onSave={(dataUrl) => setAnimalField(idx, 'signatureData', dataUrl)}
                                onClear={() => setAnimalField(idx, 'signatureData', '')}
                              />
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {animal.hasInsurance === 'nein' && (
                      <label style={checkboxRow}>
                        <input
                          type="checkbox"
                          checked={animal.wantsInsuranceInfo}
                          onChange={(e) => setAnimalField(idx, 'wantsInsuranceInfo', e.target.checked)}
                          style={{ marginTop: '3px', accentColor: BRAND }}
                        />
                        <span>{t('insuranceInfo')}</span>
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <NavButtons />
          </div>
        );

      // ────── Step 5: Vorbefunde Upload ──────
      case 5:
        return (
          <div style={bodyStyle}>
            <ProgressDots />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>{t('step5Title')}</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>{t('step5Sub')}</p>

            {/* Drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #d1d5db',
                borderRadius: '12px',
                padding: '32px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: '#fafbfc',
                transition: 'border-color 0.2s',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '36px', marginBottom: '8px', color: '#94a3b8' }}>&#128206;</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>{t('step5Drag')}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>{t('step5Formats')}</div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,.doc,.docx"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
              style={{ display: 'none' }}
            />

            {/* Camera button – only on touch devices (mobile) */}
            {typeof window !== 'undefined' && 'ontouchstart' in window && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  style={{ ...btnSecondary, fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  &#128247; {t('step5Camera')}
                </button>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                  style={{ display: 'none' }}
                />
              </div>
            )}

            {/* File list */}
            {uploadedFiles.length > 0 && (
              <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
                {uploadedFiles.map((f, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      background: f.uploaded ? '#f0fdf4' : '#fff',
                    }}
                  >
                    {f.preview ? (
                      <img src={f.preview} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: '6px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
                        &#128196;
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file.name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{(f.file.size / 1024).toFixed(0)} KB{f.uploaded ? ' · Hochgeladen' : ''}</div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px', padding: '0 4px' }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{uploadedFiles.length} Datei(en)</div>
              </div>
            )}

            {/* Termingrund */}
            <div style={{ marginTop: '8px' }}>
              <span style={labelStyle}>{t('visitReasonLabel')}</span>
              <textarea
                value={appointment.visitReason}
                onChange={(e) => setAppointment((prev) => ({ ...prev, visitReason: e.target.value }))}
                placeholder={t('visitReasonPlaceholder')}
                rows={4}
                style={{
                  ...inputStyle,
                  resize: 'vertical',
                  minHeight: '80px',
                  lineHeight: 1.5,
                }}
              />
            </div>

            <NavButtons />
          </div>
        );

      // ────── Step 6: Appointment ──────
      case 6:
        return (
          <div style={bodyStyle}>
            <ProgressDots />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '20px' }}>{t('step6Title')}</h2>

            <div style={{ display: 'grid', gap: '14px' }}>
              <TextInput
                label={t('appointmentDate')}
                type="date"
                value={appointment.date}
                onChange={(v) => setAppointment((prev) => ({ ...prev, date: v }))}
              />
              <SelectField
                label={t('appointmentTime')}
                value={appointment.time}
                onChange={(v) => setAppointment((prev) => ({ ...prev, time: v }))}
                options={[
                  { value: 'Notfallsprechstunde', label: 'Notfallsprechstunde (ohne Termin)' },
                  ...timeSlots.map((s) => ({ value: s, label: `${s} Uhr` })),
                ]}
              />

              <SelectField
                label={t('referral')}
                value={appointment.referralSource}
                onChange={(v) => setAppointment((prev) => ({ ...prev, referralSource: v, referralCustom: '' }))}
                options={[
                  { value: 'Google', label: t('google') },
                  { value: 'Empfehlung', label: t('recommendation') },
                  { value: 'Überweisung', label: t('referralVet') },
                  { value: 'Social Media', label: t('socialMedia') },
                  { value: 'Zeitung', label: t('newspaper') },
                  { value: 'Andere', label: t('otherCustom') },
                ]}
              />
              {appointment.referralSource === 'Andere' && (
                <TextInput
                  label={t('referralCustomLabel')}
                  value={appointment.referralCustom}
                  onChange={(v) => setAppointment((prev) => ({ ...prev, referralCustom: v }))}
                  placeholder={lang === 'de' ? 'Bitte angeben...' : 'Please specify...'}
                />
              )}

              <SelectField
                label={t('hasVet')}
                value={appointment.hasReferringVet}
                onChange={(v) => setAppointment((prev) => ({ ...prev, hasReferringVet: v }))}
                options={[
                  { value: 'ja', label: t('yes') },
                  { value: 'nein', label: t('no') },
                ]}
              />

              {appointment.hasReferringVet === 'ja' && (
                <TextInput
                  label={t('vetName')}
                  value={appointment.referringVetName}
                  onChange={(v) => setAppointment((prev) => ({ ...prev, referringVetName: v }))}
                />
              )}
            </div>

            <NavButtons />
          </div>
        );

      // ────── Step 7: Confirm & Submit ──────
      case 7:
        return (
          <div style={bodyStyle}>
            <ProgressDots />
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', marginBottom: '20px' }}>{t('step7Title')}</h2>
            {error && <div style={errorBanner}>{error}</div>}

            <div style={{ display: 'grid', gap: '16px' }}>
              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={confirmData}
                  onChange={(e) => setConfirmData(e.target.checked)}
                  style={{ marginTop: '3px', accentColor: BRAND }}
                />
                <span>
                  {t('confirmData')}{' '}
                  <a href="/legal/datenschutz" target="_blank" rel="noopener noreferrer" style={{ color: BRAND }}>
                    (Datenschutzerklärung)
                  </a>
                </span>
              </label>

              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={confirmFees}
                  onChange={(e) => setConfirmFees(e.target.checked)}
                  style={{ marginTop: '3px', accentColor: BRAND }}
                />
                <span>
                  {t('confirmFees')}{' '}
                  <a href="/legal/agb" target="_blank" rel="noopener noreferrer" style={{ color: BRAND }}>
                    (AGB)
                  </a>
                </span>
              </label>

              <label style={checkboxRow}>
                <input
                  type="checkbox"
                  checked={confirmPayment}
                  onChange={(e) => setConfirmPayment(e.target.checked)}
                  style={{ marginTop: '3px', accentColor: BRAND }}
                />
                <span>{animals.some((a) => a.wantsDirectBilling === 'ja') ? t('confirmPayment') : t('confirmPaymentDirect')}</span>
              </label>
            </div>

            <NavButtons showSubmit />
          </div>
        );

      default:
        return null;
    }
  };

  // ── Main render ────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={{ padding: step === 1 ? '0' : '40px 20px' }}>
        <div style={cardStyle}>
          {/* Header (not on welcome step) */}
          {step !== 1 && (
            <div style={headerStyle}>
              <Image src="/tzn-logo.jpg" alt="TZN" width={120} height={48} style={{ height: '48px', width: 'auto' }} />
              <button
                type="button"
                onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                {lang === 'de' ? 'EN' : 'DE'}
              </button>
            </div>
          )}

          {/* Step 1 special: logo + lang toggle overlaid */}
          {step === 1 && (
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '24px',
                  zIndex: 1,
                }}
              >
                <Image src="/tzn-logo.jpg" alt="TZN" width={120} height={48} style={{ height: '48px', width: 'auto', borderRadius: '8px' }} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '24px',
                  zIndex: 1,
                }}
              >
                <button
                  type="button"
                  onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: '#fff',
                  }}
                >
                  {lang === 'de' ? 'EN' : 'DE'}
                </button>
              </div>
            </div>
          )}

          {renderStep()}
        </div>
      </div>
    </div>
  );
}
