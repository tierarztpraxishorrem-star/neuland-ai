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
  const [dbReady, setDbReady] = useState(false);
  const savingRef = useRef(false);

  const [fileContext, setFileContext] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedContextFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const contextFileInputRef = useRef<HTMLInputElement | null>(null);

  const [promptTab, setPromptTab] = useState<PromptCategory>('clinical');
  const [openPromptDropdown, setOpenPromptDropdown] = useState<PromptCategory | null>(null);
  const [lastPromptId, setLastPromptId] = useState("");

  const [ttsOpen, setTtsOpen] = useState(false);
  const [ttsText, setTtsText] = useState("");
  const [ttsVoice, setTtsVoice] = useState<"alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer">("nova");
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const ttsAudioUrlRef = useRef<string | null>(null);

  const TTS_VOICES: Array<{ value: typeof ttsVoice; label: string; hint: string }> = [
    { value: "nova", label: "Nova", hint: "Natürlich, professionell" },
    { value: "alloy", label: "Alloy", hint: "Neutral, ausgewogen" },
    { value: "echo", label: "Echo", hint: "Männlich, klar" },
    { value: "onyx", label: "Onyx", hint: "Männlich, tief" },
    { value: "shimmer", label: "Shimmer", hint: "Weich, freundlich" },
    { value: "fable", label: "Fable", hint: "Britisch, ausdrucksstark" },
  ];

  useEffect(() => () => {
    if (ttsAudioUrlRef.current) URL.revokeObjectURL(ttsAudioUrlRef.current);
  }, []);

  // ───── SharePoint state ─────
  type SpResult = {
    id: string;
    driveId?: string;
    itemId?: string;
    name: string;
    url: string;
    summary?: string;
    lastModified?: string;
    fileType: string;
  };
  const [spOpen, setSpOpen] = useState(false);
  const [spQuery, setSpQuery] = useState("");
  const [spLoading, setSpLoading] = useState(false);
  const [spError, setSpError] = useState<string | null>(null);
  const [spResults, setSpResults] = useState<SpResult[]>([]);
  const [spInsertingId, setSpInsertingId] = useState<string | null>(null);
  const [spEditItem, setSpEditItem] = useState<SpResult | null>(null);
  const [spEditContent, setSpEditContent] = useState("");
  const [spEditLoading, setSpEditLoading] = useState(false);
  const [spEditSaving, setSpEditSaving] = useState(false);
  const [spEditError, setSpEditError] = useState<string | null>(null);
  const [spEditInfo, setSpEditInfo] = useState<string | null>(null);

  const spFetch = async (url: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = new Headers(init?.headers);
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
    return fetch(url, { ...init, headers });
  };

  const handleSpSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = spQuery.trim();
    if (!q) return;
    setSpError(null);
    setSpLoading(true);
    try {
      const res = await spFetch("/api/sharepoint/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler bei der Suche.");
      setSpResults(data.results || []);
    } catch (err) {
      setSpError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSpLoading(false);
    }
  };

  const handleSpBrowseRoot = async () => {
    setSpError(null);
    setSpLoading(true);
    try {
      const res = await spFetch("/api/sharepoint/files");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dateien konnten nicht geladen werden.");
      type DriveItemLike = {
        id?: string;
        name?: string;
        size?: number;
        webUrl?: string;
        lastModifiedDateTime?: string;
        folder?: { childCount?: number };
        parentReference?: { driveId?: string };
      };
      const items = (data.items || []) as DriveItemLike[];
      const mapped: SpResult[] = items.map((item) => {
        const name = item.name || "Unbenannt";
        const isFolder = Boolean(item.folder);
        return {
          id: item.id || name,
          driveId: item.parentReference?.driveId,
          itemId: item.id,
          name,
          url: item.webUrl || "",
          fileType: isFolder ? "folder" : (name.split(".").pop() || "").toLowerCase(),
          lastModified: item.lastModifiedDateTime,
          summary: isFolder ? "📁 Ordner" : undefined,
        };
      });
      setSpResults(mapped);
    } catch (err) {
      setSpError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSpLoading(false);
    }
  };

  const handleSpInsert = async (result: SpResult) => {
    if (!result.driveId || !result.itemId) {
      setSpError("driveId/itemId fehlt – diese Datei kann nicht geladen werden.");
      return;
    }
    setSpInsertingId(result.id);
    setSpError(null);
    try {
      const url = `/api/sharepoint/files/${encodeURIComponent(result.itemId)}?driveId=${encodeURIComponent(result.driveId)}`;
      const res = await spFetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dateiinhalt konnte nicht geladen werden.");
      const text = String(data.text || "").slice(0, 20000);
      const message = `[SharePoint: ${result.name}]\n${text}`;
      setMessages((prev) => [...prev, { role: "user", content: message }]);
    } catch (err) {
      setSpError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSpInsertingId(null);
    }
  };

  const openSpEdit = async (result: SpResult) => {
    if (!result.driveId || !result.itemId) {
      setSpError("driveId/itemId fehlt.");
      return;
    }
    setSpEditItem(result);
    setSpEditContent("");
    setSpEditError(null);
    setSpEditInfo(null);
    setSpEditLoading(true);
    try {
      const url = `/api/sharepoint/files/${encodeURIComponent(result.itemId)}?driveId=${encodeURIComponent(result.driveId)}`;
      const res = await spFetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dateiinhalt konnte nicht geladen werden.");
      setSpEditContent(String(data.text || ""));
    } catch (err) {
      setSpEditError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSpEditLoading(false);
    }
  };

  const saveSpEdit = async () => {
    if (!spEditItem?.driveId || !spEditItem.itemId) return;
    setSpEditSaving(true);
    setSpEditError(null);
    try {
      const res = await spFetch(`/api/sharepoint/files/${encodeURIComponent(spEditItem.itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveId: spEditItem.driveId, content: spEditContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen.");
      setSpEditInfo("Gespeichert.");
      setTimeout(() => setSpEditItem(null), 800);
    } catch (err) {
      setSpEditError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSpEditSaving(false);
    }
  };

  const improveSpEditWithAi = () => {
    if (!spEditItem) return;
    const instruction = `Hier ist der Inhalt von [SharePoint: ${spEditItem.name}]. Bitte verbessere den Text (Klarheit, Rechtschreibung, Struktur) und gib nur den überarbeiteten Text zurück:\n\n${spEditContent}`;
    setMessages((prev) => [...prev, { role: "user", content: instruction }]);
    setSpEditItem(null);
  };

  const takeLastAssistantText = () => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m && m.role === "assistant" && typeof m.content === "string" && m.content.trim().length > 0) {
        const plain = m.content.replace(/[*_`#>\-]{1,}/g, "").trim();
        setTtsText(plain.slice(0, 4096));
        setTtsError(null);
        return;
      }
    }
    setTtsError("Noch keine KI-Antwort im Chat vorhanden.");
  };

  const generateTts = async () => {
    const trimmed = ttsText.trim();
    if (!trimmed) {
      setTtsError("Bitte Text eingeben.");
      return;
    }
    if (trimmed.length > 4096) {
      setTtsError(`Text ist zu lang (${trimmed.length} / 4096 Zeichen).`);
      return;
    }
    setTtsError(null);
    setTtsLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, voice: ttsVoice, speed: ttsSpeed }),
      });
      if (!res.ok) {
        let message = `Fehler ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {}
        throw new Error(message);
      }
      const blob = await res.blob();
      if (ttsAudioUrlRef.current) URL.revokeObjectURL(ttsAudioUrlRef.current);
      const url = URL.createObjectURL(blob);
      ttsAudioUrlRef.current = url;
      setTtsAudioUrl(url);

      const a = document.createElement("a");
      a.href = url;
      a.download = `vetmind-${Date.now()}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler";
      setTtsError(msg);
    } finally {
      setTtsLoading(false);
    }
  };

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
    primary: uiTokens.brand,
    border: '#E5E7EB',
    text: uiTokens.textPrimary,
    muted: uiTokens.textSecondary,
    bg: uiTokens.pageBackground,
    card: uiTokens.cardBackground,
    sidebarBg: '#ffffff',
    sidebarBorder: '#e5e7eb',
    sidebarText: '#1f2937',
    sidebarMuted: '#94a3b8',
    sidebarActive: 'rgba(15,107,116,0.08)',
    sidebarHover: '#f8fafc',
    userBubble: 'linear-gradient(135deg, #0f6b74 0%, #0d5c64 100%)',
    aiBubble: uiTokens.cardBackground,
    inputBg: uiTokens.cardBackground,
    shadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
    shadowLg: '0 8px 32px rgba(15, 23, 42, 0.10)',
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
    void sendMessage(entry.prompt);
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
      // Consume immediately so re-opening VetMind starts fresh
      localStorage.removeItem("vetmind_context");
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
  if (!activeSessionId || !dbReady) return;
  if (messages.length <= 1) return;
  if (savingRef.current) return;

  setSessions((prev) => {
    const updated = prev.map((s) =>
      s.id === activeSessionId ? { ...s, messages } : s
    );
    return updated;
  });

  // Debounced save to Supabase
  const timeout = setTimeout(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      // Delete old messages for this session, re-insert all
      await supabase.from('vetmind_messages').delete().eq('session_id', activeSessionId);
      const rows = messages.map((m, i) => ({
        session_id: activeSessionId,
        role: m.role,
        content: m.content || '',
        created_at: new Date(Date.now() + i).toISOString()
      }));
      if (rows.length > 0) {
        await supabase.from('vetmind_messages').insert(rows);
      }
    } catch (err) {
      console.error('VetMind: Fehler beim Speichern der Nachrichten', err);
    } finally {
      savingRef.current = false;
    }
  }, 1200);

  return () => clearTimeout(timeout);
}, [messages, activeSessionId, dbReady]);

