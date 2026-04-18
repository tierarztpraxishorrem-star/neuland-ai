'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { uiTokens, Card, Button, Input, Section } from '../../../components/ui/System';
import { showToast } from '../../../lib/toast';
import { ArrowLeft, FileDown, ShieldCheck, Plus, X, AlertTriangle, CheckCircle, Info, Pencil, Trash2 } from 'lucide-react';

type Patient = {
  id: string;
  patient_name: string;
  patient_number: string | null;
  species: string | null;
  breed: string | null;
  gender: string | null;
  birth_date: string | null;
  weight_kg: number | null;
  owner_name: string | null;
  box_number: string | null;
  station_day: number;
  admission_date: string;
  diagnosis: string | null;
  problems: string | null;
  cave: boolean;
  cave_details: string | null;
  has_collar: boolean;
  has_iv_catheter: boolean;
  iv_catheter_location: string | null;
  iv_catheter_date: string | null;
  diet_type: string | null;
  diet_notes: string | null;
  dnr: boolean;
  responsible_vet: string | null;
  responsible_tfa: string | null;
  status: string;
};

type Medication = {
  id: string;
  name: string;
  dose: string;
  route: string | null;
  scheduled_hours: number[];
  frequency_label: string | null;
  is_prn: boolean;
  is_dti: boolean;
  dti_rate_ml_h: number | null;
  notes: string | null;
  sort_order: number;
  is_active: boolean;
  valid_to: string | null;
};

type Administration = {
  id: string;
  medication_id: string;
  scheduled_hour: number;
  administered_by: string;
  administered_at: string;
  status: string;
  notes: string | null;
};

type Vital = {
  id: string;
  measured_hour: number;
  heart_rate: number | null;
  resp_rate: number | null;
  temperature_c: number | null;
  pain_score: number | null;
  food_offered: boolean | null;
  food_eaten: boolean | null;
  feces_amount: string | null;
  feces_color: string | null;
  feces_consistency: string | null;
  urine: string | null;
  notes: string | null;
  recorded_by: string | null;
};

type Alert = {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  details: string | null;
  is_acknowledged: boolean;
  medication_id: string | null;
};

type CustomParam = {
  id: string;
  label: string;
  unit: string | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

type CustomValue = {
  id: string;
  param_id: string;
  measured_hour: number;
  value: string;
  recorded_by: string | null;
};

const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];

async function fetchWithAuth(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(path, { ...init, headers });
}

