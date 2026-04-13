'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { uiTokens } from '../../components/ui/System';
import { buildOwnerLetterHtml } from '../../lib/ownerCommunicationTemplate';
import {
  DEFAULT_REGISTRATION_CONFIG,
  evaluatePasswordRules,
  isPasswordValid,
  type RegistrationConfig,
} from '../../lib/registrationConfig';


export default function Home() {
const router = useRouter();
const [search, setSearch] = useState("");
const [user, setUser] = useState<any | null>(null);
const [loadingAuth, setLoadingAuth] = useState(true);
const [checkingMembership, setCheckingMembership] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
const [selectedCase, setSelectedCase] = useState<any | null>(null);

const handleLogin = async () => {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  if (error) alert(error.message);
};

const persistConsentAudit = async (token: string) => {
  const acceptedAt = new Date().toISOString();
  try {
    await fetch('/api/auth/consent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        consents: [
          { type: 'terms', accepted: acceptTerms, acceptedAt },
          { type: 'privacy', accepted: acceptPrivacy, acceptedAt },
          { type: 'product_updates', accepted: acceptProductUpdates, acceptedAt },
        ],
        source: 'registration',
      }),
    });
  } catch {
    // Do not block signup if audit persistence fails.
  }
};

const handleRegister = async () => {
  const normalizedFirstName = firstName.trim();
  const normalizedLastName = lastName.trim();
  const fullName = [normalizedFirstName, normalizedLastName].filter(Boolean).join(' ');

  if ((registrationConfig.requireFirstName && !normalizedFirstName) || (registrationConfig.requireLastName && !normalizedLastName)) {
    alert('Bitte Vorname und Nachname angeben.');
    return;
  }

  if ((registrationConfig.requireTerms && !acceptTerms) || (registrationConfig.requirePrivacy && !acceptPrivacy)) {
    alert('Bitte AGB und Datenschutz akzeptieren.');
    return;
  }

  if (!passwordStrong) {
    alert('Passwort erfüllt die Mindestanforderungen noch nicht.');
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        first_name: normalizedFirstName || undefined,
        last_name: normalizedLastName || undefined,
        full_name: fullName || undefined,
        accepted_terms: acceptTerms,
        accepted_privacy: acceptPrivacy,
        accepted_product_updates: acceptProductUpdates,
        registration_completed_at: new Date().toISOString(),
      },
    },
  });

  if (error) {
    alert(error.message);
    return;
  }

  if (!data.session) {
    alert('Registrierung erfolgreich. Bitte E-Mail bestaetigen und danach einloggen.');
    return;
  }

  await persistConsentAudit(data.session.access_token);

  router.push('/onboarding');
};

const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
const [firstName, setFirstName] = useState("");
const [lastName, setLastName] = useState("");
const [acceptTerms, setAcceptTerms] = useState(false);
const [acceptPrivacy, setAcceptPrivacy] = useState(false);
const [acceptProductUpdates, setAcceptProductUpdates] = useState(false);
const [registrationConfig, setRegistrationConfig] = useState<RegistrationConfig>(DEFAULT_REGISTRATION_CONFIG);
const passwordRules = evaluatePasswordRules(password, registrationConfig);
const passwordStrong = isPasswordValid(passwordRules, registrationConfig);

  const [species, setSpecies] = useState('');
  const [patientName, setPatientName] = useState('');
  const [age, setAge] = useState('');
  const [breed, setBreed] = useState('');
  const [notes, setNotes] = useState('');
  const [aiRequest, setAiRequest] = useState('');
const [cases, setCases] = useState<any[]>([]);
const [showAllCases, setShowAllCases] = useState(false);
const [loadingCases, setLoadingCases] = useState(false);
const [activePracticeId, setActivePracticeId] = useState<string | null>(null);
  const [practice, setPractice] = useState<'TZN' | 'TPH' | 'TPW'>('TZN');
  const [vet, setVet] = useState('');

const createCase = async () => {
  const { data, error } = await supabase
    .from('cases')
    .insert([
      {
        status: 'draft',
        category: 'clinical',
        case_kind: 'clinical',
        visibility_scope: 'practice',
        species,
        patient_name: patientName,
        age,
        breed,
        notes,
        ai_request: aiRequest,
        vet,
        practice,
        practice_id: activePracticeId
      }
    ])
    .select();

  console.log("NEW CASE:", data, error);
};

useEffect(() => {
  const test = async () => {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .limit(1);

    console.log("TEST:", data, error);
  };

  test();
}, []);

const loadCases = async () => {
  if (!user || !activePracticeId) return;

  setLoadingCases(true);

  let query = supabase
    .from("cases")
    .select("*")
    .eq('practice_id', activePracticeId)
    .order("created_at", { ascending: false })
    .limit(10);

  // 🔥 nur eigene Fälle wenn Toggle AUS
  if (!showAllCases) {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("❌ Fehler beim Laden:", error);
  } else {
    setCases(data || []);
  }

  setLoadingCases(false);
};

useEffect(() => {
  loadCases();
}, [user, showAllCases, activePracticeId]);

