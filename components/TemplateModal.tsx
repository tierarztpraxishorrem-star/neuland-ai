"use client";

import { useState } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (template: string) => void;
};

export default function TemplateModal({ isOpen, onClose, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  if (!isOpen) return null;

  const templates = [
    { id: "note", label: "Klinische Notiz" },
    { id: "referral", label: "Überweisung" },
    { id: "communication", label: "Kundenkommunikation" },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-[500px] shadow-xl">
        <h2 className="text-xl font-semibold mb-4">Vorlage wählen</h2>

        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`border rounded-lg p-4 cursor-pointer transition ${
                selected === t.id
                  ? "border-green-600 bg-green-50"
                  : "hover:bg-gray-100"
              }`}
            >
              {t.label}
            </div>
          ))}
        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg"
          >
            Abbrechen
          </button>

          <button
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onSelect(selected);
                onClose();
              }
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg disabled:opacity-50"
          >
            Weiter →
          </button>
        </div>
      </div>
    </div>
  );
}