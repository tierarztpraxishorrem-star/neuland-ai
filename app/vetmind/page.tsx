'use client';

import { supabase } from '../../lib/supabase';
import { useState, useEffect, useRef } from 'react';
import { createPDFBlob, generatePDF, type PracticeProfile } from '../../lib/pdfReport';

type ChatPatient = {
  id: string;
  name: string;
  tierart: string | null;
  rasse: string | null;
  alter: string | null;
  geschlecht: string | null;
  external_id: string | null;
  owner_name: string | null;
};

type PatientConsultation = {
  id: string;
  title: string | null;
  result: string | null;
  transcript: string | null;
  created_at: string;
};

function Typewriter({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    let i = 0;
    setDisplayed("");

    const interval = setInterval(() => {
      if (i < text.length) {
        const char = text.charAt(i);
        setDisplayed((prev) => prev + char);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 5);

    return () => clearInterval(interval);
  }, [text]);

  return <>{displayed}</>;
}

export default function VetMind() {

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const categoryLabels: Record<string, string> = {
    clinical: "Klinisch",
    communication: "Kommunikation",
    internal: "Intern",
    tfa: "TFA"
  };

  const normalizeTemplateCategory = (value: unknown) => {
    if (typeof value !== "string") return "";
    const normalized = value.trim().toLowerCase();
    if (normalized === "admin") return "internal";
    return normalized;
  };

  const [dictationTarget, setDictationTarget] = useState<"input" | "result">("input");

  const [cases, setCases] = useState<any[]>([]);
  const [templatesDB, setTemplatesDB] = useState<any[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateContent, setNewTemplateContent] = useState("");
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showCases, setShowCases] = useState(false);
  const [caseSearch, setCaseSearch] = useState("");
  const [patients, setPatients] = useState<ChatPatient[]>([]);
  const [showPatients, setShowPatients] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [selectedChatPatient, setSelectedChatPatient] = useState<ChatPatient | null>(null);
  const [selectedPatientConsultations, setSelectedPatientConsultations] = useState<PatientConsultation[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);

  const [showMenu, setShowMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatSearch, setChatSearch] = useState("");

  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [practiceProfile, setPracticeProfile] = useState<PracticeProfile | null>(null);

  const [recognition, setRecognition] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const pendingResponseStartIndexRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [fileContext, setFileContext] = useState("");

  const [promptTab, setPromptTab] = useState<"clinical" | "communication" | "internal">("clinical");
  const [lastPromptId, setLastPromptId] = useState("");

  const brand = {
    primary: '#0F6B74',
    border: '#E5E7EB',
    text: '#1F2937',
    muted: '#6B7280',
    bg: '#F4F7F8',
    card: '#FFFFFF'
  };

  // 🔥 TEMPLATES LADEN
  useEffect(() => {
    const loadTemplates = async () => {
      await supabase
        .from("templates")
        .update({ category: "internal" })
        .eq("category", "admin");

      const { data } = await supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: true });

      setTemplatesDB(data || []);
    };

    loadTemplates();
  }, []);

  useEffect(() => {
    const loadPracticeProfile = async () => {
      const { data, error } = await supabase
        .from("practice_settings")
        .select("practice_name, address, phone, email, logo_data_url")
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setPracticeProfile(null);
        return;
      }

      setPracticeProfile({
        practiceName: data.practice_name || "",
        address: data.address || "",
        phone: data.phone || "",
        email: data.email || "",
        logoDataUrl: data.logo_data_url || ""
      });
    };

    loadPracticeProfile();
  }, []);

  const applyQuickPrompt = (entry: { id: string; prompt: string }) => {
    setInput((prev) => (prev.trim() ? `${prev}\n\n${entry.prompt}` : entry.prompt));
    setLastPromptId(entry.id);
    localStorage.setItem("vetmind_last_prompt_id", entry.id);
    textareaRef.current?.focus();
  };

  const actionStyle = {
    padding: "10px 14px",
    borderRadius: "10px",
    border: `1px solid ${brand.border}`,
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600
  };

const formatCaseDate = (value: string | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
};

const formatCaseDateTime = (value: string | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const datePart = date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const timePart = date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${datePart} · ${timePart}`;
};

const makePreview = (text?: string) => {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ")
    .slice(0, 140);
};

const formatPatientDisplay = (patient: ChatPatient | null | undefined) => {
  if (!patient) return '';
  const tail = [patient.tierart, patient.external_id ? `#${patient.external_id}` : ''].filter(Boolean).join(' · ');
  return tail ? `${patient.name} (${tail})` : patient.name;
};

const consultationPreview = (entry: PatientConsultation) => {
  const source = entry.result || entry.transcript || '';
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .slice(0, 180);
};

const renderMessageContent = (content: string) => {
  const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  const renderLine = (line: string, lineIndex: number) => {
    const elements: any[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = markdownLinkRegex.exec(line)) !== null) {
      const [full, label, url] = match;
      const start = match.index;
      const end = start + full.length;

      if (start > cursor) {
        const chunk = line.slice(cursor, start);
        elements.push(...renderPlainChunk(chunk, `${lineIndex}-plain-${cursor}`));
      }

      elements.push(
        <a
          key={`${lineIndex}-md-${start}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: '999px',
            background: '#e2e8f0',
            color: '#0ea5e9',
            textDecoration: 'none',
            fontSize: '0.92em',
            margin: '0 3px'
          }}
        >
          {label}
        </a>
      );

      cursor = end;
    }

    if (cursor < line.length) {
      elements.push(...renderPlainChunk(line.slice(cursor), `${lineIndex}-tail-${cursor}`));
    }

    if (elements.length === 0) {
      elements.push(<span key={`${lineIndex}-empty`}>{line}</span>);
    }

    return elements;
  };

  const renderPlainChunk = (text: string, keyPrefix: string) => {
    const chunks: any[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = urlRegex.exec(text)) !== null) {
      const url = match[0];
      const start = match.index;
      const end = start + url.length;

      if (start > cursor) {
        chunks.push(<span key={`${keyPrefix}-txt-${cursor}`}>{text.slice(cursor, start)}</span>);
      }

      chunks.push(
        <a
          key={`${keyPrefix}-url-${start}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0ea5e9', textDecoration: 'underline' }}
        >
          {url}
        </a>
      );

      cursor = end;
    }

    if (cursor < text.length) {
      chunks.push(<span key={`${keyPrefix}-txt-tail`}>{text.slice(cursor)}</span>);
    }

    return chunks;
  };

  return content.split('\n').map((line, lineIndex) => (
    <div key={`line-${lineIndex}`}>
      {renderLine(line, lineIndex)}
    </div>
  ));
};