useEffect(() => {
  const loadRegistrationConfig = async () => {
    try {
      const res = await fetch('/api/auth/registration-config');
      const data = (await res.json()) as Partial<RegistrationConfig>;
      setRegistrationConfig({ ...DEFAULT_REGISTRATION_CONFIG, ...data });
    } catch {
      setRegistrationConfig(DEFAULT_REGISTRATION_CONFIG);
    }
  };

  loadRegistrationConfig();

  const checkUser = async () => {
  const { data } = await supabase.auth.getUser();
  const currentUser = data.user;

  setUser(currentUser);
  setLoadingAuth(false);

  if (!currentUser) return;
};

  checkUser();

  const { data: listener } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      setUser(session?.user ?? null);
    }
  );

  return () => {
    listener.subscription.unsubscribe();
  };
}, []);

useEffect(() => {
  const ensureMembership = async () => {
    if (!user) return;

    setCheckingMembership(true);
    try {
      const { data, error } = await supabase
        .from('practice_memberships')
        .select('practice_id, role, created_at')
        .order('created_at', { ascending: true });

      if (error) {
        return;
      }

      if (!data || data.length === 0) {
        router.push('/onboarding');
        return;
      }

      const rank: Record<string, number> = { owner: 0, admin: 1, member: 2 };
      const selected = [...data].sort((a: any, b: any) => {
        const ra = rank[a.role] ?? 99;
        const rb = rank[b.role] ?? 99;
        if (ra !== rb) return ra - rb;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      })[0];

      setActivePracticeId(selected?.practice_id || null);
    } finally {
      setCheckingMembership(false);
    }
  };

  ensureMembership();
}, [router, user]);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reviewReady, setReviewReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [status, setStatus] = useState('Bereit');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [result, setResult] = useState('');
  const shareResult = async () => {

  if (!result) return;

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Tierarzt Bericht",
        text: result
      });
    } catch (err) {
      console.error("Teilen fehlgeschlagen", err);
    }
  } else {
    alert("Teilen wird auf diesem Gerät nicht unterstützt.");
  }

};