useEffect(() => {
  if (!activeSessionId || !dbReady) return;

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
    return updated;
  });

  // Save patient context to Supabase
  const timeout = setTimeout(async () => {
    await supabase
      .from('vetmind_sessions')
      .update({
        chat_patient: selectedChatPatient,
        chat_patient_consultations: selectedPatientConsultations
      })
      .eq('id', activeSessionId);
  }, 800);

  return () => clearTimeout(timeout);
}, [selectedChatPatient, selectedPatientConsultations, activeSessionId, dbReady]);

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

// 📥 Sessions aus Supabase laden (+ einmalige localStorage-Migration)
useEffect(() => {
  if (!currentUser || !activePracticeId) return;

  const loadSessions = async () => {
    // 1. Einmalig localStorage-Sessions nach Supabase migrieren
    const localRaw = localStorage.getItem("vetmind_sessions");
    if (localRaw) {
      try {
        const localSessions = JSON.parse(localRaw);
        if (Array.isArray(localSessions) && localSessions.length > 0) {
          for (const ls of localSessions) {
            const { data: inserted } = await supabase
              .from('vetmind_sessions')
              .insert({
                user_id: currentUser.id,
                practice_id: activePracticeId,
                title: ls.title || 'Neuer Chat',
                chat_patient: ls.chatPatient || null,
                chat_patient_consultations: ls.chatPatientConsultations || [],
                last_opened_at: ls.lastOpenedAt || new Date().toISOString(),
                created_at: ls.lastOpenedAt || new Date().toISOString()
              })
              .select('id')
              .single();

            if (inserted && Array.isArray(ls.messages) && ls.messages.length > 0) {
              const msgRows = ls.messages.map((m: any, i: number) => ({
                session_id: inserted.id,
                role: m.role || 'user',
                content: m.content || '',
                created_at: new Date(Date.now() + i).toISOString()
              }));
              await supabase.from('vetmind_messages').insert(msgRows);
            }
          }
          localStorage.removeItem("vetmind_sessions");
          console.log(`VetMind: ${localSessions.length} Sessions aus localStorage migriert.`);
        }
      } catch (err) {
        console.error('VetMind: localStorage-Migration fehlgeschlagen', err);
      }
    }

    // 2. Sessions aus Supabase laden
    const { data: dbSessions, error } = await supabase
      .from('vetmind_sessions')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('last_opened_at', { ascending: false });

    if (error) {
      console.error('VetMind: Sessions laden fehlgeschlagen', error);
      setDbReady(true);
      return;
    }

    // 3. Messages für alle Sessions laden
    const sessionIds = (dbSessions || []).map((s: any) => s.id);
    let allMessages: any[] = [];
    if (sessionIds.length > 0) {
      const { data: msgs } = await supabase
        .from('vetmind_messages')
        .select('*')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: true });
      allMessages = msgs || [];
    }

    // 4. Sessions mit Messages zusammenführen
    const sessionsWithMessages = (dbSessions || []).map((s: any) => ({
      id: s.id,
      title: s.title,
      lastOpenedAt: s.last_opened_at,
      chatPatient: s.chat_patient,
      chatPatientConsultations: s.chat_patient_consultations || [],
      messages: allMessages
        .filter((m: any) => m.session_id === s.id)
        .map((m: any) => ({ role: m.role, content: m.content }))
    }));

    setSessions(sessionsWithMessages);

    if (sessionsWithMessages.length > 0) {
      setActiveSessionId(sessionsWithMessages[0].id);
      setMessages(sessionsWithMessages[0].messages);
      setSelectedChatPatient(sessionsWithMessages[0].chatPatient || null);
      setSelectedPatientConsultations(sessionsWithMessages[0].chatPatientConsultations || []);
    }

    setDbReady(true);
  };

  loadSessions();
}, [currentUser, activePracticeId]);

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
      // Save title to Supabase
      supabase
        .from('vetmind_sessions')
        .update({ title: nextTitle })
        .eq('id', activeSessionId)
        .then();
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
const deleteSession = async (id: string) => {
  // Delete from Supabase (messages cascade automatically)
  await supabase.from('vetmind_sessions').delete().eq('id', id);

  const updated = sessions.filter((s) => s.id !== id);
  setSessions(updated);

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
    return updated;
  });
  supabase.from('vetmind_sessions').update({ last_opened_at: now }).eq('id', id).then();
};