const normalizeCase = (raw: any) => {
  if (!raw) return null;
  const clean = (value: any) => {
    if (value === null || value === undefined) return "";
    const str = String(value).trim();
    if (!str) return "";
    if (str.toLowerCase() === "null" || str.toLowerCase() === "undefined") return "";
    return str;
  };

  const patientName = clean(raw.patientName || raw.patient?.name || raw.patient_name || raw.contextData?.patientName || raw.contextData?.tiername);
  const tierart = clean(raw.tierart || raw.patient?.tierart || raw.contextData?.tierart || raw.species);
  const rasse = clean(raw.rasse || raw.patient?.rasse || raw.contextData?.rasse || raw.breed);
  const alter = clean(raw.alter || raw.patient?.alter || raw.contextData?.alter || raw.age);
  const geschlecht = clean(raw.geschlecht || raw.patient?.geschlecht || raw.contextData?.geschlecht);
  const externalId = clean(raw.external_id || raw.patient?.external_id || raw.contextData?.external_id);
  const additionalInfo = clean(raw.additionalInfo || raw.contextData?.additionalInfo || raw.contextData?.weitere || raw.notes);

  return {
    ...raw,
    id: raw.caseId || raw.id || null,
    title: raw.title || "",
    patientName,
    tierart,
    rasse,
    alter,
    geschlecht,
    external_id: externalId,
    additionalInfo,
    result: raw.result || "",
    transcript: raw.transcript || "",
    category: raw.category || "",
    created_at: raw.createdAt || raw.created_at || ""
  };
};

const caseContextLines = (c: any) => {
  if (!c) return [];
  return [
    "FALLKONTEXT:",
    c.patientName ? `Patient: ${c.patientName}` : "",
    c.external_id ? `PMS-ID: ${c.external_id}` : "",
    c.tierart ? `Tierart: ${c.tierart}` : "",
    c.rasse ? `Rasse: ${c.rasse}` : "",
    c.alter ? `Alter: ${c.alter}` : "",
    c.geschlecht ? `Geschlecht: ${c.geschlecht}` : "",
    c.category ? `Kategorie: ${categoryLabels[c.category] || c.category}` : "",
    formatCaseDateTime(c.created_at || c.createdAt) ? `Datum: ${formatCaseDateTime(c.created_at || c.createdAt)}` : "",
    c.additionalInfo ? `\nZUSATZINFORMATIONEN:\n${c.additionalInfo}` : "",
    (c.result || c.transcript) ? `\nBERICHT:\n${c.result || c.transcript}` : ""
  ].filter(Boolean);
};

const normalizeTitleText = (value: any) => {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.toLowerCase() === "null" || text.toLowerCase() === "undefined") return "";
  return text;
};

const smartTitle = (caseData: any, msgList: any[]) => {
  const patientName = normalizeTitleText(caseData?.patientName);
  const externalId = normalizeTitleText(caseData?.external_id);
  const tierart = normalizeTitleText(caseData?.tierart);
  const caseTitle = normalizeTitleText(caseData?.title);

  if (patientName) {
    const display = externalId ? `${patientName} (#${externalId})` : patientName;
    return tierart ? `${display} - ${tierart}` : display;
  }

  if (caseTitle) {
    return caseTitle;
  }

  const firstUser = normalizeTitleText(msgList.find((m) => m.role === "user")?.content || "");
  if (!firstUser) return "Neuer Chat";
  return firstUser.length > 40 ? `${firstUser.slice(0, 40)}...` : firstUser;
};

const trimForList = (title: string) => (title.length > 32 ? `${title.slice(0, 32)}...` : title);

  // 🔥 FALL AUS KONSULTATION LADEN
  useEffect(() => {
    const handoff = localStorage.getItem("vetmind_context");
    if (handoff) {
      try {
        const parsed = JSON.parse(handoff);
        const normalized = normalizeCase(parsed);
        const text = normalized?.result || "";
        const contextLines = caseContextLines(normalized);

        setResult(text);
        setSelectedCaseId(normalized?.id || null);
        setSelectedCase(normalized);
        const initialMessages: any[] = [
          { role: "assistant", content: "Fall wurde geladen. Du kannst jetzt Fragen stellen." },
          { role: "system", content: contextLines.join("\n\n") }
        ];
        if (text) {
          initialMessages.push({
            role: "assistant",
            content: `Übergebener Bericht:\n\n${text}`
          });
        }
        setMessages(initialMessages);
      } catch (err) {
        console.error("VetMind handoff parse error", err);
      }
      return;
    }

    const stored = localStorage.getItem("activeCase");

    if (stored) {
      const parsed = JSON.parse(stored);
      const normalized = normalizeCase(parsed);
      setSelectedCaseId(normalized?.id || null);
      setSelectedCase(normalized);
      setResult(normalized?.result || "");

      const contextMessage = caseContextLines(normalized).join("\n\n");

      setMessages([
        { role: "assistant", content: "Fall wurde geladen. Du kannst jetzt Fragen stellen." },
        { role: "system", content: contextMessage }
      ]);
    }
}, []);

  // 🎤 DIKTIEREN
  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;

    if (!SpeechRecognition) return;

    const recog = new SpeechRecognition();
recog.continuous = false;
recog.onend = () => {
  console.log("🎤 Diktat beendet");
};
    recog.lang = "de-DE";

    recog.onresult = (event: any) => {
      let text = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }

      setInput(prev => (prev ? prev + " " : "") + text);
    };

    setRecognition(recog);
  }, []);

useEffect(() => {
  const container = chatScrollRef.current;
  if (!container) return;

  const isOverflowing = container.scrollHeight > container.clientHeight + 8;

  // While response is still short, keep auto-scroll. Stop once content exceeds viewport height.
  if (loading && isOverflowing && autoScrollEnabledRef.current) {
    autoScrollEnabledRef.current = false;
    return;
  }

  if (autoScrollEnabledRef.current) {
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }
}, [messages, loading]);