const downloadReport = () => {

  if (!result) return;

  const blob = new Blob([result], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "tierarzt_bericht.txt";
  a.click();

  URL.revokeObjectURL(url);
};

  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const [patientLetter, setPatientLetter] = useState('');
  const [medication, setMedication] = useState('');
  const [followUp, setFollowUp] = useState('');
const [imageAnalysis, setImageAnalysis] = useState("");


  const webhookUrl = 'https://hook.eu1.make.com/8o7mx5p6w9obyytl1e151ii7grmylc3x';

  const brand = {
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
  const practices = {

  TZN: {
    name: "Tierärztezentrum Neuland",
    logo: "/tzn-logo.jpg",
    address: "Kopernikusstraße 35\n50126 Bergheim",
    phone: "+49 2271 5885269",
    website: "tzn-bergheim.de",
    contact: "https://app.petsxl.com/#/signin/appointment-registration-start/64fe56cd-427b-4757-ad0a-c0a7ad3f7b53?branch=3"
  },

 TPH: {
  name: "Tierarztpraxis Horrem",
  logo: "/tph-logo.jpg",
  address: "Ina-Seidel-Str. 1a\n50169 Kerpen",
  phone: "02273 4088",
  website: "tierarztpraxis-horrem.de",
  contact: "https://tierarztpraxis-horrem.de/kontakt"
},

TPW: {
  name: "Tierarztpraxis Weiden",
  logo: "/tpw-logo.jpg",
  address: "Aachener Str. 1248\n50859 Köln",
  phone: "02234 74661",
  website: "tp-weiden.de",
  contact: "https://tp-weiden.de/354-2/"
}

};
  const currentPractice = practices[practice];

  useEffect(() => {
    const checkMobile = () => {
      const savedPractice = localStorage.getItem("practice");

if (
  savedPractice === "TZN" ||
  savedPractice === "TPH" ||
  savedPractice === "TPW"
) {
  setPractice(savedPractice);
}

const savedVet = localStorage.getItem("vet");
if(savedVet){
  setVet(savedVet);
}
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);

      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (audioURL) {
        URL.revokeObjectURL(audioURL);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [audioURL]);

  const startFakeProgress = () => {
    setProgress(0);

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev < 50) return prev + 3;
        if (prev < 75) return prev + 1.6;
        if (prev < 88) return prev + 0.8;
        if (prev < 92) return prev + 0.2;
        return prev;
      });
    }, 1000);
  };

  const stopFakeProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const resetCase = () => {
    stopFakeProgress();

    setSpecies('');
    setPatientName('');
    setAge('');
    setBreed('');
    setNotes('');
    setAiRequest('');
    setRecording(false);
    setPaused(false);
    setReviewReady(false);
    setProcessing(false);
loadCases();
    setStatus('Bereit');
    setAudioBlob(null);
    setResult('');
    setCopied(false);
    setProgress(0);
    chunksRef.current = [];

    if (audioURL) {
      URL.revokeObjectURL(audioURL);
      setAudioURL(null);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
  };

  const startRecording = async () => {
    try {
      setResult('');
      setCopied(false);
      setReviewReady(false);
      setAudioBlob(null);
      setProgress(0);

      if (audioURL) {
        URL.revokeObjectURL(audioURL);
        setAudioURL(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

const mediaRecorder = new MediaRecorder(stream, {
  mimeType: "audio/webm;codecs=opus",
  audioBitsPerSecond: 64000
});      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setAudioURL(url);
        setReviewReady(true);
        setRecording(false);
        setPaused(false);
        setStatus('Aufnahme beendet – bitte prüfen und bei Bedarf einreichen');

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setRecording(true);
      setPaused(false);
      setStatus('Aufnahme läuft ...');
    } catch (error) {
      console.error(error);
      setStatus('Mikrofonzugriff nicht möglich');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setPaused(true);
      setStatus('Aufnahme pausiert');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setPaused(false);
      setStatus('Aufnahme läuft ...');
    }
  };

  const finishRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setStatus('Aufnahme wird beendet ...');
    }
  };

  const discardRecording = () => {
    setReviewReady(false);
    setAudioBlob(null);
    setResult('');
    setCopied(false);
    setProgress(0);

    if (audioURL) {
      URL.revokeObjectURL(audioURL);
      setAudioURL(null);
    }

    setStatus('Aufnahme verworfen');
  };

const submitRecording = async () => {
  if (!audioBlob || processing) return;

  setProcessing(true);
  setResult('');
  setCopied(false);
  setStatus('Audio wird verarbeitet ...');
  startFakeProgress();

  try {
    // 🔥 1. Transkription
    const formData = new FormData();
    formData.append("file", audioBlob, "aufnahme.webm");

    const transcribeRes = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const transcribeData = await transcribeRes.json();
    const transcript = transcribeData.text;

    setStatus("Bericht wird erstellt ...");

    // 🔥 2. Bericht generieren
    const generateRes = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
     body: JSON.stringify({
  transcript,
  imageAnalysis, // 🔥 DAS IST DER WICHTIGE TEIL
  species,
  patientName,
  age,
  breed,
  notes,
  aiRequest,
}),
    });

    const generateData = await generateRes.json();
    const text = generateData.result;

setResult(prev => 
  prev 
    ? prev + "\n\n====================\n\n" + text 
    : text
);
    // 🔥 3. In Supabase speichern
    const { error } = await supabase.from("cases").insert([
      {
        patient_name: patientName,
        category: 'clinical',
        case_kind: 'clinical',
        visibility_scope: 'practice',
        species,
        age,
        breed,
        notes,
        ai_request: aiRequest,
        result: text,
        practice,
        practice_id: activePracticeId,
        vet,
        status: "completed",
        user_id: user.id,
      },
    ]);

    if (error) {
      console.error("❌ Supabase Save Error:", error);
    } else {
      console.log("✅ Case gespeichert");
      await loadCases();
    }

    stopFakeProgress();
    setProgress(100);
    setStatus("Bericht erstellt");
    setProcessing(false);

  } catch (error) {
    console.error(error);
    stopFakeProgress();
    setStatus("Fehler bei Verarbeitung");
    setProcessing(false);
  }
};
const extractPatientLetter = () => {

  if (!result) return;

  const start = result.indexOf("Patientenbrief");

  if (start === -1) {
    alert("Kein Patientenbrief im Text gefunden");
    return;
  }

  let text = result.substring(start);

  // interne Bereiche abschneiden
  const internIndex = text.search(/#\s*(To-do|Intern)/i);

  if (internIndex !== -1) {
    text = text.substring(0, internIndex);
  }

  // Überschrift entfernen
  text = text.replace("Patientenbrief für den Besitzer", "").trim();

  // Medikamente erkennen
  const medicationPatterns = [
    /prednisolon.*?(mg|tablette|tropfen).*/gi,
    /metacam.*/gi,
    /onsior.*/gi,
    /gabapentin.*/gi,
    /amoxicillin.*/gi,
    /clavaseptin.*/gi,
    /metronidazol.*/gi,
    /cefinicol.*/gi,
    /antibiotikum.*/gi,
    /zycortal.*/gi
  ];

  let meds: string[] = [];

  medicationPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      meds = meds.concat(matches);
    }
  });

  if (meds.length) {
    const unique = [...new Set(meds)];
    setMedication(unique.join("\n"));
  }

  // Kontrolle erkennen
  const controlPatterns = [
    /kontrolle.*?\d+.*?(tag|tage|woche|wochen|monat|monate)/i,
    /in \d+ .*?(tagen|wochen|monaten)/i
  ];

  for (let pattern of controlPatterns) {
    const match = text.match(pattern);
    if (match) {
      setFollowUp(match[0]);
      break;
    }
  }

  setPatientLetter(text);

};