const renameSession = async (id: string) => {
  const newTitle = prompt("Neuen Titel eingeben:");

  if (!newTitle) return;

  const updated = sessions.map((s) =>
    s.id === id ? { ...s, title: newTitle } : s
  );

  setSessions(updated);
  await supabase.from('vetmind_sessions').update({ title: newTitle }).eq('id', id);
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
  const menuItemStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
    color: brand.text,
    transition: "background 0.12s ease",
  };

  return (
    <main style={{
      display: "flex",
      height: "100vh",
      background: brand.bg,
      fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
      color: brand.text,
    }}>

{/* ═══════════════ SIDEBAR ═══════════════ */}
<div style={{
  width: sidebarCollapsed ? "72px" : "280px",
  background: brand.sidebarBg,
  padding: sidebarCollapsed ? "16px 10px" : "20px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
  borderRight: `1px solid ${brand.sidebarBorder}`,
  boxShadow: "1px 0 8px rgba(15, 23, 42, 0.04)",
  overflow: "hidden",
}}>

  {/* Sidebar Header */}
  <div style={{
    display: "flex",
    justifyContent: sidebarCollapsed ? "center" : "space-between",
    alignItems: "center",
    marginBottom: "8px",
  }}>
    {!sidebarCollapsed && (
      <div style={{
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: brand.sidebarMuted,
      }}>
        Gespräche
      </div>
    )}
    <button
      onClick={() => setSidebarCollapsed((v) => !v)}
      title={sidebarCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        width: "32px",
        height: "32px",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: brand.sidebarMuted,
        fontSize: "14px",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {sidebarCollapsed ? "›" : "‹"}
    </button>
  </div>

  {/* Search */}
  {!sidebarCollapsed && (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      borderRadius: "10px",
      padding: "8px 10px",
      background: "#f8fafc",
      border: `1px solid ${brand.sidebarBorder}`,
      marginBottom: "4px",
    }}>
      <span style={{ fontSize: "12px", color: brand.sidebarMuted, flexShrink: 0 }}>🔍</span>
      <input
        value={chatSearch}
        onChange={(e) => setChatSearch(e.target.value)}
        placeholder="Suchen..."
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: "13px",
          color: brand.sidebarText,
        }}
      />
    </div>
  )}

  {/* New Chat Button */}
  <button
    onClick={async () => {
      if (!currentUser) return;
      resetChat();
      const now = new Date().toISOString();

      const { data: inserted } = await supabase
        .from('vetmind_sessions')
        .insert({
          user_id: currentUser.id,
          practice_id: activePracticeId,
          title: 'Neuer Chat',
          last_opened_at: now
        })
        .select('id')
        .single();

      if (!inserted) return;

      const newSession = {
        id: inserted.id,
        title: "Neuer Chat",
        lastOpenedAt: now,
        chatPatient: null,
        chatPatientConsultations: [],
        messages: [
          { role: "assistant", content: "Neuer Chat gestartet. Wie kann ich helfen?" }
        ]
      };

      await supabase.from('vetmind_messages').insert({
        session_id: inserted.id,
        role: 'assistant',
        content: 'Neuer Chat gestartet. Wie kann ich helfen?'
      });

      const updated = [newSession, ...sessions];
      setSessions(updated);
      setActiveSessionId(newSession.id);
      setMessages(newSession.messages);
    }}
    style={{
      padding: sidebarCollapsed ? "10px" : "10px 14px",
      borderRadius: "10px",
      border: `1px solid ${brand.sidebarBorder}`,
      background: "rgba(15,107,116,0.08)",
      color: brand.primary,
      fontWeight: 600,
      fontSize: "13px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      transition: "background 0.15s ease",
      marginBottom: "4px",
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15,107,116,0.14)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(15,107,116,0.08)'; }}
  >
    <span style={{ fontSize: "16px" }}>＋</span>
    {!sidebarCollapsed && "Neuer Chat"}
  </button>

  {/* Session List */}
  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px", marginTop: "4px" }}>
    {!sidebarCollapsed && filteredSessions.map((s) => (
      <div
        key={s.id}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 10px",
          borderRadius: "10px",
          background: s.id === activeSessionId ? brand.sidebarActive : "transparent",
          borderLeft: s.id === activeSessionId ? `3px solid ${brand.primary}` : "3px solid transparent",
          transition: "all 0.15s ease",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (s.id !== activeSessionId) e.currentTarget.style.background = brand.sidebarHover;
        }}
        onMouseLeave={(e) => {
          if (s.id !== activeSessionId) e.currentTarget.style.background = 'transparent';
        }}
      >
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
            fontSize: "13px",
            color: s.id === activeSessionId ? brand.primary : brand.sidebarText,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "170px",
          }}
        >
          {trimForList(s.title || "Neuer Chat")}
        </div>

        {s.id === activeSessionId && (
          <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
            <button
              onClick={(e) => { e.stopPropagation(); renameSession(s.id); }}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
                fontSize: "12px",
                borderRadius: "6px",
                color: brand.sidebarMuted,
              }}
              title="Umbenennen"
            >
              ✏️
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
                fontSize: "12px",
                borderRadius: "6px",
                color: brand.sidebarMuted,
              }}
              title="Löschen"
            >
              🗑
            </button>
          </div>
        )}
      </div>
    ))}

    {sidebarCollapsed && filteredSessions.slice(0, 8).map((s) => (
      <button
        key={s.id}
        onClick={() => {
          setActiveSessionId(s.id);
          setMessages(s.messages);
          setSelectedChatPatient(s.chatPatient || null);
          setSelectedPatientConsultations(s.chatPatientConsultations || []);
          touchSession(s.id);
        }}
        title={s.title || "Neuer Chat"}
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "10px",
          border: "none",
          background: s.id === activeSessionId ? brand.sidebarActive : "transparent",
          color: s.id === activeSessionId ? "#fff" : brand.sidebarMuted,
          fontSize: "14px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto",
          transition: "background 0.15s ease",
        }}
      >
        💬
      </button>
    ))}

    {!sidebarCollapsed && filteredSessions.length === 0 && (
      <div style={{ fontSize: "12px", color: brand.sidebarMuted, padding: "12px 8px", textAlign: "center" }}>
        Keine Chats gefunden
      </div>
    )}
  </div>