useEffect(() => {
  const container = chatScrollRef.current;
  const pendingIndex = pendingResponseStartIndexRef.current;
  if (!container || pendingIndex === null) return;

  const startNode = container.querySelector(`[data-message-index="${pendingIndex}"]`) as HTMLElement | null;
  if (!startNode) return;

  // Jump exactly to the beginning of the new assistant response.
  container.scrollTo({ top: Math.max(0, startNode.offsetTop - 8), behavior: "auto" });

  // Keep user at response start; they can freely scroll and re-enable by going to bottom.
  autoScrollEnabledRef.current = false;
  pendingResponseStartIndexRef.current = null;
}, [messages]);

const handleChatScroll = () => {
  const container = chatScrollRef.current;
  if (!container) return;

  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  const nearBottom = distanceFromBottom <= 24;

  // User controls auto-scroll: scrolling up disables, returning to bottom enables.
  autoScrollEnabledRef.current = nearBottom;
};

  // 💾 TEMPLATE SPEICHERN
const saveTemplate = async () => {
  if (!newTemplateName || !newTemplateContent) {
    alert("Bitte Name und Inhalt eingeben");
    return;
  }

  const { error } = await supabase.from("templates").insert({
    name: newTemplateName,
    content: newTemplateContent,
    category: promptTab,
    structure: null
  });

  if (error) {
    alert("Fehler beim Speichern");
    console.error(error);
    return;
  }

  setNewTemplateName("");
  setNewTemplateContent("");
  setShowTemplateBuilder(false);

  const { data } = await supabase
    .from("templates")
    .select("*")
    .order("created_at", { ascending: true });
  setTemplatesDB(data || []);
};

useEffect(() => {
  if (!activeSessionId) return;
if (messages.length <= 1 && activeSessionId) {
  return;
}

  setSessions((prev) => {
    const updated = prev.map((s) =>
      s.id === activeSessionId ? { ...s, messages } : s
    );

    localStorage.setItem("vetmind_sessions", JSON.stringify(updated));
    return updated;
  });
}, [messages, activeSessionId]);

useEffect(() => {
  if (!activeSessionId) return;

  setSessions((prev) => {
    const updated = prev.map((s) =>
      s.id === activeSessionId
        ? {
            ...s,
            chatPatient: selectedChatPatient,
            chatPatientConsultations: selectedPatientConsultations
          }
        : s
    );

    localStorage.setItem("vetmind_sessions", JSON.stringify(updated));
    return updated;
  });
}, [selectedChatPatient, selectedPatientConsultations, activeSessionId]);

// 📥 CASES LADEN (NEU RICHTIG!)
const loadCases = async () => {
  const { data } = await supabase
    .from("cases")
    .select("*, patient:patients(id, name, tierart, rasse, alter, geschlecht, external_id)")
    .order("created_at", { ascending: false })
    .limit(100);

  const mapped = (data || []).map((c: any) => {
    const stored = localStorage.getItem(`case_context_${c.id}`);
    let fromContext: any = {};
    if (stored) {
      try {
        fromContext = JSON.parse(stored);
      } catch {
        fromContext = {};
      }
    }

    const structured = fromContext.structuredCase || {};

    return {
      ...c,
      patientName: structured.patientName || c.patient?.name || c.patient_name || fromContext.patient_name || fromContext.contextData?.patientName || fromContext.contextData?.tiername || "",
      tierart: structured.tierart || c.patient?.tierart || fromContext.contextData?.tierart || c.species || "",
      rasse: structured.rasse || c.patient?.rasse || fromContext.contextData?.rasse || c.breed || "",
      alter: structured.alter || c.patient?.alter || fromContext.contextData?.alter || c.age || "",
      geschlecht: structured.geschlecht || c.patient?.geschlecht || fromContext.contextData?.geschlecht || "",
      external_id: c.patient?.external_id || fromContext.contextData?.external_id || "",
      additionalInfo: structured.additionalInfo || fromContext.contextData?.additionalInfo || fromContext.contextData?.weitere || "",
      title: c.title || structured.title || "",
      category: c.category || fromContext.category || "",
      preview: fromContext.preview || makePreview(c.result || c.transcript),
      created_at: c.created_at || fromContext.created_at || ""
    };
  });

  setCases(mapped);
};

const filteredCases = cases.filter((c: any) => {
  const haystack = [
    c.patientName,
    c.external_id,
    c.title,
    c.preview,
    c.result,
    c.transcript,
    c.category
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(caseSearch.toLowerCase());
});

const filteredPatients = patients.filter((patient) => {
  const term = patientSearch.trim().toLowerCase();
  if (!term) return true;

  const haystack = [patient.name, patient.external_id || '', patient.tierart || '']
    .join(' ')
    .toLowerCase();

  return haystack.includes(term);
});

const loadPatients = async () => {
  setPatientsLoading(true);
  const { data, error } = await supabase
    .from('patients')
    .select('id, name, tierart, rasse, alter, geschlecht, external_id, owner_name')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) {
    console.error(error);
    setPatients([]);
  } else {
    setPatients((data || []) as ChatPatient[]);
  }
  setPatientsLoading(false);
};

const attachPatient = async (patient: ChatPatient) => {
  setSelectedChatPatient(patient);

  const { data, error } = await supabase
    .from('cases')
    .select('id, title, result, transcript, created_at')
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false })
    .limit(3);

  const recent = error ? [] : ((data || []) as PatientConsultation[]);
  setSelectedPatientConsultations(recent);
  setShowPatients(false);
  setShowMenu(false);

  const latest = recent[0];
  const latestLine = latest
    ? `Letzte Konsultation: ${latest.title || 'Konsultation'} (${formatCaseDateTime(latest.created_at) || '-'})`
    : 'Letzte Konsultation: keine verknuepfte Konsultation';

  setMessages((prev) => [
    ...prev,
    {
      role: 'assistant',
      content: `Patient angehaengt: ${formatPatientDisplay(patient)}\n${latestLine}`
    }
  ]);
};

const promptTemplates = templatesDB.filter(
  (t: any) => normalizeTemplateCategory(t?.category) === promptTab
);

useEffect(() => {
  const stored = localStorage.getItem("vetmind_sessions");
  if (stored) {
    const parsed = JSON.parse(stored);
    setSessions(parsed);

    if (parsed.length > 0) {
      setActiveSessionId(parsed[0].id);
      setMessages(parsed[0].messages);
      setSelectedChatPatient(parsed[0].chatPatient || null);
      setSelectedPatientConsultations(parsed[0].chatPatientConsultations || []);
    }
  }
}, []);

useEffect(() => {
  const storedLastPrompt = localStorage.getItem("vetmind_last_prompt_id") || "";
  setLastPromptId(storedLastPrompt);
}, []);

