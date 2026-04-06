'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LastConsultationPage() {
  const router = useRouter();

  useEffect(() => {
    const lastCaseId =
      localStorage.getItem('last_consultation_case_id') ||
      localStorage.getItem('current_case_id');

    const snapshotRaw = localStorage.getItem('last_consultation_snapshot');
    if (snapshotRaw) {
      try {
        const snapshot = JSON.parse(snapshotRaw);
        const snapshotCaseId = snapshot?.caseId;
        const targetCaseId = lastCaseId || snapshotCaseId;

        if (targetCaseId && snapshotCaseId === targetCaseId) {
          if (typeof snapshot.result === 'string') {
            localStorage.setItem(`case_${targetCaseId}_autosave_result`, snapshot.result);
          }
          if (typeof snapshot.transcript === 'string') {
            localStorage.setItem(`case_${targetCaseId}_autosave_transcript`, snapshot.transcript);
          }
          if (snapshot.structuredCase) {
            localStorage.setItem(
              `case_${targetCaseId}_autosave_context`,
              JSON.stringify({
                patientName: snapshot.structuredCase.patientName || '',
                tierart: snapshot.structuredCase.tierart || '',
                rasse: snapshot.structuredCase.rasse || '',
                alter: snapshot.structuredCase.alter || '',
                geschlecht: snapshot.structuredCase.geschlecht || '',
                additionalInfo: snapshot.structuredCase.additionalInfo || ''
              })
            );
          }
        }
      } catch {
        // Ignore malformed snapshot and continue with normal redirect.
      }
    }

    if (lastCaseId) {
      router.replace(`/konsultation/${lastCaseId}/result`);
      return;
    }

    router.replace('/konsultation/start');
  }, [router]);

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      Lade letzte Konsultation...
    </main>
  );
}
