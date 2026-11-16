'use client';

import React from 'react';
import type { TemplateType } from '@/types';
import { Clock, FileText, Type } from 'lucide-react';

interface TemplateSwitcherProps {
  value: TemplateType;
  onChange: (template: TemplateType) => void;
}

const templates: { id: TemplateType; name: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Large clock with accent bar, date & location',
    icon: <Clock size={20} />,
  },
  {
    id: 'fieldwork',
    name: 'Field Work',
    description: 'Professional card with structured data rows',
    icon: <FileText size={20} />,
  },
  {
    id: 'minimalist',
    name: 'Minimal',
    description: 'Clean text stamp, works on any background',
    icon: <Type size={20} />,
  },
];

export default function TemplateSwitcher({ value, onChange }: TemplateSwitcherProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {templates.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`template-thumb flex flex-col items-center gap-1.5 text-center ${
            value === t.id ? 'selected' : ''
          }`}
        >
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center ${
              value === t.id
                ? 'bg-accent/20 text-accent'
                : 'bg-editor-surface text-neutral-500'
            }`}
          >
            {t.icon}
          </div>
          <span className={`text-xs font-medium ${value === t.id ? 'text-accent' : 'text-neutral-400'}`}>
            {t.name}
          </span>
        </button>
      ))}
    </div>
  );
}
