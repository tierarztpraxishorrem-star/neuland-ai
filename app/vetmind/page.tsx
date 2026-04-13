'use client';

import { supabase } from '../../lib/supabase';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createPDFBlob, generatePDF, type PracticeProfile } from '../../lib/pdfReport';
import AiDisclaimer from '../../components/AiDisclaimer';
import { Button, Card, Input, TextAreaInput, uiTokens } from '../../components/ui/System';

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

type UploadedContextFile = {
  id: string;
  name: string;
  uploadedAt: string;
  extractedText: string;
  fileType: 'pdf' | 'image' | 'other';
  inContext: boolean;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
};

type PromptCategory = 'clinical' | 'communication' | 'internal';

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
  const router = useRouter();

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
  const [activePracticeId, setActivePracticeId] = useState<string | null>(null);

  const [showMenu, setShowMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatSearch, setChatSearch] = useState("");

  const [result, setResult] = useState("");
  const [copied, setCopied] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [practiceProfile, setPracticeProfile] = useState<PracticeProfile | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);

  const [recognition, setRecognition] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const promptDropdownRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);
  const pendingResponseStartIndexRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [fileContext, setFileContext] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedContextFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const contextFileInputRef = useRef<HTMLInputElement | null>(null);

  const [promptTab, setPromptTab] = useState<PromptCategory>('clinical');
  const [openPromptDropdown, setOpenPromptDropdown] = useState<PromptCategory | null>(null);
  const [lastPromptId, setLastPromptId] = useState("");

  const getContextFileType = (name: string): UploadedContextFile['fileType'] => {
    const lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (/\.(png|jpg|jpeg|webp|gif|bmp)$/i.test(lower)) return 'image';
    return 'other';
  };

  const processContextFiles = async (files: File[]) => {
    if (files.length === 0) return;

    for (const file of files) {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const pending: UploadedContextFile = {
        id,
        name: file.name,
        uploadedAt: new Date().toISOString(),
        extractedText: '',
        fileType: getContextFileType(file.name),
        inContext: true,
        status: 'uploading'
      };

      setUploadedFiles((prev) => [pending, ...prev]);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/analyze-image', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        const extracted = (data?.result || data?.text || '').trim();

        setUploadedFiles((prev) => prev.map((item) => (
          item.id === id
            ? {
                ...item,
                status: extracted ? 'ready' : 'error',
                extractedText: extracted,
                error: extracted ? undefined : 'Kein verwertbarer Text erkannt.'
              }
            : item
        )));

        if (extracted) {
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: `Datei ${file.name} analysiert und dem Kontext hinzugefügt.` }
          ]);
        }
      } catch (err) {
        console.error(err);
        setUploadedFiles((prev) => prev.map((item) => (
          item.id === id
            ? { ...item, status: 'error', error: 'Analyse fehlgeschlagen.' }
            : item
        )));
      }
    }
  };

  const removeContextFile = (id: string) => {
    setUploadedFiles((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const contextText = next
        .filter((item) => item.inContext && item.status === 'ready' && item.extractedText.trim())
        .map((item) => item.extractedText)
        .join('\n\n');
      setFileContext(contextText);
      return next;
    });
  };

  const toggleContextFile = (id: string) => {
    setUploadedFiles((prev) => {
      const next = prev.map((item) => item.id === id ? { ...item, inContext: !item.inContext } : item);
      const contextText = next
        .filter((item) => item.inContext && item.status === 'ready' && item.extractedText.trim())
        .map((item) => item.extractedText)
        .join('\n\n');
      setFileContext(contextText);
      return next;
    });
  };

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
    const resolveMembership = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.push('/');
        return;
      }

      setCurrentUser(authData.user);

      const { data, error } = await supabase
        .from('practice_memberships')
        .select('practice_id, role, created_at')
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) {
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
    };

    resolveMembership();
  }, [router]);

  useEffect(() => {
    const loadPracticeProfile = async () => {
      if (!activePracticeId) {
        setPracticeProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("practice_settings")
        .select("practice_name, address, phone, email, logo_data_url")
        .eq('practice_id', activePracticeId)
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
  }, [activePracticeId]);

  const applyQuickPrompt = (entry: { id: string; prompt: string }) => {
    if (loading) return;
    setLastPromptId(entry.id);
    localStorage.setItem("vetmind_last_prompt_id", entry.id);
    void sendMessage(entry.prompt);
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
    structure: null,
    scope: 'private',
    practice_id: null
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
  if (!activePracticeId) {
    setCases([]);
    return;
  }

  const { data } = await supabase
    .from("cases")
    .select("*, patient:patients(id, name, tierart, rasse, alter, geschlecht, external_id)")
    .eq('practice_id', activePracticeId)
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

  if (!activePracticeId) {
    setSelectedPatientConsultations([]);
    return;
  }

  const { data, error } = await supabase
    .from('cases')
    .select('id, title, result, transcript, created_at')
    .eq('patient_id', patient.id)
    .eq('practice_id', activePracticeId)
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

const getPromptTemplatesForCategory = (category: PromptCategory) =>
  templatesDB.filter((t: any) => normalizeTemplateCategory(t?.category) === category);

const activePromptTemplates = openPromptDropdown ? getPromptTemplatesForCategory(openPromptDropdown) : [];

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

useEffect(() => {
  const handleOutsideClick = (event: MouseEvent) => {
    if (!promptDropdownRef.current) return;
    if (!promptDropdownRef.current.contains(event.target as Node)) {
      setOpenPromptDropdown(null);
    }
  };

  document.addEventListener('mousedown', handleOutsideClick);
  return () => document.removeEventListener('mousedown', handleOutsideClick);
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
    if (loading) return;

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

${(() => {
  const uploadedContext = uploadedFiles
    .filter((item) => item.inContext && item.status === 'ready' && item.extractedText.trim())
    .map((item) => `Datei: ${item.name}\n${item.extractedText}`)
    .join('\n\n');
  const effectiveContext = uploadedFiles.length > 0 ? uploadedContext : fileContext;
  if (!effectiveContext) return '';
  return `
DATEI-KONTEXT:

${effectiveContext}
`;
})()}
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
    const signatureName =
      currentUser?.user_metadata?.full_name ||
      (currentUser?.email ? String(currentUser.email).split("@")[0] : "") ||
      "Tierärztliches Team";

    return {
      title: promptTab === "communication" ? "Patientenbrief" : (selectedCase?.title || "Bericht"),
      date: new Date(),
      patientName: selectedCase?.patientName || "",
      ownerName,
      signatureName,
    };
  };

  const dataUrlFromBlob = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Logo konnte nicht gelesen werden."));
      reader.readAsDataURL(blob);
    });

  const buildEffectivePracticeProfile = async (): Promise<PracticeProfile> => {
    const base: PracticeProfile = {
      practiceName: practiceProfile?.practiceName?.trim() || "Tierärztezentrum Neuland",
      address: practiceProfile?.address?.trim() || "Kopernikusstraße 35, 50126 Bergheim",
      phone: practiceProfile?.phone?.trim() || "+49 2271 5885269",
      email: practiceProfile?.email?.trim() || "empfang@tzn-bergheim.de",
      logoDataUrl: practiceProfile?.logoDataUrl?.trim() || "",
    };

    if (base.logoDataUrl) return base;

    try {
      const res = await fetch("/tzn-logo.jpg", { cache: "force-cache" });
      if (res.ok) {
        const blob = await res.blob();
        const fallbackLogo = await dataUrlFromBlob(blob);
        if (fallbackLogo) {
          return { ...base, logoDataUrl: fallbackLogo };
        }
      }
    } catch {
      // Keep profile without logo if fallback load fails.
    }

    return base;
  };

  const handleCreatePdf = async () => {
    if (!result.trim()) return;

    setPdfLoading(true);
    try {
      const effectiveProfile = await buildEffectivePracticeProfile();
      generatePDF(result, getReportMetadata(), effectiveProfile);
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
      const effectiveProfile = await buildEffectivePracticeProfile();
      const { blob, filename } = createPDFBlob(result, metadata, effectiveProfile);
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
  setUploadedFiles([]);
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
      fontFamily: "Arial, sans-serif",
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
    <Button
      onClick={() => setSidebarCollapsed((v) => !v)}
      title={sidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
      variant='secondary'
      size='sm'
      style={{
        background: "#fff",
        width: "34px",
        height: "34px",
        padding: 0
      }}
    >
      {sidebarCollapsed ? "▶" : "◀"}
    </Button>
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

  <Button
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
    variant='secondary'
    style={{
      padding: "10px",
      background: "#f9fafb"
    }}
  >
    {sidebarCollapsed ? "＋" : "➕ Neuer Chat"}
  </Button>

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
      <Button
        onClick={() => renameSession(s.id)}
        variant='ghost'
        size='sm'
        style={{
          padding: "2px 6px",
          minWidth: 0
        }}
      >
        ✏️
      </Button>

      {/* ❌ DELETE */}
      <Button
        onClick={() => deleteSession(s.id)}
        variant='ghost'
        size='sm'
        style={{
          padding: "2px 6px",
          minWidth: 0
        }}
      >
        ❌
      </Button>

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
      : (selectedCase?.title || "VetMind-Workspace")}
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

          <Button
            onClick={() => {
              setSelectedChatPatient(null);
              setSelectedPatientConsultations([]);
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Patientenkontext entfernt." }
              ]);
            }}
            variant='secondary'
            size='sm'
            style={{
              background: "#fff",
              fontSize: "12px",
              padding: "4px 8px"
            }}
          >
            ✕ Entfernen
          </Button>
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
    const showAiDisclaimer = m.role === "assistant" && String(m.content || '').trim().length > 0;

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

  {showAiDisclaimer && <AiDisclaimer />}

  {/* 🔥 COPY BUTTON NUR FÜR VetMind */}
  {!isUser && (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Button
        onClick={() => navigator.clipboard.writeText(m.content)}
        variant='secondary'
        size='sm'
        style={{
          fontSize: "12px",
          padding: "4px 8px",
          background: "#fff"
        }}
      >
        📋 kopieren
      </Button>
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
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dragActive) setDragActive(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragActive(false);
          const files = Array.from(e.dataTransfer.files || []);
          await processContextFiles(files);
        }}
        onClick={() => contextFileInputRef.current?.click()}
        style={{
          marginBottom: "10px",
          border: dragActive ? "2px dashed #0F6B74" : "1px dashed #cbd5e1",
          borderRadius: "12px",
          background: dragActive ? "#ecfeff" : "#f8fafc",
          padding: "10px 12px",
          cursor: "pointer"
        }}
      >
        <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>Dateien hier ablegen oder klicken</div>
        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>PDF/Bilder werden analysiert und als Kontext nutzbar gemacht</div>
      </div>

      <input
        ref={contextFileInputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        style={{ display: "none" }}
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          await processContextFiles(files);
          e.target.value = "";
        }}
      />

      {uploadedFiles.length > 0 && (
        <div style={{ display: "grid", gap: "8px", marginBottom: "10px" }}>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                background: "#fff",
                padding: "8px 10px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{file.name}</div>
                <div style={{ fontSize: "11px", color: "#475569" }}>
                  {file.status === 'uploading' ? 'Wird analysiert ...' : file.status === 'error' ? 'Fehler' : (file.fileType === 'pdf' ? 'PDF' : file.fileType === 'image' ? 'Bild' : 'Datei')}
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    alert(file.extractedText || file.error || 'Kein Inhalt verfügbar.');
                  }}
                  variant='secondary'
                  size='sm'
                  style={{ background: "#fff", fontSize: "12px" }}
                >
                  👁 Vorschau
                </Button>

                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleContextFile(file.id);
                  }}
                  variant='secondary'
                  size='sm'
                  style={{ background: "#fff", fontSize: "12px" }}
                >
                  🧠 {file.inContext ? 'Im Kontext' : 'Nicht im Kontext'}
                </Button>

                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeContextFile(file.id);
                  }}
                  variant='secondary'
                  size='sm'
                  style={{ background: "#fff1f2", color: "#b91c1c", fontSize: "12px" }}
                >
                  🗑 löschen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

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
        <div
          style={menuItemStyle}
          onClick={() => {
            setShowMenu(false);
            contextFileInputRef.current?.click();
          }}
        >
          📎 Datei anhängen
        </div>
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
  <Button
    onClick={() => sendMessage()}
    variant='primary'
    size='sm'
    style={{
      width: "42px",
      height: "42px",
      background: brand.primary,
      color: "#fff",
      padding: 0
    }}
  >
    ➤
  </Button>

  {/* MIC */}
  <Button
    onClick={() => {
  setInput("");
  recognition?.start();
}}
    variant='secondary'
    size='sm'
    style={{
      width: "42px",
      height: "42px",
      background: "#fff",
      padding: 0
    }}
  >
    🎤
  </Button>

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
        <div ref={promptDropdownRef} style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
            {[
              { key: 'clinical', label: 'Klinisch' },
              { key: 'communication', label: 'Kommunikation' },
              { key: 'internal', label: 'Intern' }
            ].map((tab) => (
              <Button
                key={tab.key}
                onClick={() => {
                  const next = tab.key as PromptCategory;
                  setPromptTab(next);
                  setOpenPromptDropdown((prev) => (prev === next ? null : next));
                }}
                variant={openPromptDropdown === tab.key ? 'primary' : 'secondary'}
                size='sm'
                style={{
                  borderRadius: "999px",
                  fontWeight: 600,
                  background: openPromptDropdown === tab.key ? brand.primary : "#fff",
                  color: openPromptDropdown === tab.key ? "#fff" : brand.text,
                  transition: "all 0.15s ease"
                }}
              >
                {tab.label} ▾
              </Button>
            ))}

            <Button
              onClick={() => {
                setOpenPromptDropdown(null);
                setShowTemplateBuilder(true);
              }}
              variant='secondary'
              size='sm'
              style={{
                borderRadius: "999px",
                fontWeight: 600,
                background: "#fff",
                color: brand.text
              }}
            >
              ➕ Vorlage erstellen
            </Button>
          </div>

          {openPromptDropdown && (
            <div
              style={{
                position: "absolute",
                top: "44px",
                left: 0,
                minWidth: "260px",
                maxWidth: "420px",
                maxHeight: "240px",
                overflowY: "auto",
                background: "#fff",
                border: "1px solid #dbe3e9",
                borderRadius: "12px",
                boxShadow: "0 10px 26px rgba(15, 23, 42, 0.12)",
                padding: "8px",
                zIndex: 20
              }}
            >
              {activePromptTemplates.map((entry: any) => (
                <button
                  key={`db-${entry.id}`}
                  type="button"
                  onClick={() => {
                    applyQuickPrompt({ id: `db-${entry.id}`, prompt: entry.content });
                    setOpenPromptDropdown(null);
                  }}
                  title="Startet diese Vorlage sofort im Chat"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 10px",
                    borderRadius: "10px",
                    border: "none",
                    background: lastPromptId === `db-${entry.id}` ? "#eef8fa" : "transparent",
                    color: brand.text,
                    fontSize: "13px",
                    cursor: "pointer",
                    marginBottom: "4px"
                  }}
                >
                  🧾 {entry.name}
                </button>
              ))}

              {activePromptTemplates.length === 0 && (
                <div style={{ fontSize: "13px", color: brand.muted, padding: "8px 10px" }}>
                  Keine Vorlagen in dieser Kategorie.
                </div>
              )}
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

    <Button
      onClick={copy}
      variant='primary'
      style={{
        padding: "10px 14px",
        background: brand.primary,
        fontWeight: 600
      }}
    >
      📋 Kopieren
    </Button>

    <Button
      onClick={handleCreatePdf}
      disabled={pdfLoading}
      variant='secondary'
      style={actionStyle}
      title="PDF lokal speichern"
    >
      {pdfLoading ? "Speichere..." : "💾 PDF speichern"}
    </Button>

    <Button
      onClick={handleShare}
      disabled={shareLoading}
      variant='secondary'
      style={actionStyle}
      title="PDF direkt ueber Teilen-Dialog versenden (z. B. Mail)"
    >
      {shareLoading ? "Teilen..." : "📄 PDF teilen"}
    </Button>

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
            <Button
              onClick={() => setShowPatients(false)}
              variant='ghost'
              style={{ fontSize: "18px" }}
              title="Schliessen"
            >
              ✕
            </Button>
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
              <Button
                onClick={() => {
                  window.location.href = "/patienten";
                }}
                variant='secondary'
                style={{ ...actionStyle, width: "fit-content" }}
              >
                Patient erstellen
              </Button>
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
        <Button
          onClick={() => setShowTemplateBuilder(false)}
          variant='ghost'
          style={{ fontSize: "18px" }}
          title="Schliessen"
        >
          ✕
        </Button>
      </div>

      <Input
        placeholder="Name der Vorlage"
        value={newTemplateName}
        onChange={(e) => setNewTemplateName(e.target.value)}
        style={{ marginBottom: "10px" }}
      />

      <TextAreaInput
        placeholder="Inhalt / Struktur der Vorlage"
        value={newTemplateContent}
        onChange={(e) => setNewTemplateContent(e.target.value)}
        style={{ minHeight: "190px", marginBottom: "10px" }}
      />

      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <Button
          onClick={() => setShowTemplateBuilder(false)}
          variant='secondary'
          style={{ ...actionStyle, background: "#f8fafb" }}
        >
          Abbrechen
        </Button>
        <Button onClick={saveTemplate} variant='secondary' style={actionStyle}>
          💾 Speichern
        </Button>
      </div>
    </div>
  </div>
)}
    </div>
    </div>
</main>
  );
}