const syncActiveSessionTitle = (msgList: any[] = messages, caseData: any = selectedCase) => {
  if (!activeSessionId) return;
  const nextTitle = smartTitle(caseData, msgList);

  setSessions((prev) => {
    let changed = false;
    const updated = prev.map((s) => {
      if (s.id !== activeSessionId) return s;
      if (s.title === nextTitle) return s;
      changed = true;
      return { ...s, title: nextTitle };
    });

    if (changed) {
      localStorage.setItem("vetmind_sessions", JSON.stringify(updated));
      return updated;
    }

    return prev;
  });
};

useEffect(() => {
  syncActiveSessionTitle();
}, [selectedCase, messages, activeSessionId]);


  // 🧠 CHAT
  const sendMessage = async (preset?: string) => {

    const text = preset || input;

if (!text.trim()) return;


    const contextBlock = `
${selectedCase ? caseContextLines({ ...selectedCase, result: result || selectedCase.result || selectedCase.transcript || "" }).join("\n\n") : ""}

${selectedChatPatient ? `
PATIENTENKONTEXT (INTERN, NICHT WOERTLICH IM FINALEN TEXT AUSGEBEN):

Name: ${selectedChatPatient.name}
${selectedChatPatient.tierart ? `Tierart: ${selectedChatPatient.tierart}` : ""}
${selectedChatPatient.rasse ? `Rasse: ${selectedChatPatient.rasse}` : ""}
${selectedChatPatient.alter ? `Alter: ${selectedChatPatient.alter}` : ""}
${selectedChatPatient.geschlecht ? `Geschlecht: ${selectedChatPatient.geschlecht}` : ""}
${selectedChatPatient.external_id ? `PMS-ID: ${selectedChatPatient.external_id}` : ""}
${selectedChatPatient.owner_name ? `Besitzer: ${selectedChatPatient.owner_name}` : ""}

RELEVANTE LETZTE KONSULTATIONEN (MAX 3):
${selectedPatientConsultations.length > 0
  ? selectedPatientConsultations
      .map((entry, index) => `
${index + 1}. ${entry.title || 'Konsultation'} (${formatCaseDateTime(entry.created_at) || '-'})
${consultationPreview(entry) || 'Keine Vorschau'}
`)
      .join('\n')
  : 'Keine verknuepften Konsultationen vorhanden.'}
` : ""}

${fileContext ? `
DATEI-KONTEXT:

${fileContext}
` : ""}
`;

    const newMessages = [
  ...messages,
  { role: "user", content: text }
];

if (activeSessionId) {
  syncActiveSessionTitle(newMessages, selectedCase);
}

    setMessages(newMessages);
    autoScrollEnabledRef.current = true;
    setInput("");
    setLoading(true);

    try {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: newMessages,
      context: contextBlock
    })
  });

 const reader = res.body?.getReader();
const decoder = new TextDecoder();

let fullText = "";

// leere assistant message hinzufügen
pendingResponseStartIndexRef.current = newMessages.length;
setMessages([
  ...newMessages,
  { role: "assistant", content: "" }
]);

while (true) {
  const { done, value } = await reader!.read();
  if (done) break;

  const chunk = decoder.decode(value);
  fullText += chunk;

  setMessages(prev => {
    const updated = [...prev];
    updated[updated.length - 1].content = fullText;
    return updated;
  });
}