const printPatientLetter = () => {
  if (!patientLetter) return;

  const derivedSignatureName =
    vet?.trim() ||
    user?.user_metadata?.full_name ||
    (user?.email ? String(user.email).split("@")[0] : "") ||
    "Tierärztliches Team";

  let animalText = "Ihrem Tier";

  if (species === "Hund") animalText = "Ihrem Hund";
  if (species === "Katze") animalText = "Ihrer Katze";

  const title = patientName
    ? `Information zu ${animalText}: ${patientName}`
    : `Information zu ${animalText}`;

  const today = new Date().toLocaleDateString('de-DE');

  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) return;

  printWindow.document.write(
    buildOwnerLetterHtml(currentPractice, {
      title,
      dateLabel: today,
      body: patientLetter,
      medication,
      followUp,
      vet: derivedSignatureName,
    })
  );

printWindow.document.close();
printWindow.focus();
printWindow.print();
};

const copyResult = async () => {
  if (!result) return;

  try {
    await navigator.clipboard.writeText(result);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);

  } catch (err) {
    console.error("Kopieren fehlgeschlagen", err);
  }
};


const changePractice = (value: "TZN" | "TPH" | "TPW") => {
  setPractice(value);
  localStorage.setItem("practice", value);
};
  const changeVet = (value:string) => {
  setVet(value);
  localStorage.setItem("vet", value);
};

const buttonStyle = (background: string, color: string, disabled: boolean, bordered = false) => ({
  width: isMobile ? '100%' : 'auto',
  padding: isMobile ? '13px 18px' : '14px 20px',
  borderRadius: '10px',
  border: bordered ? `1px solid ${color}` : 'none',
  background,
  color,
  fontSize: isMobile ? '15px' : '16px',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontWeight: 700 as const,
  justifyContent: 'center' as const,
  opacity: disabled ? 1 : 1,
});

const sectionCardStyle = {
  background: '#fff',
  border: uiTokens.cardBorder,
  borderRadius: '14px',
  padding: '18px'
};

if (loadingAuth || checkingMembership) return <div>Lade...</div>;

