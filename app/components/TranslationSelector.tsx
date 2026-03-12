'use client';

import { useState } from 'react';
import { ChevronDown, Check, Globe } from 'lucide-react';

interface Translation {
  id: string;
  name: string;
  language: string;
  author?: string;
}

const TRANSLATIONS: Translation[] = [
  { id: 'en.asad', name: 'Muhammad Asad', language: 'English' },
  { id: 'en.sahih', name: 'Saheeh International', language: 'English' },
  { id: 'en.pickthall', name: 'Pickthall', language: 'English' },
  { id: 'en.yusufali', name: 'Yusuf Ali', language: 'English' },
  { id: 'ur.jalandhry', name: 'Jalandhry', language: 'Urdu' },
  { id: 'ur.khan', name: 'Fatah Muhammad Jalandhry', language: 'Urdu' },
  { id: 'id.indonesian', name: 'Indonesian', language: 'Indonesian' },
  { id: 'fr.hamidullah', name: 'Hamidullah', language: 'French' },
  { id: 'de.bubenheim', name: 'Bubenheim & Elyas', language: 'German' },
  { id: 'tr.diyanet', name: 'Diyanet', language: 'Turkish' },
];

interface TranslationSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function TranslationSelector({ selectedIds, onChange }: TranslationSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleTranslation = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(t => t !== id));
    } else if (selectedIds.length < 3) {
      onChange([...selectedIds, id]);
    }
  };

  const getSelectedNames = () => {
    const selected = TRANSLATIONS.filter(t => selectedIds.includes(t.id));
    if (selected.length === 0) return 'Select translations';
    return selected.map(t => t.name).join(', ');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-card-bg border border-border rounded-lg hover:border-primary transition-colors"
      >
        <Globe className="w-4 h-4 text-text-muted" />
        <span className="text-sm text-foreground truncate max-w-50">
          {getSelectedNames()}
        </span>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-card-bg border border-border rounded-lg shadow-lg z-20">
          <div className="p-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Translations</p>
            <p className="text-xs text-text-muted">Select up to 3</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {TRANSLATIONS.map((translation) => (
              <button
                key={translation.id}
                onClick={() => toggleTranslation(translation.id)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-background transition-colors"
              >
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                  selectedIds.includes(translation.id)
                    ? 'bg-primary border-primary'
                    : 'border-border'
                }`}>
                  {selectedIds.includes(translation.id) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm text-foreground">{translation.name}</p>
                  <p className="text-xs text-text-muted">{translation.language}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