setResult(fullText);

} catch (err) {
  console.error(err);
}

    setLoading(false);
  };

  // 📋 COPY
  const copy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getReportMetadata = () => {
    const ownerName = selectedCase?.besitzer || selectedCase?.ownerName || selectedCase?.contextData?.besitzer || "";
    return {
      title: promptTab === "communication" ? "Patientenbrief" : (selectedCase?.title || "Bericht"),
      date: new Date(),
      patientName: selectedCase?.patientName || "",
      ownerName
    };
  };

  const handleCreatePdf = async () => {
    if (!result.trim()) return;

    setPdfLoading(true);
    try {
      generatePDF(result, getReportMetadata(), practiceProfile || undefined);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleShare = async () => {
    if (!result.trim()) return;

    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      await handleCreatePdf();
      alert("Teilen wird auf diesem Geraet nicht unterstuetzt. Das PDF wurde stattdessen heruntergeladen.");
      return;
    }

    setShareLoading(true);
    try {
      const metadata = getReportMetadata();
      const { blob, filename } = createPDFBlob(result, metadata, practiceProfile || undefined);
      const pdfFile = new File([blob], filename, { type: "application/pdf" });

      const canShareFiles =
        typeof (navigator as any).canShare === "function" &&
        (navigator as any).canShare({ files: [pdfFile] });

      if (canShareFiles) {
        await navigator.share({
          title: metadata.title || "Bericht",
          text: "Bericht teilen",
          files: [pdfFile]
        });
      } else {
        await navigator.share({
          title: metadata.title || "Bericht",
          text: result
        });
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        alert("Teilen konnte nicht gestartet werden.");
      }
    } finally {
      setShareLoading(false);
    }
  };

  // 🏥 QUICK ACTIONS
  const runAction = (prompt: string) => {
    sendMessage(prompt);
  };
const deleteSession = (id: string) => {
  const updated = sessions.filter((s) => s.id !== id);

  setSessions(updated);
  localStorage.setItem("vetmind_sessions", JSON.stringify(updated));

  // falls aktiver Chat gelöscht wurde
  if (id === activeSessionId) {
    if (updated.length > 0) {
      setActiveSessionId(updated[0].id);
      setMessages(updated[0].messages);
      setSelectedChatPatient(updated[0].chatPatient || null);
      setSelectedPatientConsultations(updated[0].chatPatientConsultations || []);
    } else {
      setActiveSessionId(null);
      setMessages([]);
      setSelectedChatPatient(null);
      setSelectedPatientConsultations([]);
    }
  }
};

const touchSession = (id: string) => {
  const now = new Date().toISOString();
  setSessions((prev) => {
    const updated = prev.map((s) => (s.id === id ? { ...s, lastOpenedAt: now } : s));
    localStorage.setItem("vetmind_sessions", JSON.stringify(updated));
    return updated;
  });
};

const renameSession = (id: string) => {
  const newTitle = prompt("Neuen Titel eingeben:");

  if (!newTitle) return;

  const updated = sessions.map((s) =>
    s.id === id ? { ...s, title: newTitle } : s
  );

  setSessions(updated);
  localStorage.setItem("vetmind_sessions", JSON.stringify(updated));
};

const resetChat = () => {
  setMessages([{ role: "assistant", content: "Neuer Chat gestartet. Wie kann ich helfen?" }]);
  setInput("");
  setResult("");
  setSelectedCase(null);
  setSelectedCaseId(null);
  setSelectedChatPatient(null);
  setSelectedPatientConsultations([]);
  setFileContext("");
  setShowCases(false);
  setCaseSearch("");
  setShowMenu(false);
  setCopied(false);
  setPromptTab("clinical");
  setLastPromptId("");
  localStorage.removeItem("vetmind_last_prompt_id");

  // Clear handoff context so fresh chats never inherit previous case data.
  localStorage.removeItem("vetmind_context");
  localStorage.removeItem("activeCase");
};

const sortedSessions = [...sessions].sort((a: any, b: any) => {
  const aTime = new Date(a.lastOpenedAt || 0).getTime();
  const bTime = new Date(b.lastOpenedAt || 0).getTime();
  return bTime - aTime;
});

const filteredSessions = sortedSessions.filter((s: any) => {
  const query = chatSearch.trim().toLowerCase();
  if (!query) return true;

  const firstUser = (s.messages || []).find((m: any) => m.role === "user")?.content || "";
  const haystack = [s.title || "", firstUser]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
});
  const menuItemStyle = {
    padding: "10px",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px"
  };

  return (
    <main style={{
  display: "flex",
  height: "100vh",
  background: brand.bg,
  fontFamily: "Arial",
  color: brand.text
}}>

{/* SIDEBAR */}
<div style={{
  width: sidebarCollapsed ? "78px" : "260px",
  borderRight: `1px solid ${brand.border}`,
  padding: "20px",
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  transition: "width 0.2s ease"
}}>

  <div style={{ display: "flex", justifyContent: sidebarCollapsed ? "center" : "space-between", alignItems: "center" }}>
    {!sidebarCollapsed && <div style={{ fontWeight: 700, color: brand.text }}>Chats</div>}
    <button
      onClick={() => setSidebarCollapsed((v) => !v)}
      title={sidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
      style={{
        border: `1px solid ${brand.border}`,
        background: "#fff",
        borderRadius: "8px",
        width: "34px",
        height: "34px",
        cursor: "pointer"
      }}
    >
      {sidebarCollapsed ? "▶" : "◀"}
    </button>
  </div>

  {!sidebarCollapsed && (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        background: "#fff",
        paddingBottom: "8px"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          border: `1px solid ${brand.border}`,
          borderRadius: "10px",
          padding: "8px 10px",
          background: "#f9fafb"
        }}
      >
        <span style={{ fontSize: "13px", color: "#6b7280" }}>🔍</span>
        <input
          value={chatSearch}
          onChange={(e) => setChatSearch(e.target.value)}
          placeholder="Chat suchen..."
          style={{
            width: "100%",
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: "13px",
            color: brand.text
          }}
        />
      </div>
    </div>
  )}

  <button
    onClick={() => {
      resetChat();
      const now = new Date().toISOString();

      const newSession = {
  id: Date.now().toString(),
  title: "Neuer Chat",
  lastOpenedAt: now,
      chatPatient: null,
      chatPatientConsultations: [],
  messages: [
          { role: "assistant", content: "Neuer Chat gestartet. Wie kann ich helfen?" }]
      };

      const updated = [newSession, ...sessions];

      setSessions(updated);
      setActiveSessionId(newSession.id);
      setMessages(newSession.messages);

      localStorage.setItem("vetmind_sessions", JSON.stringify(updated));
    }}
    style={{
      padding: "10px",
      borderRadius: "8px",
      border: `1px solid ${brand.border}`,
      cursor: "pointer",
      background: "#f9fafb"
    }}
  >
    {sidebarCollapsed ? "＋" : "➕ Neuer Chat"}
  </button>

  {!sidebarCollapsed && filteredSessions.map((s) => (
  <div
    key={s.id}
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px",
      borderRadius: "8px",
      background: s.id === activeSessionId ? "#E6F4F5" : "transparent"
    }}
  >
    {/* CLICK AREA */}
    <div
      onClick={() => {
        setActiveSessionId(s.id);
        setMessages(s.messages);
        setSelectedChatPatient(s.chatPatient || null);
        setSelectedPatientConsultations(s.chatPatientConsultations || []);
        touchSession(s.id);
      }}
      title={s.title || "Neuer Chat"}
      style={{
        flex: 1,
        fontSize: "14px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "150px"
      }}
    >
      {trimForList(s.title || "Neuer Chat")}
    </div>

    {/* ACTIONS */}
    <div style={{ display: "flex", gap: "6px" }}>
      
      {/* ✏️ RENAME */}
      <button
        onClick={() => renameSession(s.id)}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer"
        }}
      >
        ✏️
      </button>

      {/* ❌ DELETE */}
      <button
        onClick={() => deleteSession(s.id)}
        style={{
          border: "none",
          background: "transparent",
          cursor: "pointer"
        }}
      >
        ❌
      </button>

    </div>
  </div>
))}

  {!sidebarCollapsed && filteredSessions.length === 0 && (
    <div style={{ fontSize: "13px", color: brand.muted, padding: "8px 4px" }}>
      Keine Chats gefunden
    </div>
  )}

</div>

      {/* RIGHT SIDE */}
<div style={{
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  background: brand.bg
}}>

<div
  style={{
    padding: "14px 28px",
    borderBottom: "1px solid #e9eef2",
    background: "rgba(255,255,255,0.72)",
    backdropFilter: "blur(8px)"
  }}