if (!user) {
  return (
    <div style={{ padding: "40px" }}>
      <h2>{authMode === 'login' ? 'Login' : 'Registrierung'}</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button onClick={() => setAuthMode('login')}>Login</button>
        <button onClick={() => setAuthMode('register')}>Registrieren</button>
      </div>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        placeholder="Passwort"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {authMode === 'register' && (
        <>
          {registrationConfig.requireFirstName && (
            <input
              placeholder="Vorname"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          )}

          {registrationConfig.requireLastName && (
            <input
              placeholder="Nachname"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          )}

          <div style={{ marginTop: 8, marginBottom: 8, fontSize: 12, color: '#475569' }}>
            Passwortregeln: mind. {registrationConfig.minPasswordLength} Zeichen
            {registrationConfig.requireUppercase ? ', Großbuchstabe' : ''}
            {registrationConfig.requireLowercase ? ', Kleinbuchstabe' : ''}
            {registrationConfig.requireDigit ? ', Zahl' : ''}
            {registrationConfig.requireSpecialChar ? ', Sonderzeichen' : ''}.
          </div>
          <div style={{ marginTop: 0, marginBottom: 12, fontSize: 12, color: '#475569', display: 'grid', gap: 3 }}>
            <div style={{ color: passwordRules.minLength ? '#166534' : '#b91c1c' }}>• Mindestens {registrationConfig.minPasswordLength} Zeichen</div>
            {registrationConfig.requireUppercase && (
              <div style={{ color: passwordRules.upper ? '#166534' : '#b91c1c' }}>• Mindestens 1 Großbuchstabe</div>
            )}
            {registrationConfig.requireLowercase && (
              <div style={{ color: passwordRules.lower ? '#166534' : '#b91c1c' }}>• Mindestens 1 Kleinbuchstabe</div>
            )}
            {registrationConfig.requireDigit && (
              <div style={{ color: passwordRules.digit ? '#166534' : '#b91c1c' }}>• Mindestens 1 Zahl</div>
            )}
            {registrationConfig.requireSpecialChar && (
              <div style={{ color: passwordRules.special ? '#166534' : '#b91c1c' }}>• Mindestens 1 Sonderzeichen</div>
            )}
          </div>

          {registrationConfig.requireTerms && (
            <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              {registrationConfig.termsLabel}
            </label>
          )}

          {registrationConfig.requirePrivacy && (
            <label style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={acceptPrivacy}
                onChange={(e) => setAcceptPrivacy(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              {registrationConfig.privacyLabel}
            </label>
          )}

          {registrationConfig.allowProductUpdates && (
            <label style={{ display: 'block', marginTop: 8, marginBottom: 12, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={acceptProductUpdates}
                onChange={(e) => setAcceptProductUpdates(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              {registrationConfig.productUpdatesLabel}
            </label>
          )}
        </>
      )}

      {authMode === 'login' ? (
        <button onClick={handleLogin}>Login</button>
      ) : (
        <button
          onClick={handleRegister}
          disabled={
            !passwordStrong
            || (registrationConfig.requireTerms && !acceptTerms)
            || (registrationConfig.requirePrivacy && !acceptPrivacy)
          }
        >
          Registrieren
        </button>
      )}
    </div>
  );
}
return (
  <main
    style={{
      minHeight: '100vh',
      background: uiTokens.pageBackground,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: isMobile ? '14px 10px 24px' : uiTokens.pagePadding,
      fontFamily: 'inherit',
      color: brand.text,
    }}
  >
      <div
        style={{
          width: '100%',
          maxWidth: '1120px',
          background: brand.card,
          borderRadius: isMobile ? '16px' : '18px',
          padding: isMobile ? '16px' : '24px',
          boxShadow: 'none',
          border: uiTokens.cardBorder,
        }}
      >
        <div
  style={{
    display: 'flex',
    alignItems: isMobile ? 'flex-start' : 'center',
    gap: isMobile ? '12px' : '20px',
    marginBottom: isMobile ? '18px' : '24px',
    flexWrap: 'wrap',
    flexDirection: isMobile ? 'column' : 'row',
  }}
>

<div style={{ display: "flex", alignItems: "center", width: "100%" }}>

  <img
    src={currentPractice.logo}
    alt="Praxis Logo"
    style={{
      width: '140px',
      height: 'auto',
      objectFit: 'contain',
    }}
  />

  <div style={{ marginLeft: "auto" }}>
    <button
      onClick={async () => {
        await supabase.auth.signOut();
      }}
      style={{
        padding: "8px 12px",
        borderRadius: "8px",
        border: "1px solid #ccc",
        background: "#fff",
        cursor: "pointer"
      }}
    >
      Logout
    </button>
  </div>

</div>

<div style={{marginTop:'10px', width:'180px'}}>

<label
style={{
display:'block',
fontWeight:700,
color:brand.primary,
marginBottom:'6px'
}}
>
Standort
</label>

<select
value={practice}
onChange={(e)=>changePractice(e.target.value as "TZN" | "TPH" | "TPW")}
  style={{
width:'100%',
padding:'10px',
borderRadius:'8px',
border:`1px solid ${brand.border}`,
fontSize:'14px',
background:'#fff'
}}
>

<option value="TZN">TZN Bergheim</option>
<option value="TPH">TPH Horrem</option>
<option value="TPW">TPW Weiden</option>

</select>

<div style={{marginTop:'12px'}}>

<label
style={{
display:'block',
fontWeight:700,
color:brand.primary,
marginBottom:'6px'
}}
>
Tierarzt *
</label>

<input
type="text"
value={vet}
onChange={(e)=>changeVet(e.target.value)}
placeholder="z.B. Dr. Sebastian Sarter"
required
style={{
width:'100%',
padding:'10px',
borderRadius:'8px',
border:`1px solid ${brand.border}`,
fontSize:'14px',
background:'#fff'
}}
/>

</div>

</div>

<div style={{ maxWidth: '100%' }}>
            <h1
              style={{
                fontSize: isMobile ? '28px' : '34px',
                lineHeight: isMobile ? 1.08 : 1.15,
                margin: '0 0 8px 0',
                color: brand.primary,
                wordBreak: 'break-word',
              }}
            >
              {isMobile ? 'Konsultation' : 'VetMind Konsultation'}
            </h1>
            <p
              style={{
                color: brand.muted,
                margin: 0,
                fontSize: isMobile ? '15px' : '16px',
                lineHeight: 1.45,
              }}
            >
              Fall erfassen, Kontext anreichern und Ergebnisse strukturiert mit VetMind erstellen.
            </p>
          </div>
        </div>

        <div
          style={{
            ...sectionCardStyle,
            marginBottom: isMobile ? '16px' : '20px',
            padding: isMobile ? '14px' : '18px',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? '18px' : '21px', color: brand.primary }}>Falldaten</h2>
            <div style={{ marginTop: 4, fontSize: 13, color: brand.muted }}>
              Basisinformationen, Zusatznotizen und optionaler VetMind-Arbeitsauftrag.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: isMobile ? '14px' : '16px',
            }}
          >
            <div>
              <label
                htmlFor="species"
                style={{
                  display: 'block',
                  fontWeight: 700,
                  color: brand.primary,
                  marginBottom: '8px',
                  fontSize: isMobile ? '14px' : 'inherit',
                }}
              >
                Tierart (optional)
              </label>
              <select
                id="species"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                disabled={recording || processing}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1px solid ${brand.border}`,
                  fontSize: isMobile ? '16px' : '15px',
                  boxSizing: 'border-box',
                  background: '#fff',
                }}
              >
                <option value="">Bitte wählen</option>
                <option value="Hund">Hund</option>
                <option value="Katze">Katze</option>
                <option value="Heimtier">Heimtier</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="patientName"
                style={{
                  display: 'block',
                  fontWeight: 700,
                  color: brand.primary,
                  marginBottom: '8px',
                  fontSize: isMobile ? '14px' : 'inherit',
                }}
              >
                Tiername / Patient (optional)
              </label>
              <input
                id="patientName"
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="z. B. Bello"
                disabled={recording || processing}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1px solid ${brand.border}`,
                  fontSize: isMobile ? '16px' : '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="age"
                style={{
                  display: 'block',
                  fontWeight: 700,
                  color: brand.primary,
                  marginBottom: '8px',
                  fontSize: isMobile ? '14px' : 'inherit',
                }}
              >
                Alter (optional)
              </label>
              <input
                id="age"
                type="text"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="z. B. 8 Jahre"
                disabled={recording || processing}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1px solid ${brand.border}`,
                  fontSize: isMobile ? '16px' : '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="breed"
                style={{
                  display: 'block',
                  fontWeight: 700,
                  color: brand.primary,
                  marginBottom: '8px',
                  fontSize: isMobile ? '14px' : 'inherit',
                }}
              >
                Rasse (optional)
              </label>
              <input
                id="breed"
                type="text"
                value={breed}
                onChange={(e) => setBreed(e.target.value)}
                placeholder="z. B. Labrador"
                disabled={recording || processing}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: `1px solid ${brand.border}`,
                  fontSize: isMobile ? '16px' : '15px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label
              htmlFor="notes"
              style={{
                display: 'block',
                fontWeight: 700,
                color: brand.primary,
                marginBottom: '8px',
                fontSize: isMobile ? '14px' : 'inherit',
              }}
            >
              Zusätzliche Informationen (optional)
            </label>

            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="z. B. Vorbefunde, Laborwerte, Vorbehandlung oder wichtige Informationen, die nicht aus der Sprachaufnahme hervorgehen"
              disabled={recording || processing}
              style={{
                width: '100%',
                minHeight: isMobile ? '96px' : '110px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: `1px solid ${brand.border}`,
                fontSize: isMobile ? '16px' : '15px',
                boxSizing: 'border-box',
                fontFamily: 'Arial, sans-serif',
                resize: 'vertical',
                background: '#fff',
              }}
            />

            <div
              style={{
                marginTop: '8px',
                fontSize: '13px',
                color: brand.muted,
                lineHeight: 1.4,
              }}
            >
              Informationen ergänzen, die nicht aus der Sprachaufnahme hervorgehen, aber in der Dokumentation berücksichtigt werden sollen.
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label
              htmlFor="aiRequest"
              style={{
                display: 'block',
                fontWeight: 700,
                color: brand.primary,
                marginBottom: '8px',
                fontSize: isMobile ? '14px' : 'inherit',
              }}
            >
              Zusätzlicher Wunsch an VetMind (optional)
            </label>

            <textarea
              id="aiRequest"
              value={aiRequest}
              onChange={(e) => setAiRequest(e.target.value)}
              placeholder="z. B. gib mir noch aktuelle Literatur dazu, Prognoseeinschätzung oder Zusammenfassung für eine interne Übergabe"
              disabled={recording || processing}
              style={{
                width: '100%',
                minHeight: isMobile ? '96px' : '100px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: `1px solid ${brand.border}`,
                fontSize: isMobile ? '16px' : '15px',
                boxSizing: 'border-box',
                fontFamily: 'Arial, sans-serif',
                resize: 'vertical',
                background: '#fff',
              }}
            />

            <div
              style={{
                marginTop: '8px',
                fontSize: '13px',
                color: brand.muted,
                lineHeight: 1.4,
              }}
            >
              Hier kannst du einen zusätzlichen Arbeitsauftrag an VetMind ergänzen. Dieser wird getrennt von den fallbezogenen Zusatzinformationen behandelt.


            </div>

          </div>
<div style={{ marginTop: "16px" }}>

  <label style={{
    fontWeight: 700,
    color: brand.primary,
    display: "block",
    marginBottom: "6px"
  }}>
    Bild hochladen (Röntgen / Labor / Befund)
  </label>

  <input
    type="file"
    accept="image/*,.pdf"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);

      setStatus("Bild wird analysiert...");

      try {
        const res = await fetch("/api/analyze-image", {
          method: "POST",
          body: formData,
        });

       const data = await res.json();

// Bildanalyse speichern (für VetMind)
setImageAnalysis(data.result);

setResult(prev =>
  prev + "\n\n====================\n\nBILD-/DOKUMENTANALYSE:\n\n" + data.result
);

        setStatus("Bildanalyse abgeschlossen");

      } catch (err) {
        console.error(err);
        setStatus("Fehler bei Bildanalyse");
      }
    }}
  />

</div>


        <div
  style={{
    ...sectionCardStyle,
    display: 'flex',
    gap: isMobile ? '10px' : '12px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  }}
>


  <button
    onClick={startRecording}
            disabled={recording || processing}
            style={buttonStyle(recording || processing ? '#b9c2c5' : '#0e7a61', 'white', recording || processing)}
          >
            Aufnahme starten
          </button>

          <button
            onClick={pauseRecording}
            disabled={!recording || paused || processing}
            style={buttonStyle(!recording || paused || processing ? '#b9c2c5' : brand.warning, 'white', !recording || paused || processing)}
          >
            Pause
          </button>

          <button
            onClick={resumeRecording}
            disabled={!recording || !paused || processing}
            style={buttonStyle(!recording || !paused || processing ? '#b9c2c5' : '#1f7a1f', 'white', !recording || !paused || processing)}
          >
            Fortsetzen
          </button>

          <button
            onClick={finishRecording}
            disabled={!recording || processing}
            style={buttonStyle(!recording || processing ? '#b9c2c5' : brand.danger, 'white', !recording || processing)}
          >
            Aufnahme beenden
          </button>

          <button
            onClick={submitRecording}
            disabled={!reviewReady || processing}
            style={buttonStyle(!reviewReady || processing ? '#b9c2c5' : brand.primary, 'white', !reviewReady || processing)}
          >
            Einreichen
          </button>

          <button
            onClick={discardRecording}
            disabled={!reviewReady || processing}
            style={buttonStyle('#fff', brand.danger, !reviewReady || processing, true)}
          >
            Verwerfen
          </button>

          <button
            onClick={resetCase}
            disabled={recording || processing}
            style={buttonStyle('#ffffff', brand.primary, recording || processing, true)}
          >
            Neuen Fall starten
          </button>
        </div>

        <div
          style={{
            ...sectionCardStyle,
            padding: isMobile ? '14px' : '16px 18px',
            marginBottom: '20px',
          }}
        >
          <p style={{ fontSize: isMobile ? '17px' : '18px', margin: '0 0 6px 0' }}>
            Status: <strong style={{ color: brand.primary }}>{status}</strong>
          </p>

          {processing && (
            <div style={{ marginTop: '12px' }}>
              <div
                style={{
                  width: '100%',
                  height: '12px',
                  background: '#dfe8ea',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${brand.primary} 0%, #2d8e98 100%)`,
                    borderRadius: '999px',
                    transition: 'width 0.6s ease',
                  }}
                />
              </div>

              <div
                style={{
                  color: brand.muted,
                  fontSize: '14px',
                }}
              >
                Verarbeitung läuft, bitte kurz warten ...
              </div>
            </div>
          )}

          {reviewReady && !processing && (
            <div
              style={{
                marginTop: '10px',
                color: brand.muted,
                fontSize: '14px',
                lineHeight: 1.4,
              }}
            >
              Die Aufnahme ist beendet und kann jetzt geprüft, eingereicht oder verworfen werden.
            </div>
          )}
        </div>

        {audioURL && (
          <div
            style={{
              marginBottom: '24px',
              background: brand.soft,
              border: `1px solid ${brand.border}`,
              borderRadius: '16px',
              padding: isMobile ? '14px' : '18px',
            }}
          >
            <p
              style={{
                marginBottom: '10px',
                marginTop: 0,
                fontWeight: 700,
                color: brand.primary,
              }}
            >
              Testwiedergabe
            </p>
            <audio controls src={audioURL} style={{ width: '100%' }} />
          </div>
        )}

{result && (
  <div
    style={{
      ...sectionCardStyle,
      marginTop: '24px',
      padding: isMobile ? '16px' : '20px',
    }}
  >

<h2
  style={{
    marginTop: 0,
    color: brand.primary,
fontSize: isMobile ? '22px' : '28px',  }}
>
  Ergebnis
</h2>

<textarea
  value={result}
  onChange={(e) => setResult(e.target.value)}
  style={{
    width: '100%',
    minHeight: isMobile ? '260px' : '320px',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    fontSize: isMobile ? '14px' : '15px',
    lineHeight: 1.5,
    resize: 'vertical',
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif',
    whiteSpace: 'pre-wrap',
  }}
/>
<button
  onClick={() => {
    localStorage.setItem(
      "activeCase",
      JSON.stringify({
        patient_name: patientName,
        species,
        age,
        breed,
        result
      })
    );

    window.location.href = "/vetmind";
  }}
  style={{
    marginTop: "12px",
    padding: "12px 18px",
    borderRadius: "10px",
    background: brand.primary,
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontWeight: 600
  }}
>
  🧠 In VetMind analysieren
</button>
</div>
)}


{/* danach kommt dein Patientenbrief Bereich */}

{patientLetter && (
  <div
    style={{
      ...sectionCardStyle,
      marginTop: '20px',
      padding: '20px',
    }}
  >
    <h2 style={{ color: brand.primary }}>Patientenbrief</h2>

    <textarea
      value={patientLetter}
      onChange={(e) => setPatientLetter(e.target.value)}
      style={{
        width: '100%',
        minHeight: '200px',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #ccc',
        fontFamily: 'Arial',
      }}
    />

    <div style={{ marginTop: '20px' }}>
      <label
        style={{
          fontWeight: 700,
          color: brand.primary,
          display: 'block',
          marginBottom: '6px',
        }}
      >
        Medikamente
      </label>

      <textarea
        value={medication}
        onChange={(e) => setMedication(e.target.value)}
        placeholder="z.B. Prednisolon 5 mg – 1x täglich"
        style={{
          width: '100%',
          minHeight: '90px',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #ccc',
          fontFamily: 'Arial',
        }}
      />
    </div>

    <div style={{ marginTop: '16px' }}>
      <label
        style={{
          fontWeight: 700,
          color: brand.primary,
          display: 'block',
          marginBottom: '6px',
        }}
      >
        Empfohlene Kontrolle
      </label>

      <input
        value={followUp}
        onChange={(e) => setFollowUp(e.target.value)}
        placeholder="z.B. Kontrolle in 7 Tagen"
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #ccc',
        }}
      />
    </div>
  </div>
)}