export default function StationSheetPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params.id as string;

  const [userRole, setUserRole] = useState<string>('member');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [patient, setPatient] = useState<Patient | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [administrations, setAdministrations] = useState<Administration[]>([]);
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [customParams, setCustomParams] = useState<CustomParam[]>([]);
  const [customValues, setCustomValues] = useState<CustomValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiChecking, setAiChecking] = useState(false);

  // Add custom param
  const [showAddParam, setShowAddParam] = useState(false);
  const [newParamLabel, setNewParamLabel] = useState('');
  const [newParamUnit, setNewParamUnit] = useState('');
  const [newParamRequired, setNewParamRequired] = useState(false);
  const [newParamSchedule, setNewParamSchedule] = useState('');

  // Administer modal
  const [adminModal, setAdminModal] = useState<{ medId: string; medName: string; hour: number } | null>(null);
  const [adminInitials, setAdminInitials] = useState('');
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  // Add medication modal
  const [showMedModal, setShowMedModal] = useState(false);
  const [medForm, setMedForm] = useState({ name: '', dose: '', route: 'i.v.', frequency_label: '3x täglich', scheduled_hours: '8,16,0', is_prn: false, is_dti: false, dti_rate_ml_h: '', ordered_by: '', notes: '' });
  const [medSubmitting, setMedSubmitting] = useState(false);

  // Add vitals modal
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({ measured_hour: new Date().getHours(), heart_rate: '', resp_rate: '', temperature_c: '', pain_score: '', urine: '', feces_amount: '', feces_consistency: '', food_eaten: '', recorded_by: '', notes: '' });
  const [vitalsSubmitting, setVitalsSubmitting] = useState(false);

  // Edit medication modal
  const [editMed, setEditMed] = useState<Medication | null>(null);
  const [editMedForm, setEditMedForm] = useState({ name: '', dose: '', route: '', frequency_label: '', scheduled_hours: '', is_prn: false, is_dti: false, dti_rate_ml_h: '', ordered_by: '', notes: '' });
  const [editMedSubmitting, setEditMedSubmitting] = useState(false);

  // AI rule feedback modal
  const [ruleModal, setRuleModal] = useState<{ medication_name: string; alert_message: string } | null>(null);
  const [ruleText, setRuleText] = useState('');
  const [ruleSubmitting, setRuleSubmitting] = useState(false);

  // Vital schedules (Mess-Zeiten)
  type VitalSchedule = { id: string; param_key: string; scheduled_hours: number[]; is_highlighted: boolean };
  const [vitalSchedules, setVitalSchedules] = useState<VitalSchedule[]>([]);
  const [scheduleEditing, setScheduleEditing] = useState<string | null>(null); // param_key being edited
  const [scheduleHoursInput, setScheduleHoursInput] = useState('');

  // Daily checklist
  type DailyTask = { id: string; label: string; is_default: boolean; sort_order: number; checked: boolean; checked_at: string | null; checked_by: string | null; check_id: string | null; notes: string | null };
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [dailyTasksLoading, setDailyTasksLoading] = useState(false);
  const [newTaskLabel, setNewTaskLabel] = useState('');

  // Handoff (Schichtübergabe)
  const [handoffs, setHandoffs] = useState<Array<{ id: string; shift_label: string | null; transcript: string; recorded_by: string | null; created_at: string }>>([]);
  const [handoffRecording, setHandoffRecording] = useState(false);
  const handoffRecorderRef = useRef<MediaRecorder | null>(null);
  const handoffChunksRef = useRef<Blob[]>([]);
  const [handoffTranscribing, setHandoffTranscribing] = useState(false);
  const [handoffText, setHandoffText] = useState('');
  const [handoffSaving, setHandoffSaving] = useState(false);

  // Admin info popup
  const [adminInfo, setAdminInfo] = useState<Administration | null>(null);

  // Load user role + display name
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('practice_memberships').select('role, display_name').eq('user_id', user.id).limit(1).single();
      if (data?.role) setUserRole(data.role);
      if (data?.display_name) setUserDisplayName(data.display_name);
    })();
  }, []);

  const isAdmin = userRole === 'admin' || userRole === 'owner';
  const isGroupleader = userRole === 'groupleader';
  const [userDisplayName, setUserDisplayName] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}`);
      if (!res.ok) { router.push('/station'); return; }
      const data = await res.json();
      setPatient(data.patient);
      setMedications(data.medications || []);
      setAlerts(data.alerts || []);
      setCustomParams(data.custom_params || []);
      // Vitals, Administrations, CustomValues werden vom selectedDate-useEffect gesteuert
    } catch { showToast({ message: 'Fehler beim Laden.', type: 'error' }); } finally { setLoading(false); }
  }, [patientId, router]);

  // Zusätzliche Daten laden (neue Features)
  const loadExtras = useCallback(async () => {
    // Vital schedules
    fetchWithAuth(`/api/station/patients/${patientId}/vital-schedule`)
      .then((r) => r.json())
      .then((d) => { if (d.schedules) setVitalSchedules(d.schedules); })
      .catch(() => {});
    // Daily tasks
    setDailyTasksLoading(true);
    fetchWithAuth(`/api/station/patients/${patientId}/daily-tasks`)
      .then((r) => r.json())
      .then((d) => { if (d.tasks) setDailyTasks(d.tasks); })
      .catch(() => {})
      .finally(() => setDailyTasksLoading(false));
    // Handoffs
    fetchWithAuth(`/api/station/patients/${patientId}/handoff`)
      .then((r) => r.json())
      .then((d) => { if (d.handoffs) setHandoffs(d.handoffs); })
      .catch(() => {});
  }, [patientId]);

  useEffect(() => { loadData(); loadExtras(); }, [loadData, loadExtras]);

  // Reload vitals + tasks + administrations when selectedDate changes
  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = selectedDate === todayStr;

  // Lade tagesabhängige Daten (Vitals, Tasks, Administrations, CustomValues)
  const loadDayData = useCallback(async (date: string) => {
    if (!patientId) return;
    const today = new Date().toISOString().slice(0, 10);
    const viewing = date;

    // Vitals für gewählten Tag
    fetchWithAuth(`/api/station/patients/${patientId}/vitals?date=${viewing}`)
      .then((r) => r.json())
      .then((d) => setVitals(d.vitals || []))
      .catch(() => setVitals([]));

    // Tasks für gewählten Tag
    fetchWithAuth(`/api/station/patients/${patientId}/daily-tasks?date=${viewing}`)
      .then((r) => r.json())
      .then((d) => { if (d.tasks) setDailyTasks(d.tasks); })
      .catch(() => {});

    // Administrations + CustomValues
    fetchWithAuth(`/api/station/patients/${patientId}`)
      .then((r) => r.json())
      .then((d) => {
        const allAdmins: Administration[] = d.administrations || [];
        if (viewing !== today) {
          const dayStart = `${viewing}T00:00:00`;
          const dayEnd = `${viewing}T23:59:59`;
          setAdministrations(allAdmins.filter(a => a.administered_at >= dayStart && a.administered_at <= dayEnd));
        } else {
          setAdministrations(allAdmins);
        }
        setCustomValues(d.custom_values || []);
      })
      .catch(() => {});
  }, [patientId]);

  useEffect(() => { loadDayData(selectedDate); }, [selectedDate, loadDayData]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`station-sheet-${patientId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'station_med_administrations', filter: `station_patient_id=eq.${patientId}` }, () => { loadData(); loadDayData(selectedDate); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [patientId, loadData]);

  const handleAdminister = async () => {
    if (!adminModal || !adminInitials.trim()) return;
    setAdminSubmitting(true);
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/administer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medication_id: adminModal.medId, scheduled_hour: adminModal.hour, administered_by: adminInitials.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { showToast({ message: data.error || 'Fehler', type: 'error' }); return; }
      showToast({ message: 'Abgezeichnet!', type: 'success' });
      setAdminModal(null);
      setAdminInitials('');
      loadData();
    } catch { showToast({ message: 'Fehler beim Abzeichnen.', type: 'error' }); } finally { setAdminSubmitting(false); }
  };

  const handleAddMed = async () => {
    if (!medForm.name.trim() || !medForm.dose.trim()) return;
    setMedSubmitting(true);
    try {
      const scheduled_hours = medForm.is_prn || medForm.is_dti
        ? []
        : medForm.scheduled_hours.split(',').map(h => parseInt(h.trim())).filter(h => !isNaN(h));
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/medications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...medForm,
          scheduled_hours,
          dti_rate_ml_h: medForm.dti_rate_ml_h ? parseFloat(medForm.dti_rate_ml_h) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast({ message: data.error || 'Fehler', type: 'error' }); return; }
      showToast({ message: 'Medikament hinzugefügt!', type: 'success' });
      setShowMedModal(false);
      setMedForm({ name: '', dose: '', route: 'i.v.', frequency_label: '3x täglich', scheduled_hours: '8,16,0', is_prn: false, is_dti: false, dti_rate_ml_h: '', ordered_by: '', notes: '' });
      loadData();
    } catch { showToast({ message: 'Fehler.', type: 'error' }); } finally { setMedSubmitting(false); }
  };

  const openEditMed = (med: Medication) => {
    setEditMed(med);
    setEditMedForm({
      name: med.name,
      dose: med.dose,
      route: med.route || '',
      frequency_label: med.frequency_label || '',
      scheduled_hours: med.scheduled_hours.join(','),
      is_prn: med.is_prn,
      is_dti: med.is_dti,
      dti_rate_ml_h: med.dti_rate_ml_h ? String(med.dti_rate_ml_h) : '',
      ordered_by: '',
      notes: med.notes || '',
    });
  };

  const handleEditMed = async () => {
    if (!editMed || !editMedForm.name.trim() || !editMedForm.dose.trim()) return;
    setEditMedSubmitting(true);
    try {
      const scheduled_hours = editMedForm.is_prn || editMedForm.is_dti
        ? []
        : editMedForm.scheduled_hours.split(',').map(h => parseInt(h.trim())).filter(h => !isNaN(h));
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/medications/${editMed.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editMedForm,
          scheduled_hours,
          dti_rate_ml_h: editMedForm.dti_rate_ml_h ? parseFloat(editMedForm.dti_rate_ml_h) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast({ message: data.error || 'Fehler', type: 'error' }); return; }
      showToast({ message: 'Medikament aktualisiert!', type: 'success' });
      setEditMed(null);
      loadData();
    } catch { showToast({ message: 'Fehler.', type: 'error' }); } finally { setEditMedSubmitting(false); }
  };

  const handleDeleteMed = async (med: Medication) => {
    if (!confirm(`${med.name} wirklich deaktivieren?`)) return;
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/medications/${med.id}`, { method: 'DELETE' });
      if (!res.ok) { showToast({ message: 'Fehler beim Deaktivieren.', type: 'error' }); return; }
      showToast({ message: `${med.name} deaktiviert.`, type: 'success' });
      loadData();
    } catch { showToast({ message: 'Fehler.', type: 'error' }); }
  };

  const handleAddVitals = async () => {
    setVitalsSubmitting(true);
    try {
      const body: Record<string, unknown> = { measured_hour: vitalsForm.measured_hour, recorded_by: vitalsForm.recorded_by || null, notes: vitalsForm.notes || null };
      if (vitalsForm.heart_rate) body.heart_rate = parseInt(vitalsForm.heart_rate);
      if (vitalsForm.resp_rate) body.resp_rate = parseInt(vitalsForm.resp_rate);
      if (vitalsForm.temperature_c) body.temperature_c = parseFloat(vitalsForm.temperature_c);
      if (vitalsForm.pain_score) body.pain_score = parseInt(vitalsForm.pain_score);
      if (vitalsForm.urine) body.urine = vitalsForm.urine;
      if (vitalsForm.feces_amount) body.feces_amount = vitalsForm.feces_amount;
      if (vitalsForm.feces_consistency) body.feces_consistency = vitalsForm.feces_consistency;
      if (vitalsForm.food_eaten) body.food_eaten = vitalsForm.food_eaten === 'ja';
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/vitals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { showToast({ message: data.error || 'Fehler', type: 'error' }); return; }

      // Custom-Parameter-Werte aus dem Formular mitschicken
      const hour = vitalsForm.measured_hour;
      const formAny = vitalsForm as unknown as Record<string, string>;
      for (const cp of customParams.filter(c => c.is_active)) {
        const val = formAny[`custom_${cp.id}`];
        if (val && val.trim()) {
          handleAddCustomValue(cp.id, hour, val.trim());
        }
      }

      showToast({ message: 'Messung gespeichert!', type: 'success' });
      setShowVitalsModal(false);
      setVitalsForm({ measured_hour: new Date().getHours(), heart_rate: '', resp_rate: '', temperature_c: '', pain_score: '', urine: '', feces_amount: '', feces_consistency: '', food_eaten: '', recorded_by: '', notes: '' });
      loadDayData(selectedDate);
    } catch { showToast({ message: 'Fehler.', type: 'error' }); } finally { setVitalsSubmitting(false); }
  };

  const handleAiCheck = async () => {
    setAiChecking(true);
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/ai-check`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { showToast({ message: data.error || 'Fehler', type: 'error' }); return; }
      showToast({ message: data.alerts?.length ? `${data.alerts.length} Warnungen gefunden` : 'Keine Auffälligkeiten!', type: data.alerts?.length ? 'error' : 'success' });
      loadData();
    } catch { showToast({ message: 'KI-Prüfung fehlgeschlagen.', type: 'error' }); } finally { setAiChecking(false); }
  };

  const handleSaveRule = async () => {
    if (!ruleModal || !ruleText.trim()) return;
    setRuleSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/station/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medication_name: ruleModal.medication_name, rule_text: ruleText.trim() }),
      });
      if (!res.ok) { showToast({ message: 'Fehler beim Speichern.', type: 'error' }); return; }
      showToast({ message: 'Regel gespeichert! Wird bei zukünftigen Prüfungen berücksichtigt.', type: 'success' });
      setRuleModal(null);
      setRuleText('');
    } catch { showToast({ message: 'Fehler.', type: 'error' }); } finally { setRuleSubmitting(false); }
  };

  const handleAddCustomParam = async () => {
    if (!newParamLabel.trim()) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const scheduledHours = newParamSchedule
        .split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n) && n >= 0 && n <= 23);
      const { error } = await supabase.from('station_vital_params').insert({
        station_patient_id: patientId,
        practice_id: (await supabase.from('station_patients').select('practice_id').eq('id', patientId).single()).data?.practice_id,
        label: newParamLabel.trim(),
        unit: newParamUnit.trim() || null,
        is_required: newParamRequired,
        scheduled_hours: scheduledHours,
      });
      if (error) { showToast({ message: 'Fehler.', type: 'error' }); return; }
      showToast({ message: 'Parameter hinzugefügt!', type: 'success' });
      setShowAddParam(false);
      setNewParamLabel('');
      setNewParamUnit('');
      setNewParamRequired(false);
      setNewParamSchedule('');
      loadData();
    } catch { showToast({ message: 'Fehler.', type: 'error' }); }
  };

  const handleAddCustomValue = async (paramId: string, hour: number, value: string) => {
    if (!value.trim()) return;
    try {
      const { error } = await supabase.from('station_vital_custom_values').insert({
        param_id: paramId,
        station_patient_id: patientId,
        practice_id: (await supabase.from('station_patients').select('practice_id').eq('id', patientId).single()).data?.practice_id,
        measured_hour: hour,
        value: value.trim(),
      });
      if (!error) loadData();
    } catch { /* ignore */ }
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await supabase.from('station_ai_alerts').update({ is_acknowledged: true, acknowledged_at: new Date().toISOString() }).eq('id', alertId);
      loadData();
    } catch { /* ignore */ }
  };

  const handlePdf = async () => {
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/pdf`);
      if (!res.ok) { showToast({ message: 'PDF-Fehler.', type: 'error' }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stationsblatt_${patient?.patient_name || 'patient'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { showToast({ message: 'PDF-Fehler.', type: 'error' }); }
  };

  const handleDischarge = async () => {
    if (!confirm(`${patient?.patient_name} wirklich entlassen?`)) return;
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}`, { method: 'DELETE' });
      if (res.ok) { showToast({ message: 'Patient entlassen.', type: 'success' }); router.push('/station'); }
    } catch { showToast({ message: 'Fehler.', type: 'error' }); }
  };

  const handleDischargePdf = async () => {
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/discharge-summary`);
      if (!res.ok) { showToast({ message: 'PDF-Fehler.', type: 'error' }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `entlassungsbericht_${patient?.patient_name || 'patient'}.pdf`; a.click(); URL.revokeObjectURL(url);
    } catch { showToast({ message: 'PDF-Fehler.', type: 'error' }); }
  };

  // Daily task handlers
  const handleCheckTask = async (taskId: string, initials?: string, notes?: string) => {
    try {
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/daily-tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, checked_by: initials || null, notes: notes || null }),
      });
      if (res.ok) loadExtras();
    } catch { /* ignore */ }
  };

  const handleUncheckTask = async (checkId: string) => {
    try {
      await fetchWithAuth(`/api/station/patients/${patientId}/daily-tasks?check_id=${checkId}`, { method: 'DELETE' });
      loadExtras();
    } catch { /* ignore */ }
  };

  const handleAddTask = async () => {
    if (!newTaskLabel.trim()) return;
    try {
      await fetchWithAuth(`/api/station/patients/${patientId}/daily-tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newTaskLabel.trim() }),
      });
      setNewTaskLabel('');
      loadExtras();
    } catch { /* ignore */ }
  };

  // Vital schedule handler
  const handleSetVitalSchedule = async (paramKey: string, hours: number[]) => {
    try {
      await fetchWithAuth(`/api/station/patients/${patientId}/vital-schedule`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ param_key: paramKey, scheduled_hours: hours, is_highlighted: hours.length > 0 }),
      });
      loadExtras();
    } catch { /* ignore */ }
  };

  // Handoff voice handler
  const startHandoffRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      handoffChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) handoffChunksRef.current.push(e.data); };
      recorder.onstop = () => { stream.getTracks().forEach((t) => t.stop()); };
      handoffRecorderRef.current = recorder;
      recorder.start(1000);
      setHandoffRecording(true);
    } catch {
      showToast({ message: 'Mikrofon-Zugriff fehlgeschlagen.', type: 'error' });
    }
  };

  const stopHandoffRecording = async () => {
    const recorder = handoffRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') { setHandoffRecording(false); return; }
    setHandoffRecording(false);
    setHandoffTranscribing(true);
    await new Promise<void>((resolve) => {
      recorder.onstop = () => { recorder.stream?.getTracks().forEach((t) => t.stop()); resolve(); };
      recorder.stop();
    });
    const blob = new Blob(handoffChunksRef.current, { type: 'audio/webm' });
    if (blob.size < 1000) { setHandoffTranscribing(false); showToast({ message: 'Aufnahme zu kurz.', type: 'error' }); return; }
    try {
      const form = new FormData();
      form.append('audio', blob, 'handoff.webm');
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/handoff`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Fehler');
      showToast({ message: 'Übergabe-Notiz gespeichert.', type: 'success' });
      loadExtras();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Fehler.', type: 'error' });
    } finally {
      setHandoffTranscribing(false);
    }
  };

  const saveHandoffText = async () => {
    if (!handoffText.trim()) return;
    setHandoffSaving(true);
    try {
      const initials = userDisplayName ? userDisplayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4) : '';
      const res = await fetchWithAuth(`/api/station/patients/${patientId}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: handoffText.trim(), recorded_by: initials }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Fehler'); }
      showToast({ message: 'Übergabe-Notiz gespeichert.', type: 'success' });
      setHandoffText('');
      loadExtras();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Fehler.', type: 'error' });
    } finally {
      setHandoffSaving(false);
    }
  };

  if (loading) return <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: uiTokens.pagePadding }}><Card><p style={{ textAlign: 'center', padding: '40px', color: uiTokens.textSecondary }}>Lade Stationsblatt...</p></Card></main>;
  if (!patient) return null;

  const currentHour = new Date().getHours();
  const unacknowledgedAlerts = alerts.filter(a => !a.is_acknowledged);
  const hasBeenChecked = alerts.length > 0 || medications.length === 0;
  const needsCheck = medications.length > 0 && !hasBeenChecked;

  // Rule permissions: who can create "Für uns OK" rules
  const isResponsibleVet = patient?.responsible_vet && userDisplayName && patient.responsible_vet.toLowerCase() === userDisplayName.toLowerCase();
  const canCreateRule = isAdmin || isGroupleader || isResponsibleVet;
  const canCreateCriticalRule = isAdmin;

  return (
    <main style={{ minHeight: '100vh', background: uiTokens.pageBackground, padding: '16px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/station"><Button variant="ghost" size="sm"><ArrowLeft size={16} /></Button></Link>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: uiTokens.textPrimary }}>{patient.patient_name}</h1>
            <span style={{ background: '#f1f5f9', borderRadius: '8px', padding: '4px 10px', fontSize: '13px', color: uiTokens.textSecondary, fontWeight: 600 }}>BOX {patient.box_number || '–'}</span>
            {/* Tage-Navigation */}
            {(() => {
              const totalDays = patient.station_day || 1;
              const admDate = new Date(patient.admission_date + 'T12:00:00');
              return (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {Array.from({ length: totalDays }, (_, i) => {
                    const dayNum = i + 1;
                    const dayDate = new Date(admDate);
                    dayDate.setDate(dayDate.getDate() + i);
                    const dateStr = dayDate.toISOString().slice(0, 10);
                    const isSelected = selectedDate === dateStr;
                    return (
                      <button
                        key={dayNum}
                        onClick={(e) => { e.preventDefault(); setSelectedDate(dateStr); }}
                        style={{
                          padding: '4px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: isSelected ? 700 : 400,
                          background: isSelected ? uiTokens.brand : '#f1f5f9',
                          color: isSelected ? '#fff' : uiTokens.textSecondary,
                          border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                        }}
                      >
                        <span>Tag {dayNum}</span>
                        <span style={{ fontSize: '10px', opacity: 0.75 }}>
                          {dayDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="ghost" size="sm" onClick={handlePdf} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FileDown size={16} /> PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDischarge} style={{ color: '#dc2626' }}>Entlassen</Button>
          </div>
        </div>

        {/* Patient info strip */}
        <Card style={{ marginBottom: '12px', padding: '14px 20px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '14px', color: uiTokens.textSecondary }}>
            <span>{patient.species} · {patient.breed}</span>
            <span>{patient.gender}</span>
            {patient.weight_kg && <span>{patient.weight_kg} kg</span>}
            {patient.birth_date && <span>{new Date(patient.birth_date).toLocaleDateString('de-DE')}</span>}
            {patient.owner_name && <span>Besitzer: {patient.owner_name}</span>}
          </div>
          {patient.diagnosis && <div style={{ marginTop: '6px', fontSize: '14px', color: uiTokens.textPrimary }}>Diagnose: {patient.diagnosis}</div>}
          {patient.diet_type && (
            <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: '8px', background: '#fefce8', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🍽️</span>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>Diät: {patient.diet_type}</span>
                {patient.diet_notes && <span style={{ fontSize: '12px', color: '#a16207', marginLeft: '8px' }}>{patient.diet_notes}</span>}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
            {patient.cave && <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px' }}>CAVE: {patient.cave_details || 'Ja'}</span>}
            {patient.has_collar && <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '12px', padding: '3px 10px', borderRadius: '6px' }}>Halskragen</span>}
            {patient.has_iv_catheter && <span style={{ background: '#eff6ff', color: '#2563eb', fontSize: '12px', padding: '3px 10px', borderRadius: '6px' }}>Braunüle: {patient.iv_catheter_location || '–'}</span>}
            {patient.dnr && <span style={{ background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '6px' }}>DNR</span>}
          </div>
        </Card>

        {/* AI check strip */}
        <Card style={{
          marginBottom: '12px', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
          borderLeft: `4px solid ${unacknowledgedAlerts.length > 0 ? '#dc2626' : needsCheck ? '#eab308' : '#16a34a'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {unacknowledgedAlerts.length > 0 ? (
              <AlertTriangle size={18} color="#dc2626" />
            ) : needsCheck ? (
              <AlertTriangle size={18} color="#eab308" />
            ) : (
              <ShieldCheck size={18} color="#16a34a" />
            )}
            <span style={{
              fontSize: '14px', fontWeight: 600,
              color: unacknowledgedAlerts.length > 0 ? '#dc2626' : needsCheck ? '#b45309' : '#16a34a',
            }}>
              {unacknowledgedAlerts.length > 0
                ? `KI-Prüfung: ${unacknowledgedAlerts.length} Warnungen`
                : needsCheck
                  ? 'KI-Prüfung: Noch nicht geprüft'
                  : 'KI-Prüfung: Keine Auffälligkeiten'}
            </span>
          </div>
          <Button variant={needsCheck ? 'primary' : 'ghost'} size="sm" onClick={handleAiCheck} disabled={aiChecking}>
            {aiChecking ? 'Prüfe...' : needsCheck ? 'Jetzt prüfen' : 'Neu prüfen'}
          </Button>
        </Card>

        {/* Alerts */}
        {unacknowledgedAlerts.length > 0 && (
          <div style={{ display: 'grid', gap: '8px', marginBottom: '12px' }}>
            {unacknowledgedAlerts.map((a) => (
              <Card key={a.id} style={{
                padding: '12px 16px', borderLeft: `4px solid ${a.severity === 'critical' ? '#dc2626' : a.severity === 'warning' ? '#eab308' : '#3b82f6'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  {a.severity === 'critical' ? <AlertTriangle size={16} color="#dc2626" /> : a.severity === 'warning' ? <AlertTriangle size={16} color="#eab308" /> : <Info size={16} color="#3b82f6" />}
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{a.message}</span>
                </div>
                {a.details && <div style={{ fontSize: '13px', color: uiTokens.textSecondary, marginLeft: '24px' }}>{a.details}</div>}
                <div style={{ display: 'flex', gap: '8px', marginLeft: '24px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {a.severity !== 'critical' ? (
                    <button
                      onClick={() => handleAcknowledgeAlert(a.id)}
                      style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#16a34a', cursor: 'pointer' }}
                    >
                      OK, erledigt
                    </button>
                  ) : (
                    <button
                      onClick={() => { if (confirm('Diese kritische Warnung wirklich als erledigt markieren? Bitte sicherstellen, dass die Medikation korrigiert wurde.')) handleAcknowledgeAlert(a.id); }}
                      style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}
                    >
                      Korrigiert / bestätigt
                    </button>
                  )}
                  {a.severity === 'critical' ? (
                    canCreateCriticalRule && (
                      <button
                        onClick={() => {
                          if (!confirm('ACHTUNG: Diese Warnung betrifft eine potenziell gefährliche Situation. Nur als Admin-Regel anlegen, wenn Sie sich absolut sicher sind.')) return;
                          const medName = medications.find(m => m.id === a.medication_id)?.name || a.message.split(':')[0] || 'Medikament';
                          setRuleModal({ medication_name: medName, alert_message: a.message });
                          setRuleText('');
                        }}
                        style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}
                      >
                        Admin: Regel anlegen
                      </button>
                    )
                  ) : (
                    canCreateRule ? (
                      <button
                        onClick={() => {
                          const medName = medications.find(m => m.id === a.medication_id)?.name || a.message.split(':')[0] || 'Medikament';
                          setRuleModal({ medication_name: medName, alert_message: a.message });
                          setRuleText('');
                        }}
                        style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: uiTokens.textSecondary, cursor: 'pointer' }}
                      >
                        Für uns OK – Regel anlegen
                      </button>
                    ) : (
                      <span style={{ fontSize: '11px', color: uiTokens.textMuted, padding: '4px 0' }}>Regel nur durch Stationstierarzt oder Admin</span>
                    )
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Medications grid */}
        <Section title="Medikamente" actions={
          <Button variant="primary" size="sm" onClick={() => setShowMedModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={14} /> Medikament
          </Button>
        } style={{ marginBottom: '12px' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '900px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: uiTokens.textMuted, fontSize: '11px', fontWeight: 600, width: '120px' }}>Medikament</th>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: uiTokens.textMuted, fontSize: '11px', fontWeight: 600, width: '100px' }}>Dosis</th>
                  <th style={{ width: '52px' }} />
                  {HOURS.map(h => (
                    <th key={h} style={{
                      textAlign: 'center', padding: '4px 1px', color: h === currentHour ? uiTokens.brand : uiTokens.textMuted,
                      fontSize: '10px', fontWeight: h === currentHour ? 700 : 500, minWidth: '28px',
                      background: h === currentHour ? '#f0fdfa' : 'transparent', borderRadius: '4px',
                    }}>{String(h).padStart(2, '0')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {medications.filter(m => m.is_active).map((med) => (
                  <tr key={med.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 6px', fontWeight: 600, color: uiTokens.textPrimary }}>{med.name}</td>
                    <td style={{ padding: '10px 6px', color: uiTokens.textSecondary, fontSize: '12px' }}>{med.dose}</td>
                    <td style={{ padding: '4px 2px' }}>
                      <div style={{ display: 'flex', gap: '2px' }}>
                        <button onClick={() => openEditMed(med)} title="Bearbeiten" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: uiTokens.textMuted }}><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteMed(med)} title="Deaktivieren" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#dc2626' }}><Trash2 size={14} /></button>
                      </div>
                    </td>
                    {med.is_dti ? (
                      <td colSpan={HOURS.length} style={{ padding: '10px 6px', textAlign: 'center' }}>
                        <span style={{ background: '#eff6ff', color: '#2563eb', padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600 }}>
                          DTI {med.dti_rate_ml_h} ml/h
                        </span>
                      </td>
                    ) : med.is_prn ? (
                      <td colSpan={HOURS.length} style={{ padding: '10px 6px', textAlign: 'center' }}>
                        <Button variant="ghost" size="sm" onClick={() => setAdminModal({ medId: med.id, medName: med.name, hour: currentHour })}
                          style={{ fontSize: '12px', color: '#b45309' }}>
                          Bei Bedarf – Jetzt geben
                        </Button>
                      </td>
                    ) : (
                      HOURS.map(h => {
                        const isScheduled = med.scheduled_hours.includes(h);
                        const admin = administrations.find(a => a.medication_id === med.id && a.scheduled_hour === h);
                        const isOverdue = isScheduled && !admin && h <= currentHour;

                        return (
                          <td key={h} style={{ textAlign: 'center', padding: '4px 1px' }}>
                            {isScheduled ? (
                              admin ? (
                                <button
                                  onClick={() => setAdminInfo(admin)}
                                  style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: uiTokens.brand, border: 'none', cursor: 'pointer',
                                    color: '#fff', fontSize: '9px', fontWeight: 700,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                  title={`${admin.administered_by} – ${new Date(admin.administered_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                                >
                                  {admin.administered_by}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setAdminModal({ medId: med.id, medName: med.name, hour: h })}
                                  style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: isOverdue ? '#fef2f2' : '#f8fafc',
                                    border: `2px solid ${isOverdue ? '#fca5a5' : '#d1d5db'}`,
                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                  title={`${med.name} um ${h}:00 abzeichnen`}
                                />
                              )
                            ) : (
                              <span style={{ color: '#e5e7eb', fontSize: '10px' }}>–</span>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
                {/* Inactive / changed / deleted medications - strikethrough */}
                {medications.filter(m => !m.is_active).length > 0 && (
                  <tr><td colSpan={HOURS.length + 3} style={{ padding: '8px 6px', fontSize: '11px', color: uiTokens.textMuted, borderTop: '2px dashed #e5e7eb', letterSpacing: '0.5px' }}>GEÄNDERT / ABGESETZT</td></tr>
                )}
                {medications.filter(m => !m.is_active).map((med) => (
                  <tr key={med.id} style={{ borderTop: '1px solid #f1f5f9', opacity: 0.5 }}>
                    <td style={{ padding: '10px 6px', fontWeight: 600, color: uiTokens.textMuted, textDecoration: 'line-through' }}>{med.name}</td>
                    <td style={{ padding: '10px 6px', color: uiTokens.textMuted, fontSize: '12px', textDecoration: 'line-through' }}>{med.dose}</td>
                    <td style={{ padding: '4px 2px', fontSize: '10px', color: uiTokens.textMuted }}>
                      {med.valid_to ? `bis ${new Date(med.valid_to).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : 'abgesetzt'}
                    </td>
                    {med.is_dti ? (
                      <td colSpan={HOURS.length} style={{ padding: '10px 6px', textAlign: 'center' }}>
                        <span style={{ color: uiTokens.textMuted, fontSize: '12px', textDecoration: 'line-through' }}>
                          DTI {med.dti_rate_ml_h} ml/h
                        </span>
                      </td>
                    ) : (
                      HOURS.map(h => {
                        const isScheduled = (med.scheduled_hours || []).includes(h);
                        const admin = administrations.find(a => a.medication_id === med.id && a.scheduled_hour === h);
                        return (
                          <td key={h} style={{ textAlign: 'center', padding: '4px 1px' }}>
                            {admin ? (
                              <button
                                onClick={() => setAdminInfo(admin)}
                                style={{
                                  width: '28px', height: '28px', borderRadius: '50%',
                                  background: '#94a3b8', border: 'none', cursor: 'pointer',
                                  color: '#fff', fontSize: '9px', fontWeight: 700,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  opacity: 0.6,
                                }}
                                title={`${admin.administered_by} – ${new Date(admin.administered_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
                              >
                                {admin.administered_by}
                              </button>
                            ) : isScheduled ? (
                              <span style={{ color: '#d1d5db', fontSize: '10px', textDecoration: 'line-through' }}>○</span>
                            ) : (
                              <span style={{ color: '#e5e7eb', fontSize: '10px' }}>–</span>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
                {medications.length === 0 && (
                  <tr><td colSpan={HOURS.length + 3} style={{ textAlign: 'center', padding: '24px', color: uiTokens.textMuted }}>Keine Medikamente angelegt</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Vitals section */}
        <Section title="Verlauf (heute)" actions={
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button variant="ghost" size="sm" onClick={() => setShowAddParam(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
              <Plus size={14} /> Parameter
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowVitalsModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={14} /> Eintrag
            </Button>
          </div>
        }>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '700px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 6px', color: uiTokens.textMuted, fontSize: '11px', width: '80px' }}>Param.</th>
                  {HOURS.map(h => (
                    <th key={h} style={{ textAlign: 'center', padding: '4px 1px', color: h === currentHour ? uiTokens.brand : uiTokens.textMuted, fontSize: '10px', fontWeight: h === currentHour ? 700 : 500, minWidth: '28px' }}>{String(h).padStart(2, '0')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'HF', key: 'heart_rate' },
                  { label: 'AF', key: 'resp_rate' },
                  { label: 'Temp', key: 'temperature_c' },
                  { label: 'Schmerz', key: 'pain_score' },
                ].map(row => {
                  const schedule = vitalSchedules.find(s => s.param_key === row.key);
                  const scheduledHours = schedule?.scheduled_hours || [];
                  const isHighlighted = schedule?.is_highlighted || false;
                  return (
                    <tr key={row.key} style={{
                      borderTop: '1px solid #f1f5f9',
                      background: isHighlighted ? '#f0fdf4' : 'transparent',
                    }}>
                      <td
                        style={{
                          padding: '8px 6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer',
                          color: isHighlighted ? '#0f6b74' : uiTokens.textPrimary,
                        }}
                        onClick={() => {
                          if (scheduleEditing === row.key) {
                            setScheduleEditing(null);
                          } else {
                            setScheduleEditing(row.key);
                            setScheduleHoursInput(scheduledHours.join(','));
                          }
                        }}
                        title="Klicken um Mess-Zeiten zu setzen"
                      >
                        {row.label}
                        {scheduledHours.length > 0 && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#0f6b74' }}>⏰</span>}
                        {scheduleEditing === row.key && (
                          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '4px' }}>
                            <input
                              value={scheduleHoursInput}
                              onChange={(e) => setScheduleHoursInput(e.target.value)}
                              placeholder="z.B. 8,12,16,20"
                              style={{ width: '90px', padding: '3px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const hours = scheduleHoursInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 23);
                                  handleSetVitalSchedule(row.key, hours);
                                  setScheduleEditing(null);
                                }
                              }}
                            />
                            <button type="button" onClick={() => { const hrs = scheduleHoursInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 23); handleSetVitalSchedule(scheduleEditing!, hrs); setScheduleEditing(null); }} style={{ marginTop: '3px', fontSize: '9px', background: uiTokens.brand, color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer' }}>OK</button>
                          </div>
                        )}
                      </td>
                      {HOURS.map(h => {
                        const v = vitals.find(vt => vt.measured_hour === h);
                        const val = v ? (v as Record<string, unknown>)[row.key] : null;
                        const isScheduled = scheduledHours.includes(h);
                        const isOverdue = isScheduled && val == null && h < currentHour;
                        const quickEntry = () => {
                          const input = prompt(`${row.label} um ${String(h).padStart(2, '0')}:00:`);
                          if (input && input.trim()) {
                            const initials = prompt('Kürzel (2-4 Buchstaben):') || '';
                            const body: Record<string, unknown> = { measured_hour: h, recorded_by: initials || null };
                            if (row.key === 'heart_rate') body.heart_rate = parseInt(input);
                            else if (row.key === 'resp_rate') body.resp_rate = parseInt(input);
                            else if (row.key === 'temperature_c') body.temperature_c = parseFloat(input);
                            else if (row.key === 'pain_score') body.pain_score = parseInt(input);
                            fetchWithAuth(`/api/station/patients/${patientId}/vitals`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(body),
                            }).then(() => loadData()).catch(() => {});
                          }
                        };
                        return (
                          <td key={h} style={{ textAlign: 'center', padding: '4px 1px', fontSize: '12px' }}>
                            {val != null ? (
                              <span style={{
                                color: uiTokens.textPrimary,
                                background: isScheduled ? '#dcfce7' : 'transparent',
                                borderRadius: '50%',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: '26px', height: '26px', fontWeight: isScheduled ? 700 : 400,
                              }}>{String(val)}</span>
                            ) : isScheduled ? (
                              <button onClick={quickEntry} style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: '22px', height: '22px', borderRadius: '50%',
                                border: `2px solid ${isOverdue ? '#ef4444' : '#0f6b74'}`,
                                background: isOverdue ? '#fef2f2' : 'transparent',
                                fontSize: '9px', color: isOverdue ? '#ef4444' : '#0f6b74',
                                cursor: 'pointer', padding: 0,
                              }}>{isOverdue ? '!' : ''}</button>
                            ) : (
                              <button onClick={quickEntry} style={{ color: '#d1d5db', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '2px' }}>–</button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* Feces row — mit Schedule-Kringeln */}
                {(() => {
                  const fecesSchedule = vitalSchedules.find(s => s.param_key === 'feces');
                  const fecesHours = fecesSchedule?.scheduled_hours || [];
                  const fecesHL = fecesSchedule?.is_highlighted || false;
                  return (
                    <tr style={{ borderTop: '1px solid #f1f5f9', background: fecesHL ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer', color: fecesHL ? '#0f6b74' : uiTokens.textPrimary }}
                        onClick={() => { setScheduleEditing(scheduleEditing === 'feces' ? null : 'feces'); setScheduleHoursInput(fecesHours.join(',')); }}
                        title="Klicken um Mess-Zeiten zu setzen"
                      >
                        Kot{fecesHours.length > 0 && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#0f6b74' }}>⏰</span>}
                        {scheduleEditing === 'feces' && (
                          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '4px' }}>
                            <input value={scheduleHoursInput} onChange={(e) => setScheduleHoursInput(e.target.value)} placeholder="z.B. 8,16" style={{ width: '90px', padding: '3px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { const hrs = scheduleHoursInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 23); handleSetVitalSchedule('feces', hrs); setScheduleEditing(null); } }} />
                          </div>
                        )}
                      </td>
                      {HOURS.map(h => {
                        const v = vitals.find(vt => vt.measured_hour === h);
                        const val = v && (v.feces_amount || v.feces_color || v.feces_consistency) ? [v.feces_amount, v.feces_color, v.feces_consistency].filter(Boolean).join('/') : null;
                        const isScheduled = fecesHours.includes(h);
                        const isOverdue = isScheduled && !val && h < currentHour;
                        return <td key={h} style={{ textAlign: 'center', padding: '4px 1px', fontSize: '10px' }}>{val ? <span style={{ color: uiTokens.textPrimary, background: isScheduled ? '#dcfce7' : 'transparent', borderRadius: '50%', padding: '2px 4px' }}>{val}</span> : isScheduled ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${isOverdue ? '#ef4444' : '#0f6b74'}`, background: isOverdue ? '#fef2f2' : 'transparent', fontSize: '8px', color: isOverdue ? '#ef4444' : '#0f6b74' }}>{isOverdue ? '!' : ''}</span> : <span style={{ color: '#e5e7eb' }}>–</span>}</td>;
                      })}
                    </tr>
                  );
                })()}
                {/* Urine row — mit Schedule-Kringeln */}
                {(() => {
                  const urineSchedule = vitalSchedules.find(s => s.param_key === 'urine');
                  const urineHours = urineSchedule?.scheduled_hours || [];
                  const urineHL = urineSchedule?.is_highlighted || false;
                  return (
                    <tr style={{ borderTop: '1px solid #f1f5f9', background: urineHL ? '#f0fdf4' : 'transparent' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600, fontSize: '12px', cursor: 'pointer', color: urineHL ? '#0f6b74' : uiTokens.textPrimary }}
                        onClick={() => { setScheduleEditing(scheduleEditing === 'urine' ? null : 'urine'); setScheduleHoursInput(urineHours.join(',')); }}
                        title="Klicken um Mess-Zeiten zu setzen"
                      >
                        Urin{urineHours.length > 0 && <span style={{ marginLeft: '4px', fontSize: '10px', color: '#0f6b74' }}>⏰</span>}
                        {scheduleEditing === 'urine' && (
                          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '4px' }}>
                            <input value={scheduleHoursInput} onChange={(e) => setScheduleHoursInput(e.target.value)} placeholder="z.B. 8,16" style={{ width: '90px', padding: '3px 6px', fontSize: '10px', borderRadius: '4px', border: '1px solid #d1d5db' }}
                              onKeyDown={(e) => { if (e.key === 'Enter') { const hrs = scheduleHoursInput.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 23); handleSetVitalSchedule('urine', hrs); setScheduleEditing(null); } }} />
                          </div>
                        )}
                      </td>
                      {HOURS.map(h => {
                        const v = vitals.find(vt => vt.measured_hour === h);
                        const val = v?.urine || null;
                        const isScheduled = urineHours.includes(h);
                        const isOverdue = isScheduled && !val && h < currentHour;
                        return <td key={h} style={{ textAlign: 'center', padding: '4px 1px', fontSize: '10px' }}>{val ? <span style={{ color: uiTokens.textPrimary, background: isScheduled ? '#dcfce7' : 'transparent', borderRadius: '50%', padding: '2px 4px' }}>{val}</span> : isScheduled ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${isOverdue ? '#ef4444' : '#0f6b74'}`, background: isOverdue ? '#fef2f2' : 'transparent', fontSize: '8px', color: isOverdue ? '#ef4444' : '#0f6b74' }}>{isOverdue ? '!' : ''}</span> : <span style={{ color: '#e5e7eb' }}>–</span>}</td>;
                      })}
                    </tr>
                  );
                })()}
                {/* Notes row */}
                <tr style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 600, color: uiTokens.textPrimary, fontSize: '12px' }}>Notiz</td>
                  {HOURS.map(h => {
                    const v = vitals.find(vt => vt.measured_hour === h);
                    const val = v?.notes || null;
                    return (
                      <td key={h} style={{ textAlign: 'center', padding: '4px 1px', fontSize: '10px' }}>
                        {val ? (
                          <span title={val} style={{ color: uiTokens.brand, cursor: 'help', maxWidth: '28px', overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap' }}>*</span>
                        ) : (
                          <span style={{ color: '#e5e7eb' }}>–</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {/* Custom parameter rows */}
                {customParams.map(cp => (
                  <tr key={cp.id} style={{ borderTop: `1px solid ${cp.is_required ? '#fde68a' : '#f1f5f9'}`, background: cp.is_required ? '#fffbeb' : 'transparent' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 600, color: cp.is_required ? '#b45309' : uiTokens.textPrimary, fontSize: '12px' }}>
                      {cp.label}{cp.unit ? ` (${cp.unit})` : ''}{cp.is_required ? ' *' : ''}
                    </td>
                    {HOURS.map(h => {
                      const cv = customValues.find(v => v.param_id === cp.id && v.measured_hour === h);
                      return (
                        <td key={h} style={{ textAlign: 'center', padding: '4px 1px', fontSize: '11px' }}>
                          {cv ? (
                            <span style={{ color: uiTokens.textPrimary }}>{cv.value}</span>
                          ) : (
                            <button
                              onClick={() => {
                                const val = prompt(`${cp.label} um ${String(h).padStart(2, '0')}:00:`);
                                if (val) handleAddCustomValue(cp.id, h, val);
                              }}
                              style={{ color: cp.is_required ? '#eab308' : '#e5e7eb', background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px' }}
                            >
                              {cp.is_required ? '!' : '–'}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ═══ Tägliche Checkliste ═══ */}
        <Section title="Tägliche Routine" actions={
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              value={newTaskLabel}
              onChange={(e) => setNewTaskLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
              placeholder="+ Eigene Aufgabe"
              style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', width: '160px' }}
            />
            {newTaskLabel && <Button variant="primary" size="sm" onClick={handleAddTask}>+</Button>}
          </div>
        }>
          {dailyTasksLoading ? (
            <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>Laden…</div>
          ) : dailyTasks.length === 0 ? (
            <div style={{ fontSize: '13px', color: uiTokens.textSecondary }}>Keine Aufgaben definiert.</div>
          ) : (
            <div style={{ display: 'grid', gap: '6px' }}>
              {dailyTasks.map((task) => (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', borderRadius: '10px',
                  background: task.checked ? '#f0fdf4' : '#fffbeb',
                  border: `1px solid ${task.checked ? '#bbf7d0' : '#fde68a'}`,
                  transition: 'all 0.15s',
                }}>
                  <button
                    onClick={() => {
                      if (task.checked && task.check_id) {
                        handleUncheckTask(task.check_id);
                      } else {
                        const initials = prompt('Kürzel (2-4 Buchstaben):');
                        if (!initials) return;
                        // Bei Abholung-Task nach Details fragen
                        const isPickup = task.label.toLowerCase().includes('abholung');
                        let notes: string | undefined;
                        if (isPickup) {
                          notes = prompt('Abholung um welche Uhrzeit? Oder "bleibt bis [Datum]":') || undefined;
                        }
                        handleCheckTask(task.id, initials, notes);
                      }
                    }}
                    style={{
                      width: '24px', height: '24px', borderRadius: '6px', flexShrink: 0,
                      border: `2px solid ${task.checked ? '#22c55e' : '#d97706'}`,
                      background: task.checked ? '#22c55e' : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: '14px', fontWeight: 700,
                    }}
                  >
                    {task.checked ? '✓' : ''}
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: task.checked ? '#166534' : uiTokens.textPrimary, textDecoration: task.checked ? 'line-through' : 'none' }}>
                      {task.label}
                    </div>
                    {task.checked && task.checked_by && (
                      <div style={{ fontSize: '11px', color: uiTokens.textMuted }}>
                        {task.checked_by} · {new Date(task.checked_at!).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {task.notes && task.label.toLowerCase().includes('abholung') ? (
                      <div style={{ marginTop: '4px', padding: '4px 10px', borderRadius: '6px', background: '#f0fdfa', border: '1px solid #99f6e4', fontSize: '12px', fontWeight: 700, color: '#0f766e' }}>
                        🚗 {task.notes}
                      </div>
                    ) : task.notes ? (
                      <div style={{ fontSize: '11px', color: uiTokens.textMuted }}>{task.notes}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ═══ Schichtübergabe ═══ */}
        <Section title="Übergabe" actions={
          <button
            onClick={handoffRecording ? stopHandoffRecording : startHandoffRecording}
            disabled={handoffTranscribing}
            style={{
              padding: '6px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
              background: handoffRecording ? '#ef4444' : handoffTranscribing ? '#eab308' : uiTokens.brand,
              color: '#fff', border: 'none', cursor: handoffTranscribing ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {handoffTranscribing ? '⏳ Transkribiert...' : handoffRecording ? '⏹ Stopp' : '🎤 Übergabe aufnehmen'}
          </button>
        }>
          <div style={{ display: 'flex', gap: '8px', marginBottom: handoffs.length > 0 ? '12px' : '0' }}>
            <textarea
              value={handoffText}
              onChange={(e) => setHandoffText(e.target.value)}
              placeholder="Übergabe-Notiz schreiben oder einkopieren..."
              style={{
                flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db',
                fontSize: '13px', resize: 'vertical', minHeight: '60px', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={saveHandoffText}
              disabled={!handoffText.trim() || handoffSaving}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                background: handoffText.trim() ? uiTokens.brand : '#d1d5db',
                color: '#fff', border: 'none', cursor: handoffText.trim() ? 'pointer' : 'default',
                alignSelf: 'flex-end', whiteSpace: 'nowrap',
              }}
            >
              {handoffSaving ? '...' : '💾 Speichern'}
            </button>
          </div>
          {handoffs.length === 0 && !handoffText ? (
            <div style={{ fontSize: '13px', color: uiTokens.textSecondary, marginTop: '8px' }}>Noch keine Übergabe-Notizen. Mikrofon oder Texteingabe nutzen.</div>
          ) : handoffs.length === 0 ? null : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {handoffs.map((h) => (
                <div key={h.id} style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '11px', color: uiTokens.textMuted, marginBottom: '4px' }}>
                    {new Date(h.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {h.recorded_by && ` · ${h.recorded_by}`}
                    {h.shift_label && ` · ${h.shift_label}`}
                  </div>
                  <div style={{ fontSize: '13px', color: uiTokens.textPrimary, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{h.transcript}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ═══ Entlassungsbericht ═══ */}
        {patient?.status === 'discharged' && (
          <Card style={{ padding: '16px', textAlign: 'center' }}>
            <Button variant="primary" onClick={handleDischargePdf} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              📄 Entlassungsbericht herunterladen
            </Button>
          </Card>
        )}
      </div>

      {/* MODALS */}

      {/* Administer modal */}
      {adminModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setAdminModal(null)}>
          <Card style={{ maxWidth: '360px', width: '100%', padding: '24px' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px' }}>Medikament abzeichnen</h3>
              <button onClick={() => setAdminModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '14px', color: uiTokens.textSecondary, marginBottom: '16px' }}>
              <strong>{adminModal.medName}</strong> um {String(adminModal.hour).padStart(2, '0')}:00
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Kürzel (2-4 Zeichen)</label>
              <input
                type="text"
                value={adminInitials}
                onChange={(e) => setAdminInitials(e.target.value.toUpperCase())}
                maxLength={4}
                autoFocus
                placeholder="z.B. LH"
                style={{
                  width: '100%', padding: '14px', fontSize: '24px', fontWeight: 700, textAlign: 'center',
                  border: '2px solid #d1d5db', borderRadius: '12px', letterSpacing: '4px', boxSizing: 'border-box',
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdminister(); }}
              />
            </div>
            <Button
              variant="primary"
              onClick={handleAdminister}
              disabled={adminSubmitting || adminInitials.trim().length < 2}
              style={{ width: '100%', minHeight: '48px', fontSize: '16px' }}
            >
              {adminSubmitting ? 'Speichern...' : 'Bestätigen'}
            </Button>
          </Card>
        </div>
      )}

      {/* Admin info popup */}
      {adminInfo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setAdminInfo(null)}>
          <Card style={{ maxWidth: '320px', width: '100%', padding: '20px' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Abzeichnung</h3>
              <button onClick={() => setAdminInfo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: '14px', display: 'grid', gap: '6px' }}>
              <div><strong>Kürzel:</strong> {adminInfo.administered_by}</div>
              <div><strong>Zeit:</strong> {new Date(adminInfo.administered_at).toLocaleString('de-DE')}</div>
              <div><strong>Status:</strong> {adminInfo.status}</div>
              {adminInfo.notes && <div><strong>Notiz:</strong> {adminInfo.notes}</div>}
            </div>
          </Card>
        </div>
      )}

      {/* Add medication modal */}
      {showMedModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px', overflowY: 'auto' }} onClick={() => setShowMedModal(false)}>
          <Card style={{ maxWidth: '480px', width: '100%', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Medikament hinzufügen</h3>
              <button onClick={() => setShowMedModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <Input label="Medikament *" value={medForm.name} onChange={(e) => setMedForm({ ...medForm, name: e.target.value })} placeholder="z.B. Metamizol" />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <Input label="Dosis *" value={medForm.dose} onChange={(e) => setMedForm({ ...medForm, dose: e.target.value })} placeholder="z.B. 3,1 ml oder 25mg/kg" />
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Applikation</label>
                  <select value={medForm.route} onChange={(e) => setMedForm({ ...medForm, route: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}>
                    <option value="i.v.">i.v.</option>
                    <option value="p.o.">p.o.</option>
                    <option value="s.c.">s.c.</option>
                    <option value="i.m.">i.m.</option>
                    <option value="rektal">rektal</option>
                    <option value="topisch">topisch</option>
                    <option value="inhalativ">inhalativ</option>
                    <option value="">sonstige</option>
                  </select>
                </div>
              </div>
              {/* Art der Gabe */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Regelmäßig', check: !medForm.is_prn && !medForm.is_dti, onClick: () => setMedForm({ ...medForm, is_prn: false, is_dti: false }) },
                  { label: 'Bei Bedarf (PRN)', check: medForm.is_prn, onClick: () => setMedForm({ ...medForm, is_prn: true, is_dti: false }) },
                  { label: 'Dauertropf (DTI)', check: medForm.is_dti, onClick: () => setMedForm({ ...medForm, is_dti: true, is_prn: false }) },
                ].map(opt => (
                  <button key={opt.label} onClick={opt.onClick} type="button" style={{
                    padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    background: opt.check ? uiTokens.brand : '#f1f5f9', color: opt.check ? '#fff' : uiTokens.textPrimary,
                    border: opt.check ? 'none' : '1px solid #d1d5db',
                  }}>{opt.label}</button>
                ))}
              </div>
              {medForm.is_dti && (
                <Input label="DTI Rate (ml/h)" value={medForm.dti_rate_ml_h} onChange={(e) => setMedForm({ ...medForm, dti_rate_ml_h: e.target.value })} type="number" placeholder="z.B. 60" />
              )}
              {!medForm.is_prn && !medForm.is_dti && (
                <>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Häufigkeit</label>
                  <select value={medForm.frequency_label} onChange={(e) => {
                    const freq = e.target.value;
                    let hours = medForm.scheduled_hours;
                    if (freq === '1x täglich') hours = '8';
                    else if (freq === '2x täglich') hours = '8,20';
                    else if (freq === '3x täglich') hours = '8,16,0';
                    else if (freq === '4x täglich') hours = '8,14,20,2';
                    else if (freq === '6x täglich') hours = '8,12,16,20,0,4';
                    setMedForm({ ...medForm, frequency_label: freq, scheduled_hours: hours });
                  }} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}>
                    <option value="1x täglich">1x täglich</option>
                    <option value="2x täglich">2x täglich (alle 12h)</option>
                    <option value="3x täglich">3x täglich (alle 8h)</option>
                    <option value="4x täglich">4x täglich (alle 6h)</option>
                    <option value="6x täglich">6x täglich (alle 4h)</option>
                    <option value="individuell">individuell...</option>
                  </select>
                </div>
                {medForm.frequency_label === 'individuell' && (
                  <Input label="Häufigkeit (Freitext)" value={medForm.frequency_label} onChange={(e) => setMedForm({ ...medForm, frequency_label: e.target.value })} placeholder="z.B. alle 2 Stunden, morgens und abends" />
                )}
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Uhrzeiten</label>
                  <Input value={medForm.scheduled_hours} onChange={(e) => setMedForm({ ...medForm, scheduled_hours: e.target.value })} placeholder="8,16,0" />
                  <div style={{ fontSize: '11px', color: uiTokens.textMuted, marginTop: '4px' }}>Automatisch berechnet – bei Bedarf anpassen</div>
                </div>
                </>
              )}
              <Input label="Angeordnet von" value={medForm.ordered_by} onChange={(e) => setMedForm({ ...medForm, ordered_by: e.target.value })} placeholder="Dr. Müller" />
              <Input label="Notizen" value={medForm.notes} onChange={(e) => setMedForm({ ...medForm, notes: e.target.value })} />
              <Button variant="primary" onClick={handleAddMed} disabled={medSubmitting || !medForm.name.trim() || !medForm.dose.trim()} style={{ minHeight: '44px' }}>
                {medSubmitting ? 'Speichern...' : 'Medikament hinzufügen'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Add vitals modal */}
      {showVitalsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setShowVitalsModal(false)}>
          <Card style={{ maxWidth: '420px', width: '100%', padding: '24px' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Messwerte eintragen</h3>
              <button onClick={() => setShowVitalsModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Stunde</label>
                <select
                  value={vitalsForm.measured_hour}
                  onChange={(e) => setVitalsForm({ ...vitalsForm, measured_hour: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px' }}
                >
                  {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Herzfrequenz" type="number" value={vitalsForm.heart_rate} onChange={(e) => setVitalsForm({ ...vitalsForm, heart_rate: e.target.value })} placeholder="bpm" />
                <Input label="Atemfrequenz" type="number" value={vitalsForm.resp_rate} onChange={(e) => setVitalsForm({ ...vitalsForm, resp_rate: e.target.value })} placeholder="/min" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Temperatur (°C)" type="number" step="0.1" value={vitalsForm.temperature_c} onChange={(e) => setVitalsForm({ ...vitalsForm, temperature_c: e.target.value })} placeholder="38.5" />
                <Input label="Schmerzscore (0-10)" type="number" min="0" max="10" value={vitalsForm.pain_score} onChange={(e) => setVitalsForm({ ...vitalsForm, pain_score: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Urin" value={vitalsForm.urine} onChange={(e) => setVitalsForm({ ...vitalsForm, urine: e.target.value })} placeholder="normal, konzentriert, Blut" />
                <Input label="Futter gefressen" value={vitalsForm.food_eaten} onChange={(e) => setVitalsForm({ ...vitalsForm, food_eaten: e.target.value })} placeholder="ja / nein / wenig" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Kot Menge" value={vitalsForm.feces_amount} onChange={(e) => setVitalsForm({ ...vitalsForm, feces_amount: e.target.value })} placeholder="wenig, normal, viel" />
                <Input label="Kot Konsistenz" value={vitalsForm.feces_consistency} onChange={(e) => setVitalsForm({ ...vitalsForm, feces_consistency: e.target.value })} placeholder="fest, breiig, flüssig" />
              </div>
              {/* Custom-Parameter (selbst hinzugefügte Felder) */}
              {customParams.filter(cp => cp.is_active).length > 0 && (
                <>
                  <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: '8px', marginTop: '4px' }}>
                    <div style={{ fontSize: '11px', color: uiTokens.textMuted, fontWeight: 600, marginBottom: '8px', letterSpacing: '0.5px' }}>
                      INDIVIDUELLE PARAMETER
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {customParams.filter(cp => cp.is_active).map(cp => (
                        <Input
                          key={cp.id}
                          label={`${cp.label}${cp.unit ? ` (${cp.unit})` : ''}${cp.is_required ? ' *' : ''}`}
                          value={(vitalsForm as unknown as Record<string, string>)[`custom_${cp.id}`] || ''}
                          onChange={(e) => setVitalsForm({ ...vitalsForm, [`custom_${cp.id}`]: e.target.value })}
                          placeholder={cp.is_required ? 'Pflichtfeld' : 'optional'}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
              <Input label="Kürzel" value={vitalsForm.recorded_by} onChange={(e) => setVitalsForm({ ...vitalsForm, recorded_by: e.target.value })} placeholder="LH" />
              <Input label="Freitext / Notizen" value={vitalsForm.notes} onChange={(e) => setVitalsForm({ ...vitalsForm, notes: e.target.value })} placeholder="Individuelle Beobachtungen..." />
              <Button variant="primary" onClick={handleAddVitals} disabled={vitalsSubmitting} style={{ minHeight: '44px' }}>
                {vitalsSubmitting ? 'Speichern...' : 'Messung speichern'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Edit medication modal */}
      {editMed && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px', overflowY: 'auto' }} onClick={() => setEditMed(null)}>
          <Card style={{ maxWidth: '480px', width: '100%', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Medikament bearbeiten</h3>
              <button onClick={() => setEditMed(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <Input label="Name *" value={editMedForm.name} onChange={(e) => setEditMedForm({ ...editMedForm, name: e.target.value })} />
              <Input label="Dosis *" value={editMedForm.dose} onChange={(e) => setEditMedForm({ ...editMedForm, dose: e.target.value })} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input label="Applikationsweg" value={editMedForm.route} onChange={(e) => setEditMedForm({ ...editMedForm, route: e.target.value })} />
                <Input label="Häufigkeit" value={editMedForm.frequency_label} onChange={(e) => setEditMedForm({ ...editMedForm, frequency_label: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editMedForm.is_prn} onChange={(e) => setEditMedForm({ ...editMedForm, is_prn: e.target.checked, is_dti: false })} /> Bei Bedarf (PRN)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={editMedForm.is_dti} onChange={(e) => setEditMedForm({ ...editMedForm, is_dti: e.target.checked, is_prn: false })} /> Dauerinfusion (DTI)
                </label>
              </div>
              {editMedForm.is_dti && (
                <Input label="DTI Rate (ml/h)" value={editMedForm.dti_rate_ml_h} onChange={(e) => setEditMedForm({ ...editMedForm, dti_rate_ml_h: e.target.value })} type="number" />
              )}
              {!editMedForm.is_prn && !editMedForm.is_dti && (
                <Input label="Uhrzeiten (kommagetrennt)" value={editMedForm.scheduled_hours} onChange={(e) => setEditMedForm({ ...editMedForm, scheduled_hours: e.target.value })} placeholder="7,13,19" />
              )}
              <Input label="Notizen" value={editMedForm.notes} onChange={(e) => setEditMedForm({ ...editMedForm, notes: e.target.value })} />
              <Button variant="primary" onClick={handleEditMed} disabled={editMedSubmitting || !editMedForm.name.trim() || !editMedForm.dose.trim()} style={{ minHeight: '44px' }}>
                {editMedSubmitting ? 'Speichern...' : 'Änderungen speichern'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Add custom vital param modal */}
      {showAddParam && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setShowAddParam(false)}>
          <Card style={{ maxWidth: '400px', width: '100%', padding: '24px' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Eigenen Messwert hinzufügen</h3>
              <button onClick={() => setShowAddParam(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '13px', color: uiTokens.textSecondary, marginBottom: '12px' }}>
              Füge einen individuellen Parameter hinzu, der nur für diesen Patienten gilt.
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              <Input label="Bezeichnung *" value={newParamLabel} onChange={(e) => setNewParamLabel(e.target.value)} placeholder="z.B. Blutzucker, Drainagemenge, SpO2" />
              <Input label="Einheit" value={newParamUnit} onChange={(e) => setNewParamUnit(e.target.value)} placeholder="z.B. mg/dl, ml, %" />
              <Input label="Mess-Zeiten (Kringel, kommagetrennt)" value={newParamSchedule || ''} onChange={(e) => setNewParamSchedule(e.target.value)} placeholder="z.B. 8,12,16,20 (leer = keine Kringel)" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={newParamRequired} onChange={(e) => setNewParamRequired(e.target.checked)} />
                <span>Pflicht-Parameter <span style={{ color: uiTokens.textMuted, fontSize: '12px' }}>(gelb hervorgehoben)</span></span>
              </label>
              <Button variant="primary" onClick={handleAddCustomParam} disabled={!newParamLabel.trim()} style={{ minHeight: '44px' }}>
                Parameter hinzufügen
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* AI rule feedback modal */}
      {ruleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setRuleModal(null)}>
          <Card style={{ maxWidth: '480px', width: '100%', padding: '24px' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>Praxis-Regel anlegen</h3>
              <button onClick={() => setRuleModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ background: '#fefce8', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#854d0e' }}>
              <strong>KI-Warnung:</strong> {ruleModal.alert_message}
            </div>
            <p style={{ fontSize: '13px', color: uiTokens.textSecondary, marginBottom: '12px' }}>
              Beschreibe, warum das in eurer Praxis OK ist. Diese Regel wird bei allen zukünftigen KI-Prüfungen berücksichtigt.
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              <Input label="Medikament" value={ruleModal.medication_name} disabled />
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Eure Regel / Begründung *</label>
                <textarea
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  placeholder="z.B. Metamizol 50mg/kg ist bei uns bei starken Schmerzen Standard, wird gut vertragen."
                  rows={3}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <Button variant="primary" onClick={handleSaveRule} disabled={ruleSubmitting || !ruleText.trim()} style={{ minHeight: '44px' }}>
                {ruleSubmitting ? 'Speichern...' : 'Regel speichern'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