>
  <div style={{ fontSize: "20px", fontWeight: 700, color: brand.primary, lineHeight: 1.2 }}>VetMind</div>
  <div style={{ fontSize: "12px", color: brand.muted, marginTop: "4px" }}>
    {selectedCase?.patientName
      ? `${selectedCase.patientName}${selectedCase?.external_id ? ` (#${selectedCase.external_id})` : ""}`
      : (selectedCase?.title || "KI-Workspace")}
  </div>
</div>

<div style={{ flex: 1, overflowY: "auto", padding: "18px 28px 12px" }}>
      {/* AKTIVER FALL */}
      {selectedCase && (
        <div style={{
          marginBottom: "16px",
          padding: "12px",
          background: "#EAF4F5",
          borderRadius: "10px"
        }}>
          <b>
            {selectedCase.patientName
              ? `${selectedCase.patientName}${selectedCase?.external_id ? ` (#${selectedCase.external_id})` : ""}`
              : (selectedCase.title || "Geladener Fall")}
          </b>
          {(selectedCase.tierart || selectedCase.rasse || selectedCase.alter) ? (
            <div style={{ fontSize: "13px", color: brand.text, marginTop: "2px" }}>
              {[selectedCase.tierart, selectedCase.rasse, selectedCase.alter].filter(Boolean).join(" · ")}
            </div>
          ) : null}
          {selectedCase.additionalInfo ? (
            <div style={{ fontSize: "12px", color: brand.muted, marginTop: "4px", whiteSpace: "pre-wrap" }}>
              {selectedCase.additionalInfo}
            </div>
          ) : null}
          {selectedCase.external_id ? (
            <div style={{ fontSize: "12px", color: brand.muted, marginTop: "4px" }}>
              PMS-ID: {selectedCase.external_id}
            </div>
          ) : null}
          {formatCaseDate(selectedCase.created_at || selectedCase.createdAt) ? (
            <div style={{ fontSize: "12px", color: brand.muted, marginTop: "4px" }}>
              {formatCaseDate(selectedCase.created_at || selectedCase.createdAt)}
            </div>
          ) : null}
        </div>
      )}

      {selectedChatPatient && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 12px",
            background: "#fff",
            border: `1px solid ${brand.border}`,
            borderRadius: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "10px"
          }}
        >
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: brand.text }}>
              🐾 Patient: {selectedChatPatient.name}
              {selectedChatPatient.tierart ? ` (${selectedChatPatient.tierart})` : ""}
              {selectedChatPatient.external_id ? ` (#${selectedChatPatient.external_id})` : ""}
            </div>
            <div style={{ fontSize: "12px", color: brand.muted, marginTop: "4px" }}>
              {selectedPatientConsultations[0]
                ? `Letzte Konsultation: ${selectedPatientConsultations[0].title || "Konsultation"} (${formatCaseDateTime(selectedPatientConsultations[0].created_at) || "-"})`
                : "Letzte Konsultation: keine verknuepfte Konsultation"}
            </div>
          </div>

          <button
            onClick={() => {
              setSelectedChatPatient(null);
              setSelectedPatientConsultations([]);
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Patientenkontext entfernt." }
              ]);
            }}
            style={{
              border: `1px solid ${brand.border}`,
              background: "#fff",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "12px",
              padding: "4px 8px"
            }}
          >
            ✕ Entfernen
          </button>
        </div>
      )}



      {/* CHAT */}
<div style={{
  border: "none",
  borderRadius: "18px",
  padding: "20px",
  minHeight: "58vh",
  maxHeight: "68vh",
overflowY: "auto",
  background: "#fff",
  marginBottom: "16px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  boxShadow: "0 6px 24px rgba(15, 23, 42, 0.06)"
}}
ref={chatScrollRef}
onScroll={handleChatScroll}
>

  {messages.map((m, i) => {
    const isUser = m.role === "user";
    const isEditableResultMessage = !isUser && !loading && i === messages.length - 1 && Boolean(result);

    return (
      <div
        key={i}
        data-message-index={i}
        style={{
          display: "flex",
          justifyContent: isUser ? "flex-end" : "flex-start"
        }}
      >
        <div style={{
  maxWidth: "75%",
  width: isEditableResultMessage ? "75%" : "auto",
  display: "flex",
  flexDirection: "column",
  gap: "6px"
}}>

  {/* MESSAGE BUBBLE */}
  <div style={{
    width: isEditableResultMessage ? "100%" : "auto",
    padding: "12px 14px",
    borderRadius: "14px",
    background: isUser
      ? "#E6F4F5"
      : "#F3F4F6",
    color: brand.text,
    fontSize: "14px",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
    boxShadow: "0 2px 6px rgba(0,0,0,0.04)"
  }}>
    {isEditableResultMessage ? (
      <textarea
        value={result}
        onChange={(e) => {
          const value = e.target.value;
          setResult(value);
          setMessages((prev) => prev.map((msg, idx) => (idx === i ? { ...msg, content: value } : msg)));
        }}
        placeholder="Hier kannst du den generierten Text direkt anpassen..."
        style={{
          width: "100%",
          minHeight: "220px",
          resize: "vertical",
          borderRadius: "10px",
          border: `1px solid ${brand.border}`,
          padding: "10px",
          fontSize: "14px",
          lineHeight: 1.5,
          color: brand.text,
          background: "#fff"
        }}
      />
    ) : (
      renderMessageContent(String(m.content || ''))
    )}
  </div>

  {/* 🔥 COPY BUTTON NUR FÜR VetMind */}
  {!isUser && (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button
        onClick={() => navigator.clipboard.writeText(m.content)}
        style={{
          fontSize: "12px",
          padding: "4px 8px",
          borderRadius: "6px",
          border: "1px solid #E5E7EB",
          background: "#fff",
          cursor: "pointer"
        }}
      >
        📋 kopieren
      </button>
    </div>
  )}

</div>
      </div>
    );
  })}

  {loading && (
    <div style={{
      display: "flex",
      justifyContent: "flex-start"
    }}>
      <div style={{
        padding: "10px 14px",
        borderRadius: "14px",
        background: "#F3F4F6",
        fontSize: "14px",
        color: "#6B7280"
      }}>
        VetMind denkt...
      </div>
    </div>
  )}
<div ref={chatEndRef} />