<div
  style={{
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
    alignItems: 'center',
    flexWrap: 'wrap',
  }}
>
  <button
    onClick={copyResult}
    style={{
      ...buttonStyle(brand.primary, 'white', false),
      width: isMobile ? '100%' : 'auto',
    }}
  >
    Bericht kopieren
  </button>

  <button
    onClick={extractPatientLetter}
    style={{
      ...buttonStyle(brand.primary, 'white', false),
      width: isMobile ? '100%' : 'auto',
    }}
  >
    Patientenbrief erstellen
  </button>

  {patientLetter && (
    <button
      onClick={printPatientLetter}
      style={{
        ...buttonStyle('#0F6B74', 'white', false),
        width: isMobile ? '100%' : 'auto',
      }}
    >
      Patientenbrief drucken
    </button>
  )}

  <button
    onClick={shareResult}
    style={{
      ...buttonStyle(brand.primary, 'white', false),
      width: isMobile ? '100%' : 'auto',
    }}
  >
    Bericht teilen
  </button>

  <button
    onClick={downloadReport}
    style={{
      ...buttonStyle('#fff', brand.primary, false, true),
      width: isMobile ? '100%' : 'auto',
    }}
  >
    Als Datei speichern
  </button>

  {copied && (
    <span style={{ color: '#1f7a1f', fontSize: '14px' }}>
      In Zwischenablage kopiert
    </span>
  )}