</div>

{/* ═══════════════ MAIN CONTENT ═══════════════ */}
<div style={{
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  background: brand.bg,
}}>

  {/* Header Bar */}
  <div style={{
    padding: "16px 32px",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    background: "rgba(255,255,255,0.80)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }}>
    <div>
      <div style={{
        fontSize: "18px",
        fontWeight: 700,
        color: brand.primary,
        letterSpacing: "-0.01em",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <span style={{
          width: "28px",
          height: "28px",
          borderRadius: "8px",
          background: `linear-gradient(135deg, ${brand.primary} 0%, #0d5c64 100%)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "14px",
          color: "#fff",
        }}>🧠</span>
        VetMind
      </div>
      <div style={{ fontSize: "12px", color: brand.muted, marginTop: "2px" }}>
        {selectedCase?.patientName
          ? `${selectedCase.patientName}${selectedCase?.external_id ? ` (#${selectedCase.external_id})` : ""}`
          : (selectedCase?.title || "KI-Assistent für dein Praxisteam")}
      </div>
    </div>

    {/* Context Chips */}
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      {selectedCase && (
        <div style={{
          padding: "4px 10px",
          borderRadius: "999px",
          background: "rgba(15,107,116,0.08)",
          border: "1px solid rgba(15,107,116,0.15)",
          fontSize: "12px",
          fontWeight: 600,
          color: brand.primary,
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}>
          📄 Fall geladen
        </div>
      )}
      {selectedChatPatient && (
        <div style={{
          padding: "4px 10px",
          borderRadius: "999px",
          background: "rgba(15,107,116,0.08)",
          border: "1px solid rgba(15,107,116,0.15)",
          fontSize: "12px",
          fontWeight: 600,
          color: brand.primary,
          display: "flex",
          alignItems: "center",
          gap: "4px",
        }}>
          🐾 {selectedChatPatient.name}
          <button
            onClick={() => {
              setSelectedChatPatient(null);
              setSelectedPatientConsultations([]);
              setMessages((prev) => [...prev, { role: "assistant", content: "Patientenkontext entfernt." }]);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: brand.muted,
              fontSize: "12px",
              padding: "0 0 0 2px",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  </div>

  {/* Chat + Input Area */}
  <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

    {/* Context Bars */}
    <div style={{ padding: "0 32px" }}>
      {selectedCase && (
        <div style={{
          margin: "16px 0 0",
          padding: "12px 16px",
          background: "#fff",
          borderRadius: uiTokens.radiusCard,
          border: uiTokens.cardBorder,
          boxShadow: brand.shadow,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              width: "24px",
              height: "24px",
              borderRadius: "6px",
              background: "rgba(15,107,116,0.08)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
            }}>📋</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: "13px", color: brand.text }}>
                {selectedCase.patientName
                  ? `${selectedCase.patientName}${selectedCase?.external_id ? ` (#${selectedCase.external_id})` : ""}`
                  : (selectedCase.title || "Geladener Fall")}
              </div>
              {(selectedCase.tierart || selectedCase.rasse || selectedCase.alter) && (
                <div style={{ fontSize: "12px", color: brand.muted, marginTop: "1px" }}>
                  {[selectedCase.tierart, selectedCase.rasse, selectedCase.alter].filter(Boolean).join(" · ")}
                  {formatCaseDate(selectedCase.created_at || selectedCase.createdAt) ? ` · ${formatCaseDate(selectedCase.created_at || selectedCase.createdAt)}` : ""}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* ═══════════════ CHAT MESSAGES ═══════════════ */}
    <div
      ref={chatScrollRef}
      onScroll={handleChatScroll}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 32px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {messages.filter(m => m.role !== "system").map((m, i) => {
        const isUser = m.role === "user";
        const isEditableResultMessage = !isUser && !loading && i === messages.length - 1 && Boolean(result);
        const showAiDisclaimer = m.role === "assistant" && String(m.content || '').trim().length > 0;

        return (
          <div
            key={i}
            data-message-index={i}
            style={{
              display: "flex",
              justifyContent: isUser ? "flex-end" : "flex-start",
              gap: "10px",
              alignItems: "flex-start",
            }}
          >
            {/* AI Avatar */}
            {!isUser && (
              <div style={{
                width: "30px",
                height: "30px",
                borderRadius: "10px",
                background: `linear-gradient(135deg, ${brand.primary} 0%, #0d5c64 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                flexShrink: 0,
                marginTop: "2px",
                boxShadow: "0 2px 8px rgba(15,107,116,0.2)",
              }}>
                🧠
              </div>
            )}

            <div style={{
              maxWidth: "72%",
              width: isEditableResultMessage ? "72%" : "auto",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}>
              {/* Message Bubble */}
              <div style={{
                width: isEditableResultMessage ? "100%" : "auto",
                padding: isEditableResultMessage ? "4px" : "12px 16px",
                borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: isUser ? brand.userBubble : brand.aiBubble,
                color: isUser ? "#fff" : brand.text,
                fontSize: "14px",
                lineHeight: "1.6",
                whiteSpace: "pre-wrap",
                boxShadow: isUser ? "0 2px 12px rgba(15,107,116,0.15)" : brand.shadow,
                border: isUser ? "none" : uiTokens.cardBorder,
              }}>
                {isEditableResultMessage ? (
                  <textarea
                    value={result}
                    onChange={(e) => {
                      const value = e.target.value;
                      setResult(value);
                      setMessages((prev) => prev.map((msg, idx) => (idx === i ? { ...msg, content: value } : msg)));
                    }}
                    placeholder="Text hier anpassen..."
                    style={{
                      width: "100%",
                      minHeight: "200px",
                      resize: "vertical",
                      borderRadius: "12px",
                      border: `1px solid ${brand.border}`,
                      padding: "12px",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      color: brand.text,
                      background: "#fff",
                    }}
                  />
                ) : (
                  renderMessageContent(String(m.content || ''))
                )}
              </div>

              {showAiDisclaimer && <AiDisclaimer />}

              {/* Copy & Actions for AI messages */}
              {!isUser && String(m.content || '').trim().length > 20 && (
                <div style={{ display: "flex", gap: "6px", justifyContent: "flex-start" }}>
                  <button
                    onClick={() => navigator.clipboard.writeText(m.content)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "11px",
                      color: brand.muted,
                      padding: "3px 6px",
                      borderRadius: "6px",
                      fontWeight: 500,
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = brand.text; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = brand.muted as string; }}
                  >
                    📋 Kopieren
                  </button>
                </div>
              )}
            </div>

            {/* User Avatar */}
            {isUser && (
              <div style={{
                width: "30px",
                height: "30px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                flexShrink: 0,
                marginTop: "2px",
              }}>
                👤
              </div>
            )}
          </div>
        );
      })}

      {/* Loading Indicator */}
      {loading && (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <div style={{
            width: "30px",
            height: "30px",
            borderRadius: "10px",
            background: `linear-gradient(135deg, ${brand.primary} 0%, #0d5c64 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            flexShrink: 0,
            boxShadow: "0 2px 8px rgba(15,107,116,0.2)",
          }}>
            🧠
          </div>
          <div style={{
            padding: "12px 16px",
            borderRadius: "16px 16px 16px 4px",
            background: "#fff",
            border: uiTokens.cardBorder,
            boxShadow: brand.shadow,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <span style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: brand.primary,
              animation: "vetmind-pulse 1.2s ease-in-out infinite",
            }} />
            <span style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: brand.primary,
              animation: "vetmind-pulse 1.2s ease-in-out 0.2s infinite",
              opacity: 0.7,
            }} />
            <span style={{
              display: "inline-block",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: brand.primary,
              animation: "vetmind-pulse 1.2s ease-in-out 0.4s infinite",
              opacity: 0.4,
            }} />
          </div>
          <style>{`@keyframes vetmind-pulse { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.1); } }`}</style>
        </div>
      )}

      <div ref={chatEndRef} />
    </div>

    {/* ═══════════════ INPUT AREA ═══════════════ */}
    <div style={{
      padding: "0 32px 20px",
      background: `linear-gradient(180deg, transparent 0%, ${brand.bg} 20%)`,
    }}>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                borderRadius: "10px",
                background: "#fff",
                border: uiTokens.cardBorder,
                fontSize: "12px",
              }}
            >
              <span style={{ fontWeight: 600, color: brand.text }}>{file.name}</span>
              <span style={{ color: brand.muted, fontSize: "11px" }}>
                {file.status === 'uploading' ? '⏳' : file.status === 'error' ? '❌' : '✓'}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleContextFile(file.id); }}
                style={{
                  background: file.inContext ? "rgba(15,107,116,0.08)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "11px",
                  color: file.inContext ? brand.primary : brand.muted,
                  padding: "2px 6px",
                  borderRadius: "6px",
                  fontWeight: 600,
                }}
              >
                {file.inContext ? '🧠 Aktiv' : '🧠 Inaktiv'}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); removeContextFile(file.id); }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "#b91c1c",
                  padding: "0 2px",
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Composer */}
      <div style={{
        background: "#fff",
        borderRadius: "16px",
        border: uiTokens.cardBorder,
        boxShadow: brand.shadowLg,
        overflow: "visible",
        position: "relative",
      }}>
        {/* Drag & Drop Zone (subtle, inside composer) */}
        <div
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!dragActive) setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
          onDrop={async (e) => {
            e.preventDefault(); e.stopPropagation(); setDragActive(false);
            const files = Array.from(e.dataTransfer.files || []);
            await processContextFiles(files);
          }}
          style={{
            display: dragActive ? "flex" : "none",
            padding: "16px",
            background: "rgba(15,107,116,0.04)",
            borderBottom: `1px dashed ${brand.primary}`,
            alignItems: "center",
            justifyContent: "center",
            fontSize: "13px",
            color: brand.primary,
            fontWeight: 600,
          }}
        >
          Dateien hier ablegen
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Frage stellen, Bericht diktieren, E-Mail erstellen..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); if (!dragActive) setDragActive(true); }}
          style={{
            width: "100%",
            padding: "16px 18px 8px",
            border: "none",
            outline: "none",
            fontSize: "14px",
            resize: "none",
            minHeight: "52px",
            maxHeight: "140px",
            lineHeight: "1.5",
            overflowY: "auto",
            background: "transparent",
            color: brand.text,
          }}
        />

        {/* Input Toolbar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px 10px",
          borderTop: "1px solid rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {/* + Menu */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "10px",
                  border: "none",
                  background: showMenu ? "rgba(15,107,116,0.08)" : "transparent",
                  cursor: "pointer",
                  fontSize: "18px",
                  color: brand.muted,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.12s ease",
                }}
                title="Kontext anhängen"
              >
                ＋
              </button>

              {showMenu && (
                <div style={{
                  position: "absolute",
                  bottom: "42px",
                  left: 0,
                  background: "#fff",
                  border: uiTokens.cardBorder,
                  borderRadius: "12px",
                  boxShadow: brand.shadowLg,
                  padding: "6px",
                  width: "220px",
                  zIndex: 10,
                }}>
                  <div
                    style={menuItemStyle}
                    onClick={async () => { await loadCases(); setShowCases(true); setShowPatients(false); setShowMenu(false); }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    📄 Konsultation anhängen
                  </div>
                  <div
                    style={menuItemStyle}
                    onClick={async () => { await loadPatients(); setShowPatients(true); setShowCases(false); setShowMenu(false); }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    🐾 Patient anhängen
                  </div>
                  <div
                    style={menuItemStyle}
                    onClick={() => { setShowMenu(false); contextFileInputRef.current?.click(); }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    📎 Datei anhängen
                  </div>
                </div>
              )}
            </div>

            {/* File Upload */}
            <button
              onClick={() => contextFileInputRef.current?.click()}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "16px",
                color: brand.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Datei hochladen"
            >
              📎
            </button>

            {/* Mic */}
            <button
              onClick={() => { setInput(""); recognition?.start(); }}
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: "16px",
                color: brand.muted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Diktat starten"
            >
              🎤
            </button>
          </div>

          {/* Send */}
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              border: "none",
              background: (loading || !input.trim()) ? "#e2e8f0" : `linear-gradient(135deg, ${brand.primary} 0%, #0d5c64 100%)`,
              cursor: (loading || !input.trim()) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
              boxShadow: (loading || !input.trim()) ? "none" : "0 2px 8px rgba(15,107,116,0.25)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: "rotate(-45deg)" }}>
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke={loading || !input.trim() ? "#94a3b8" : "#fff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
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

      {/* Prompt Templates */}
      <div style={{ marginTop: "10px" }}>
        <div ref={promptDropdownRef} style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {[
              { key: 'clinical', label: 'Klinisch', icon: '🩺' },
              { key: 'communication', label: 'Kommunikation', icon: '✉️' },
              { key: 'internal', label: 'Intern', icon: '📋' },
            ].map((tab) => {
              const isActive = openPromptDropdown === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    const next = tab.key as PromptCategory;
                    setPromptTab(next);
                    setOpenPromptDropdown((prev) => (prev === next ? null : next));
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "999px",
                    border: isActive ? `1px solid ${brand.primary}` : "1px solid #e2e8f0",
                    background: isActive ? "rgba(15,107,116,0.08)" : "#fff",
                    color: isActive ? brand.primary : brand.muted,
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              );
            })}

            <button
              onClick={() => { setOpenPromptDropdown(null); setShowTemplateBuilder(true); }}
              style={{
                padding: "6px 12px",
                borderRadius: "999px",
                border: "1px dashed #cbd5e1",
                background: "transparent",
                color: brand.muted,
                fontWeight: 600,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              ＋ Vorlage
            </button>
          </div>

          {openPromptDropdown && (
            <div style={{
              position: "absolute",
              bottom: "40px",
              left: 0,
              minWidth: "260px",
              maxWidth: "380px",
              maxHeight: "220px",
              overflowY: "auto",
              background: "#fff",
              border: uiTokens.cardBorder,
              borderRadius: "12px",
              boxShadow: brand.shadowLg,
              padding: "6px",
              zIndex: 20,
            }}>
              {activePromptTemplates.map((entry: any) => (
                <button
                  key={`db-${entry.id}`}
                  type="button"
                  onClick={() => {
                    applyQuickPrompt({ id: `db-${entry.id}`, prompt: entry.content });
                    setOpenPromptDropdown(null);
                  }}
                  title="Vorlage im Chat ausführen"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 10px",
                    borderRadius: "10px",
                    border: "none",
                    background: lastPromptId === `db-${entry.id}` ? "rgba(15,107,116,0.06)" : "transparent",
                    color: brand.text,
                    fontSize: "13px",
                    cursor: "pointer",
                    marginBottom: "2px",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = lastPromptId === `db-${entry.id}` ? 'rgba(15,107,116,0.06)' : 'transparent'; }}
                >
                  🧾 {entry.name}
                </button>
              ))}

              {activePromptTemplates.length === 0 && (
                <div style={{ fontSize: "12px", color: brand.muted, padding: "10px", textAlign: "center" }}>
                  Keine Vorlagen in dieser Kategorie
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      {result && (
        <div style={{
          marginTop: "10px",
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
        }}>
          <Button onClick={copy} variant='primary' size='sm' style={{ borderRadius: "10px", fontWeight: 600 }}>
            {copied ? "✓ Kopiert" : "📋 Kopieren"}
          </Button>
          <Button onClick={handleCreatePdf} disabled={pdfLoading} variant='secondary' size='sm' style={{ borderRadius: "10px" }}>
            {pdfLoading ? "⏳ Speichere..." : "💾 PDF"}
          </Button>
          <Button onClick={handleShare} disabled={shareLoading} variant='secondary' size='sm' style={{ borderRadius: "10px" }}>
            {shareLoading ? "⏳ Teilen..." : "↗ Teilen"}
          </Button>
        </div>
      )}

      {/* ═══════════════ TEXT-TO-SPEECH ═══════════════ */}
      <div className="mt-3 bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setTtsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span>🔊</span>
            <span>Text zu Sprache</span>
          </span>
          <span className={`text-gray-400 transition-transform ${ttsOpen ? "rotate-180" : ""}`}>▾</span>
        </button>

        {ttsOpen && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <div className="relative">
              <textarea
                value={ttsText}
                onChange={(e) => {
                  const next = e.target.value.slice(0, 4096);
                  setTtsText(next);
                  if (ttsError) setTtsError(null);
                }}
                placeholder="Text eingeben oder aus Chat übernehmen..."
                className="w-full min-h-[110px] p-3 pr-16 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0f6b74] focus:ring-2 focus:ring-[#0f6b74]/15 resize-y"
              />
              <div className="absolute bottom-2 right-3 text-xs text-gray-400 pointer-events-none">
                {ttsText.length} / 4096
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <span className="font-semibold">Stimme</span>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value as typeof ttsVoice)}
                  className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#0f6b74]"
                >
                  {TTS_VOICES.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label} – {v.hint}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-xs text-gray-600 flex-1 min-w-[220px]">
                <span className="font-semibold">Tempo</span>
                <input
                  type="range"
                  min={0.75}
                  max={1.5}
                  step={0.05}
                  value={ttsSpeed}
                  onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                  className="flex-1 accent-[#0f6b74]"
                />
                <span className="w-12 text-right tabular-nums">{ttsSpeed.toFixed(2)}x</span>
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={takeLastAssistantText}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-[#0f6b74] hover:text-[#0f6b74] transition-colors"
              >
                📥 Aus letzter KI-Antwort übernehmen
              </button>
              <button
                type="button"
                onClick={generateTts}
                disabled={ttsLoading || !ttsText.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0f6b74] hover:bg-[#0d5c64] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                {ttsLoading ? "⏳ Wird generiert..." : "🎙️ Generieren & Herunterladen"}
              </button>
            </div>

            {ttsError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {ttsError}
              </div>
            )}

            {ttsAudioUrl && !ttsLoading && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                <div className="text-xs text-gray-500 mb-2">Vorschau</div>
                <audio controls src={ttsAudioUrl} className="w-full" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════ SHAREPOINT ═══════════════ */}
      <div className="mt-3 bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setSpOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span>📂</span>
            <span>SharePoint</span>
          </span>
          <span className={`text-gray-400 transition-transform ${spOpen ? "rotate-180" : ""}`}>▾</span>
        </button>

        {spOpen && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <form onSubmit={handleSpSearch} className="flex gap-2">
              <input
                type="text"
                value={spQuery}
                onChange={(e) => setSpQuery(e.target.value)}
                placeholder="🔍 Suchen in SharePoint..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0f6b74] focus:ring-2 focus:ring-[#0f6b74]/15"
              />
              <button
                type="submit"
                disabled={spLoading || !spQuery.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0f6b74] hover:bg-[#0d5c64] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {spLoading ? "Sucht..." : "Suchen"}
              </button>
              <button
                type="button"
                onClick={handleSpBrowseRoot}
                disabled={spLoading}
                className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-[#0f6b74] hover:text-[#0f6b74] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                title="Alle Dateien im Root-Ordner anzeigen"
              >
                📁 Durchsuchen
              </button>
            </form>

            {spError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {spError}
              </div>
            )}

            {!spLoading && spResults.length === 0 && !spError && spQuery && (
              <div className="text-xs text-gray-500">
                {`Keine Treffer für „${spQuery}“.`}
                <span className="block mt-1 text-gray-400">
                  Tipp: Versuche einzelne Schlüsselwörter statt des ganzen Dateinamens, oder nutze die Schaltfläche „📁 Durchsuchen“ für alle Dateien.
                </span>
              </div>
            )}

            {spResults.length > 0 && (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                <div className="text-xs text-gray-500 sticky top-0 bg-white pb-1">Ergebnisse: {spResults.length}</div>
                {spResults.map((r) => (
                  <div key={r.id} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-800 truncate">
                          📄 {r.name}
                        </div>
                        {r.summary && (
                          <div
                            className="text-xs text-gray-500 mt-1 line-clamp-2"
                            dangerouslySetInnerHTML={{
                              __html: r.summary.replace(/<c0>/g, '<mark>').replace(/<\/c0>/g, '</mark>')
                            }}
                          />
                        )}
                        <div className="text-[11px] text-gray-400 mt-1">
                          {r.lastModified ? `Zuletzt geändert: ${new Date(r.lastModified).toLocaleDateString("de-DE")}` : ""}
                          {r.fileType ? ` · .${r.fileType}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => handleSpInsert(r)}
                        disabled={spInsertingId === r.id || !r.driveId}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-[#0f6b74] hover:text-[#0f6b74] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {spInsertingId === r.id ? "Lädt..." : "📥 In Chat einfügen"}
                      </button>
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-[#0f6b74] hover:text-[#0f6b74] transition-colors"
                        >
                          ↗ Öffnen
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openSpEdit(r)}
                        disabled={!r.driveId}
                        className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-[#0f6b74] hover:text-[#0f6b74] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ✎ Bearbeiten
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  </div>

  {/* ═══════════════ SHAREPOINT EDIT MODAL ═══════════════ */}
  {spEditItem && (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
      }}
      onClick={() => !spEditSaving && setSpEditItem(null)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, calc(100vw - 40px))",
          maxHeight: "82vh",
          background: "#fff",
          borderRadius: uiTokens.radiusCard,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          border: uiTokens.cardBorder,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{
          padding: "14px 18px",
          borderBottom: uiTokens.cardBorder,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: uiTokens.brand }}>
              ✎ {spEditItem.name}
            </div>
            <div style={{ fontSize: 11, color: uiTokens.textSecondary, marginTop: 2 }}>
              SharePoint · .{spEditItem.fileType}
            </div>
          </div>
          <button
            type="button"
            onClick={() => !spEditSaving && setSpEditItem(null)}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 20,
              color: uiTokens.textSecondary,
              cursor: spEditSaving ? "not-allowed" : "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 16, flex: 1, overflow: "auto", display: "grid", gap: 10 }}>
          {spEditLoading ? (
            <div style={{ fontSize: 13, color: uiTokens.textSecondary }}>Lade Inhalt…</div>
          ) : (
            <textarea
              value={spEditContent}
              onChange={(e) => setSpEditContent(e.target.value)}
              style={{
                width: "100%",
                minHeight: 340,
                padding: 12,
                borderRadius: 10,
                border: uiTokens.cardBorder,
                fontSize: 13,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                resize: "vertical",
                outline: "none",
              }}
            />
          )}
          {spEditError && (
            <div style={{ fontSize: 12, color: "#b91c1c", background: "#fff1f2", border: "1px solid #fecaca", borderRadius: 10, padding: "8px 10px" }}>
              {spEditError}
            </div>
          )}
          {spEditInfo && (
            <div style={{ fontSize: 12, color: "#166534", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "8px 10px" }}>
              {spEditInfo}
            </div>
          )}
        </div>

        <div style={{
          padding: "12px 16px",
          borderTop: uiTokens.cardBorder,
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}>
          <Button variant="ghost" onClick={improveSpEditWithAi} disabled={spEditLoading || spEditSaving}>
            ✨ Mit KI verbessern
          </Button>
          <Button variant="secondary" onClick={() => !spEditSaving && setSpEditItem(null)} disabled={spEditSaving}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={saveSpEdit} disabled={spEditLoading || spEditSaving}>
            {spEditSaving ? "Speichert…" : "Speichern"}
          </Button>
        </div>
      </div>
    </div>
  )}

  {/* ═══════════════ PANELS (Cases, Patients) ═══════════════ */}
  {showCases && (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.3)",
      backdropFilter: "blur(2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    }}
    onClick={() => setShowCases(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(600px, calc(100vw - 40px))",
          maxHeight: "70vh",
          background: "#fff",
          borderRadius: uiTokens.radiusCard,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          border: uiTokens.cardBorder,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "16px" }}>Konsultation auswählen</h3>
          <button onClick={() => setShowCases(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: brand.muted }}>✕</button>
        </div>
        <div style={{ padding: "12px 20px 0" }}>
          <input
            value={caseSearch}
            onChange={(e) => setCaseSearch(e.target.value)}
            placeholder="Suche nach Patient, Titel..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "10px",
              border: uiTokens.cardBorder,
              fontSize: "14px",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
          {filteredCases.map((c: any, i: number) => {
            const lineOne = c.patientName
              ? `${c.patientName}${c.external_id ? ` (#${c.external_id})` : ""} – ${c.title || "Konsultation"}`
              : (c.title || "Unbenannte Konsultation");
            const lineTwo = [formatCaseDateTime(c.created_at) || "-", c.category ? (categoryLabels[c.category] || c.category) : ""].filter(Boolean).join(" · ");
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
                    { role: "assistant", content: "Fall wurde geladen. Du kannst jetzt Fragen stellen." },
                    { role: "system", content: contextMessage },
                    { role: "assistant", content: `Übergebener Bericht:\n\n${c.result || ""}` },
                  ]);
                  setInput("");
                }}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  borderRadius: "10px",
                  border: selectedCaseId === c.id ? `1px solid ${brand.primary}` : "1px solid transparent",
                  background: selectedCaseId === c.id ? "rgba(15,107,116,0.06)" : "#fff",
                  marginBottom: "4px",
                  transition: "background 0.12s ease",
                }}
                onMouseEnter={(e) => { if (selectedCaseId !== c.id) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={(e) => { if (selectedCaseId !== c.id) e.currentTarget.style.background = "#fff"; }}
              >
                <div style={{ fontWeight: 600, fontSize: "13px", color: brand.text }}>{lineOne}</div>
                <div style={{ fontSize: "12px", color: brand.muted, marginTop: "2px" }}>{lineTwo}</div>
                {c.preview && <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px" }}>{c.preview}</div>}
              </div>
            );
          })}
          {filteredCases.length === 0 && (
            <div style={{ color: brand.muted, fontSize: "13px", textAlign: "center", padding: "20px" }}>
              Keine passenden Konsultationen gefunden.
            </div>
          )}
        </div>
      </div>
    </div>
  )}

  {showPatients && (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.3)",
      backdropFilter: "blur(2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 100,
    }}
    onClick={() => setShowPatients(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(600px, calc(100vw - 40px))",
          maxHeight: "70vh",
          background: "#fff",
          borderRadius: uiTokens.radiusCard,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          border: uiTokens.cardBorder,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "16px" }}>Patient auswählen</h3>
          <button onClick={() => setShowPatients(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: brand.muted }}>✕</button>
        </div>
        <div style={{ padding: "12px 20px 0" }}>
          <input
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Suche nach Name oder PMS-ID..."
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "10px",
              border: uiTokens.cardBorder,
              fontSize: "14px",
            }}
          />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 20px" }}>
          {patientsLoading && <div style={{ color: brand.muted, fontSize: "13px", textAlign: "center", padding: "20px" }}>Patienten werden geladen...</div>}
          
          {!patientsLoading && patients.length === 0 && (
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: "10px", padding: "20px", color: brand.muted, textAlign: "center" }}>
              <div>Noch keine Patienten vorhanden</div>
              <Button onClick={() => { window.location.href = "/patienten"; }} variant='secondary' size='sm' style={{ marginTop: "8px", borderRadius: "10px" }}>
                Patient erstellen
              </Button>
            </div>
          )}

          {!patientsLoading && patients.length > 0 && filteredPatients.length === 0 && (
            <div style={{ color: brand.muted, fontSize: "13px", textAlign: "center", padding: "20px" }}>Keine passenden Patienten gefunden.</div>
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
                background: selectedChatPatient?.id === patient.id ? "rgba(15,107,116,0.06)" : "#fff",
                marginBottom: "4px",
                transition: "background 0.12s ease",
              }}
              onMouseEnter={(e) => { if (selectedChatPatient?.id !== patient.id) e.currentTarget.style.background = "#f8fafc"; }}
              onMouseLeave={(e) => { if (selectedChatPatient?.id !== patient.id) e.currentTarget.style.background = "#fff"; }}
            >
              <div style={{ fontWeight: 600, fontSize: "13px", color: brand.text }}>
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
      </div>
    </div>
  )}

  {/* Template Builder Modal */}
  {showTemplateBuilder && (
    <div
      onClick={() => setShowTemplateBuilder(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.36)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 120,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          background: "#fff",
          padding: "24px",
          borderRadius: uiTokens.radiusCard,
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          border: uiTokens.cardBorder,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ margin: 0, fontSize: "16px" }}>Neue Vorlage erstellen</h3>
          <button onClick={() => setShowTemplateBuilder(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: brand.muted }}>✕</button>
        </div>

        <Input
          placeholder="Name der Vorlage"
          value={newTemplateName}
          onChange={(e) => setNewTemplateName(e.target.value)}
          style={{ marginBottom: "12px" }}
        />

        <TextAreaInput
          placeholder="Inhalt / Struktur der Vorlage"
          value={newTemplateContent}
          onChange={(e) => setNewTemplateContent(e.target.value)}
          style={{ minHeight: "180px", marginBottom: "16px" }}
        />

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Button onClick={() => setShowTemplateBuilder(false)} variant='secondary' size='sm' style={{ borderRadius: "10px" }}>
            Abbrechen
          </Button>
          <Button onClick={saveTemplate} variant='primary' size='sm' style={{ borderRadius: "10px" }}>
            Speichern
          </Button>
        </div>
      </div>
    </div>
  )}
</div>
</main>
  );
}