</div>
      {/* ERGEBNIS EDITOR */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 12,
          background: "linear-gradient(180deg, rgba(244,247,248,0.2) 0%, rgba(244,247,248,1) 24%)",
          paddingTop: "10px"
        }}
      >
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>

  {/* + BUTTON */}
  <div style={{ position: "relative" }}>
    <div
      onClick={() => setShowMenu(!showMenu)}
      style={{
        width: "42px",
        height: "42px",
        borderRadius: "10px",
        border: `1px solid ${brand.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        background: "#fff",
        fontSize: "20px",
        fontWeight: 600
      }}
    >
      +
    </div>

    {showMenu && (
      <div style={{
        position: "absolute",
        bottom: "50px",
        left: 0,
        background: "#fff",
        border: `1px solid ${brand.border}`,
        borderRadius: "10px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
        padding: "8px",
        width: "220px",
        zIndex: 10
      }}>
        <div style={menuItemStyle} onClick={async () => {
          await loadCases();
          setShowCases(true);
          setShowPatients(false);
          setShowMenu(false);
        }}>
          📄 Konsultation anhängen
        </div>

        <div
          style={menuItemStyle}
          onClick={async () => {
            await loadPatients();
            setShowPatients(true);
            setShowCases(false);
            setShowMenu(false);
          }}
        >
          🐾 Patient anhängen
        </div>
        <label style={menuItemStyle}>
  📎 Datei anhängen
  <input
    type="file"
    accept="image/*,.pdf"
    style={{ display: "none" }}
   onChange={async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
e.target.value = "";

  setShowMenu(false); // 🔥 DAS IST DER FIX

  const formData = new FormData();
formData.append("file", file);

try {
  const res = await fetch("/api/analyze-image", {
    method: "POST",
    body: formData
  });

  const data = await res.json();
  const extracted = data?.result || data?.text || "";
  if (!extracted) return;

  setFileContext((prev) => (prev ? `${prev}\n\n${extracted}` : extracted));
  setMessages(prev => [
    ...prev,
    { role: "assistant", content: "Datei analysiert und dem Kontext hinzugefügt." }
  ]);

} catch (err) {
  console.error(err);
}
}}
  />
</label>
      </div>
    )}
  </div>

  {/* INPUT */}
  <textarea
  ref={textareaRef}
  value={input}
  onChange={(e) => setInput(e.target.value)}
  placeholder="Frage stellen oder SOP suchen..."
  onKeyDown={(e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }}
  style={{
    flex: 1,
    padding: "16px 14px",
    borderRadius: "14px",
    border: "1px solid #dbe3e9",
    fontSize: "15px",
    resize: "none",
    minHeight: "52px",
    maxHeight: "150px",
    lineHeight: "1.5",
    overflowY: "auto",
    background: "#fff"
  }}
/>

  {/* SEND */}
  <button
    onClick={() => sendMessage()}
    style={{
      width: "42px",
      height: "42px",
      borderRadius: "10px",
      background: brand.primary,
      color: "#fff",
      border: "none",
      cursor: "pointer"
    }}
  >
    ➤
  </button>

  {/* MIC */}
  <button
    onClick={() => {
  setInput("");
  recognition?.start();
}}
    style={{
      width: "42px",
      height: "42px",
      borderRadius: "10px",
      border: `1px solid ${brand.border}`,
      background: "#fff",
      cursor: "pointer"
    }}
  >
    🎤
  </button>

</div>

      {/* PROMPT-LEISTE */}
      <div
        style={{
          marginTop: "10px",
          background: "transparent",
          border: "none",
          borderRadius: "0",
          padding: "6px 2px 0"
        }}
      >
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
          {[
            { key: "clinical", label: "Klinisch" },
            { key: "communication", label: "Kommunikation" },
            { key: "internal", label: "Intern" }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPromptTab(tab.key as "clinical" | "communication" | "internal")}
              style={{
                borderRadius: "999px",
                border: `1px solid ${brand.border}`,
                padding: "6px 12px",
                cursor: "pointer",
                fontWeight: 600,
                background: promptTab === tab.key ? brand.primary : "#fff",
                color: promptTab === tab.key ? "#fff" : brand.text,
                transition: "all 0.15s ease"
              }}
            >
              {tab.label}
            </button>
          ))}

          <button
            onClick={() => setShowTemplateBuilder(true)}
            style={{
              borderRadius: "999px",
              border: `1px solid ${brand.border}`,
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 600,
              background: "#fff",
              color: brand.text
            }}
          >
            ➕ Vorlage erstellen
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "nowrap",
            overflowX: "auto",
            paddingBottom: "6px"
          }}
        >
          {promptTemplates.map((entry: any) => (
            <button
              key={`db-${entry.id}`}
              onClick={() => applyQuickPrompt({ id: `db-${entry.id}`, prompt: entry.content })}
              title="Fuegt den Prompt unter Beibehaltung deines aktuellen Textes ein"
              style={{
                borderRadius: "999px",
                border: `1px solid ${lastPromptId === `db-${entry.id}` ? "#8fc6cb" : "#d8e3ea"}`,
                padding: "6px 12px",
                cursor: "pointer",
                background: lastPromptId === `db-${entry.id}` ? "#eef8fa" : "#f8fafb",
                color: brand.text,
                fontSize: "13px",
                whiteSpace: "nowrap",
                flex: "0 0 auto"
              }}
            >
              🧾 {entry.name}
            </button>
          ))}

          {promptTemplates.length === 0 && (
            <div style={{ fontSize: "13px", color: brand.muted }}>
              Keine Vorlagen in dieser Kategorie.
            </div>
          )}
        </div>
      </div>
      </div>

{/* 🔥 AKTIONSLEISTE */}
{result && (
  <div style={{
    marginTop: "12px",
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  }}>

    <button
      onClick={copy}
      style={{
        padding: "10px 14px",
        borderRadius: "10px",
        background: brand.primary,
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontWeight: 600
      }}
    >
      📋 Kopieren
    </button>

    <button
      onClick={handleCreatePdf}
      disabled={pdfLoading}
      style={actionStyle}
    >
      {pdfLoading ? "PDF wird erstellt..." : "📄 PDF erstellen"}
    </button>

    <button
      onClick={handleShare}
      disabled={shareLoading}
      style={{ ...actionStyle, opacity: shareLoading ? 0.75 : 1 }}
      title="Geraeteabhängiges Teilen (z.B. Mail, Messenger, WhatsApp)"
    >
      {shareLoading ? "Teilen..." : "📤 Teilen"}
    </button>

    {copied && (
      <span style={{ color: "#1f7a1f", fontSize: "14px" }}>
        Kopiert
      </span>
    )}

  </div>
)}

    

      {/* CASE LIST */}
      {showCases && (
        <div style={{
          marginTop: "20px",
          background: "#fff",
          padding: "16px",
          borderRadius: "12px",
          border: `1px solid ${brand.border}`
        }}>
          <h3>Konsultation auswählen</h3>

          <input
            value={caseSearch}
            onChange={(e) => setCaseSearch(e.target.value)}
            placeholder="Suche nach Patient, Titel..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `1px solid ${brand.border}`,
              marginBottom: "10px"
            }}
          />

          {filteredCases.map((c: any, i: number) => {
            const lineOne = c.patientName
              ? `${c.patientName}${c.external_id ? ` (#${c.external_id})` : ""} - ${c.title || "Unbenannte Konsultation"}`
              : (c.title || "Unbenannte Konsultation");
            const lineTwo = [
              formatCaseDateTime(c.created_at) || "-",
              c.category ? (categoryLabels[c.category] || c.category) : ""
            ].filter(Boolean).join(" · ");

            return (
            <div key={i}
              onClick={() => {
                setSelectedCaseId(c.id);
                const normalized = normalizeCase(c);
                setSelectedCase(normalized);
                setResult(c.result || "");
                setShowCases(false);

                const contextMessage = caseContextLines({ ...normalized, result: c.result || "" }).join("\n\n");

                setMessages([
                  {
                    role: "assistant",
                    content: "Fall wurde geladen. Du kannst jetzt Fragen stellen."
                  },
                  {
                    role: "system",
                    content: contextMessage
                  },
                  {
                    role: "assistant",
                    content: `Übergebener Bericht:\n\n${c.result || ""}`
                  }
                ]);

                setInput("");
              }}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderRadius: "10px",
                border: selectedCaseId === c.id ? `1px solid ${brand.primary}` : "1px solid transparent",
                background: selectedCaseId === c.id ? "#EAF4F5" : "#fff",
                marginBottom: "6px",
                transition: "background 0.15s ease"
              }}
              onMouseEnter={(e) => {
                if (selectedCaseId !== c.id) e.currentTarget.style.background = "#F9FAFB";
              }}
              onMouseLeave={(e) => {
                if (selectedCaseId !== c.id) e.currentTarget.style.background = "#fff";
              }}
            >
              <div style={{ fontWeight: 600, color: brand.text }}>{lineOne}</div>
              <div style={{ fontSize: "12px", color: brand.muted, marginTop: "2px" }}>{lineTwo}</div>
              {c.preview ? (
                <div style={{ fontSize: "13px", color: "#4b5563", marginTop: "4px" }}>{c.preview}</div>
              ) : null}
            </div>
          );
          })}

          {filteredCases.length === 0 && (
            <div style={{ color: brand.muted, fontSize: "13px", marginTop: "6px" }}>
              Keine passenden Konsultationen gefunden.
            </div>
          )}
        </div>
      )}

      {showPatients && (
        <div
          style={{
            marginTop: "20px",
            background: "#fff",
            padding: "16px",
            borderRadius: "12px",
            border: `1px solid ${brand.border}`
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 style={{ margin: 0 }}>Patient auswählen</h3>
            <button
              onClick={() => setShowPatients(false)}
              style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "18px" }}
              title="Schliessen"
            >
              ✕
            </button>
          </div>

          <input
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Suche nach Name oder PMS-ID..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "8px",
              border: `1px solid ${brand.border}`,
              marginBottom: "10px"
            }}
          />

          {patientsLoading && (
            <div style={{ color: brand.muted, fontSize: "13px" }}>
              Patienten werden geladen...
            </div>
          )}

          {!patientsLoading && patients.length === 0 && (
            <div
              style={{
                border: `1px dashed ${brand.border}`,
                borderRadius: "10px",
                padding: "14px",
                color: brand.muted,
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}
            >
              <div>Noch keine Patienten vorhanden</div>
              <button
                onClick={() => {
                  window.location.href = "/patienten";
                }}
                style={{ ...actionStyle, width: "fit-content" }}
              >
                Patient erstellen
              </button>
            </div>
          )}

          {!patientsLoading && patients.length > 0 && filteredPatients.length === 0 && (
            <div style={{ color: brand.muted, fontSize: "13px" }}>
              Keine passenden Patienten gefunden.
            </div>
          )}

          {!patientsLoading && filteredPatients.map((patient) => (
            <div
              key={patient.id}
              onClick={() => attachPatient(patient)}
              style={{
                padding: "10px 12px",
                cursor: "pointer",
                borderRadius: "10px",
                border: selectedChatPatient?.id === patient.id ? `1px solid ${brand.primary}` : "1px solid transparent",
                background: selectedChatPatient?.id === patient.id ? "#EAF4F5" : "#fff",
                marginBottom: "6px",
                transition: "background 0.15s ease"
              }}
              onMouseEnter={(e) => {
                if (selectedChatPatient?.id !== patient.id) e.currentTarget.style.background = "#F9FAFB";
              }}
              onMouseLeave={(e) => {
                if (selectedChatPatient?.id !== patient.id) e.currentTarget.style.background = "#fff";
              }}
            >
              <div style={{ fontWeight: 600, color: brand.text }}>
                {patient.name}
                {patient.tierart ? ` (${patient.tierart})` : ""}
                {patient.external_id ? ` (#${patient.external_id})` : ""}
              </div>
              <div style={{ fontSize: "12px", color: brand.muted, marginTop: "2px" }}>
                {[patient.rasse, patient.alter, patient.geschlecht].filter(Boolean).join(" · ") || "Basisdaten offen"}
              </div>
            </div>
          ))}
        </div>
      )}