</div>

{selectedCase && (
  <div
    style={{
      marginTop: '20px',
      marginBottom: '20px',
      padding: '20px',
      border: '2px solid #0F6B74',
      borderRadius: '12px',
      background: '#f0f9fa',
    }}
  >
    <h2 style={{ color: brand.primary }}>Aktiver Fall</h2>

    <div><b>Patient:</b> {selectedCase.patient_name}</div>
    <div><b>Tierart:</b> {selectedCase.species}</div>
    <div><b>Tierarzt:</b> {selectedCase.vet}</div>
    <div><b>Praxis:</b> {selectedCase.practice}</div>

    <div style={{ marginTop: '10px' }}>
      <b>Ergebnis:</b>

      <textarea
        value={selectedCase.result || ''}
        onChange={(e) =>
          setSelectedCase({ ...selectedCase, result: e.target.value })
        }
        style={{
          width: '100%',
          minHeight: '150px',
          marginTop: '6px',
          padding: '10px',
        }}
      />

      <button
        onClick={async () => {
          const { error } = await supabase
            .from('cases')
            .update({
              result: selectedCase.result,
            })
            .eq('id', selectedCase.id);

          if (error) {
            console.error('❌ Fehler beim Speichern', error);
          } else {
            alert('✅ Gespeichert');
          }
        }}
        style={{
          marginTop: '10px',
          padding: '10px 16px',
          background: brand.primary,
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
      >
        Änderungen speichern
      </button>
    </div>
  </div>
)}

<div
  style={{
    ...sectionCardStyle,
    marginTop: '30px',
    padding: '20px',
  }}
>
  <input
    type="text"
    placeholder="Fall suchen (Name, Tierart, Tierarzt...)"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    style={{
      width: '100%',
      padding: '10px',
      marginBottom: '12px',
      borderRadius: '8px',
      border: '1px solid #ccc',
    }}
  />

  <h2 style={{ color: brand.primary }}>Letzte Fälle</h2>

  <div style={{ marginBottom: '12px' }}>
    <label style={{ cursor: 'pointer', fontSize: '14px' }}>
      <input
        type="checkbox"
        checked={showAllCases}
        onChange={(e) => setShowAllCases(e.target.checked)}
        style={{ marginRight: '6px' }}
      />
      Alle Fälle der Praxis anzeigen
    </label>
  </div>

  {loadingCases && <div>Lade Fälle...</div>}

  {!loadingCases && (!cases || cases.length === 0) && (
    <div style={{ color: brand.muted }}>
      Noch keine Fälle vorhanden
    </div>
  )}

  {cases
    .filter((c) => {
      const s = search.toLowerCase();

      return (
        c.patient_name?.toLowerCase().includes(s) ||
        c.species?.toLowerCase().includes(s) ||
        c.vet?.toLowerCase().includes(s)
      );
    })
    .map((c, i) => (
      <div
        key={i}
        onClick={() => setSelectedCase(c)}
        style={{
          cursor: 'pointer',
          padding: '12px',
          borderBottom: '1px solid #eee',
          marginBottom: '8px',
        }}
      >
        <b>{c.patient_name || 'Unbekannt'}</b> – {c.species || '—'}

        <div style={{ fontSize: '13px', color: brand.muted }}>
          {c.vet || '—'} · {c.practice || '—'}
        </div>

        <div style={{ fontSize: '12px', color: '#999' }}>
          {new Date(c.created_at).toLocaleString('de-DE')}
        </div>
      </div>
    ))}
</div>

      </div>
    </div>
  </main>
);
}