{showTemplateBuilder && (
  <div
    onClick={() => setShowTemplateBuilder(false)}
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.36)",
      backdropFilter: "blur(2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 120
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(640px, calc(100vw - 32px))",
        background: "#fff",
        padding: "18px",
        borderRadius: "14px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        border: "1px solid #e5e7eb"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h3 style={{ margin: 0 }}>Neue Vorlage erstellen</h3>
        <button
          onClick={() => setShowTemplateBuilder(false)}
          style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: "18px" }}
          title="Schliessen"
        >
          ✕
        </button>
      </div>

      <input
        placeholder="Name der Vorlage"
        value={newTemplateName}
        onChange={(e) => setNewTemplateName(e.target.value)}
        style={{
          width: "100%",
          padding: "11px",
          marginBottom: "10px",
          borderRadius: "10px",
          border: "1px solid #dbe3e9"
        }}
      />

      <textarea
        placeholder="Inhalt / Struktur der Vorlage"
        value={newTemplateContent}
        onChange={(e) => setNewTemplateContent(e.target.value)}
        style={{
          width: "100%",
          minHeight: "190px",
          padding: "11px",
          borderRadius: "10px",
          border: "1px solid #dbe3e9",
          marginBottom: "10px"
        }}
      />

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          onClick={() => setShowTemplateBuilder(false)}
          style={{ ...actionStyle, background: "#f8fafb" }}
        >
          Abbrechen
        </button>
        <button onClick={saveTemplate} style={actionStyle}>
          💾 Speichern
        </button>
      </div>
    </div>
  </div>
)}
    </div>
    </div>
</main>
  );
}