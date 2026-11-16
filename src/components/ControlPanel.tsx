'use client';

import React, { useState, useCallback } from 'react';
import type { WatermarkSettings, TemplateType, DateFormatType, WatermarkPosition } from '@/types';
import { generateRandomHashId } from '@/types';
import TemplateSwitcher from './TemplateSwitcher';
import {
  Calendar,
  Clock,
  MapPin,
  StickyNote,
  Sliders,
  Navigation,
  CloudSun,
  Mountain,
  User,
  Upload,
  ShieldCheck,
  RefreshCw,
  Languages,
} from 'lucide-react';
import { getCurrentPosition } from '@/utils/geocoding';
import { reverseGeocode } from '@/utils/geocoding';

interface ControlPanelProps {
  settings: WatermarkSettings;
  onChange: (updates: Partial<WatermarkSettings>) => void;
}

type TabId = 'time' | 'location' | 'style';

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'time', label: 'Thời gian', icon: <Calendar size={16} /> },
  { id: 'location', label: 'Địa điểm', icon: <MapPin size={16} /> },
  { id: 'style', label: 'Tùy chỉnh', icon: <Sliders size={16} /> },
];

export default function ControlPanel({ settings, onChange }: ControlPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('time');
  const [fetchingLocation, setFetchingLocation] = useState(false);

  // ---- Handlers ----
  const updateField = useCallback(
    <K extends keyof WatermarkSettings>(key: K, value: WatermarkSettings[K]) => {
      onChange({ [key]: value });
    },
    [onChange]
  );

  const handleGetCurrentLocation = useCallback(async () => {
    setFetchingLocation(true);
    try {
      const pos = await getCurrentPosition();
      if (pos) {
        const updates: Partial<WatermarkSettings> = {
          latitude: pos.latitude,
          longitude: pos.longitude,
        };

        const geo = await reverseGeocode(pos.latitude, pos.longitude);
        if (geo) {
          updates.address = geo.address;
        }

        onChange(updates);
      }
    } catch (err) {
      console.error('Location error:', err);
    } finally {
      setFetchingLocation(false);
    }
  }, [onChange]);

  const handleLogoUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        onChange({ customLogo: reader.result as string });
      };
      reader.readAsDataURL(file);
    },
    [onChange]
  );

  // ---- Toggle Component with large touch area ----
  const Toggle = ({
    checked,
    onToggle,
    label,
  }: {
    checked: boolean;
    onToggle: () => void;
    label: string;
  }) => (
    <div
      onClick={onToggle}
      className="flex items-center justify-between py-1.5 cursor-pointer select-none"
    >
      <span className="text-sm text-neutral-300 font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle-switch ${checked ? 'active' : ''}`}
      >
        <span className="toggle-switch-dot" />
      </button>
    </div>
  );

  // ---- Date/time helpers ----
  const dateStr = settings.dateTime.toISOString().split('T')[0];
  const timeStr = `${settings.dateTime.getHours().toString().padStart(2, '0')}:${settings.dateTime.getMinutes().toString().padStart(2, '0')}`;

  // =============================================================
  // SECTION 1: Thời gian (Time & Date + Template + Language)
  // =============================================================
  const renderTimeSection = () => (
    <div className="space-y-3.5 fade-in">
      {/* Template Chooser */}
      <div className="control-section">
        <div className="control-section-title">Kiểu mẫu (Template)</div>
        <TemplateSwitcher
          value={settings.template}
          onChange={(t: TemplateType) => updateField('template', t)}
        />
      </div>

      {/* Date & Time Pickers */}
      <div className="control-section space-y-3">
        <div className="control-section-title flex items-center gap-1.5">
          <Clock size={14} className="text-accent" />
          Ngày & Giờ (Date & Time)
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Date Picker */}
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1 font-medium">Ngày</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => {
                const parts = e.target.value.split('-');
                const newDate = new Date(settings.dateTime);
                newDate.setFullYear(+parts[0], +parts[1] - 1, +parts[2]);
                updateField('dateTime', newDate);
              }}
            />
          </div>

          {/* Time Picker */}
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1 font-medium">Giờ</label>
            <input
              type="time"
              value={timeStr}
              step={settings.showSeconds ? 1 : 60}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number);
                const newDate = new Date(settings.dateTime);
                newDate.setHours(h, m);
                updateField('dateTime', newDate);
              }}
            />
          </div>
        </div>

        {/* Date format select */}
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1 font-medium">Định dạng ngày</label>
          <select
            value={settings.dateFormat}
            onChange={(e) => updateField('dateFormat', e.target.value as DateFormatType)}
          >
            <option value="vi-standard">16 Tháng 11,2026 (Timemark chuẩn)</option>
            <option value="DD/MM/YYYY">16/11/2026 (DD/MM/YYYY)</option>
            <option value="YYYY-MM-DD">2026-11-16 (YYYY-MM-DD)</option>
            <option value="MMM DD, YYYY">Nov 16, 2026 (MMM DD, YYYY)</option>
          </select>
        </div>

        {/* Show seconds toggle */}
        <Toggle
          checked={settings.showSeconds}
          onToggle={() => updateField('showSeconds', !settings.showSeconds)}
          label="Hiện giây (HH:MM:SS)"
        />
      </div>

      {/* Language / Subtitle mode */}
      <div className="control-section">
        <div className="control-section-title flex items-center gap-1.5">
          <Languages size={14} className="text-accent" />
          Ngôn ngữ nhãn logo
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updateField('language', 'vi')}
            className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all min-h-[44px] ${
              settings.language === 'vi'
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-editor-border bg-editor-surface text-neutral-400'
            }`}
          >
            100% Chân thực (VI)
          </button>
          <button
            type="button"
            onClick={() => updateField('language', 'en')}
            className={`py-2.5 px-3 rounded-xl text-xs font-semibold border transition-all min-h-[44px] ${
              settings.language === 'en'
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-editor-border bg-editor-surface text-neutral-400'
            }`}
          >
            100% Real (EN)
          </button>
        </div>
      </div>
    </div>
  );

  // =============================================================
  // SECTION 2: Địa điểm (Location & Address + GPS)
  // =============================================================
  const renderLocationSection = () => (
    <div className="space-y-3.5 fade-in">
      <div className="control-section space-y-3">
        <div className="control-section-title flex items-center gap-1.5">
          <MapPin size={14} className="text-accent" />
          Địa chỉ hiển thị
        </div>

        {/* Address textarea */}
        <div>
          <textarea
            rows={2}
            value={settings.address}
            onChange={(e) => updateField('address', e.target.value)}
            placeholder="16 Lê Thái Tổ, P.Vũng Áng, Hà Tĩnh"
            className="resize-none"
          />
        </div>

        {/* GPS Button */}
        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={fetchingLocation}
          className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 bg-editor-surface border border-editor-border hover:border-accent/60 text-white min-h-[44px] active:scale-[0.99] transition-all disabled:opacity-50"
        >
          <Navigation size={14} className={fetchingLocation ? 'animate-spin text-accent' : 'text-accent'} />
          {fetchingLocation ? 'Đang lấy vị trí GPS...' : 'Lấy vị trí hiện tại (GPS)'}
        </button>

        {/* Coordinates Inputs */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1 font-medium">Vĩ độ (Lat)</label>
            <input
              type="number"
              step="0.000001"
              value={settings.latitude ?? ''}
              onChange={(e) =>
                updateField('latitude', e.target.value ? parseFloat(e.target.value) : null)
              }
              placeholder="18.066667"
            />
          </div>
          <div>
            <label className="block text-[11px] text-neutral-400 mb-1 font-medium">Kinh độ (Long)</label>
            <input
              type="number"
              step="0.000001"
              value={settings.longitude ?? ''}
              onChange={(e) =>
                updateField('longitude', e.target.value ? parseFloat(e.target.value) : null)
              }
              placeholder="106.316667"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-editor-border space-y-1">
          <Toggle
            checked={settings.showLocationPin}
            onToggle={() => updateField('showLocationPin', !settings.showLocationPin)}
            label="Hiện biểu tượng ghim (Pin icon)"
          />
          <Toggle
            checked={settings.showCoordinates}
            onToggle={() => updateField('showCoordinates', !settings.showCoordinates)}
            label="Hiện dãy tọa độ GPS bên dưới"
          />
        </div>
      </div>
    </div>
  );

  // =============================================================
  // SECTION 3: Tùy chỉnh (Style, Security Hash & Custom Fields)
  // =============================================================
  const renderStyleSection = () => (
    <div className="space-y-3.5 fade-in">
      {/* Security Stamp & Hash */}
      <div className="control-section space-y-3">
        <div className="flex items-center justify-between">
          <div className="control-section-title mb-0 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-accent" />
            Tem bảo mật Timemark Verified
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.showVerifiedBadge}
            onClick={() => updateField('showVerifiedBadge', !settings.showVerifiedBadge)}
            className={`toggle-switch ${settings.showVerifiedBadge ? 'active' : ''}`}
          >
            <span className="toggle-switch-dot" />
          </button>
        </div>

        {settings.showVerifiedBadge && (
          <div className="pt-2 border-t border-editor-border space-y-1.5">
            <label className="block text-[11px] text-neutral-400 font-medium">
              Mã bảo mật 14 ký tự (Hash ID)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.hashId}
                maxLength={14}
                onChange={(e) => updateField('hashId', e.target.value.toUpperCase())}
                placeholder="P1CM1HMA3TCPAL"
                className="font-mono text-xs uppercase flex-1"
              />
              <button
                type="button"
                onClick={() => updateField('hashId', generateRandomHashId())}
                className="px-3.5 py-2 rounded-xl bg-editor-surface border border-editor-border hover:border-accent text-neutral-300 hover:text-accent transition-colors flex items-center gap-1.5 text-xs font-semibold min-h-[44px]"
              >
                <RefreshCw size={13} />
                Đổi mã
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">
              Chữ xoay -90° dọc theo mép phải của ảnh.
            </p>
          </div>
        )}
      </div>

      {/* Visual Adjustments: Scale & Accent Color */}
      <div className="control-section space-y-3">
        <div className="control-section-title">Kích thước & Màu sắc</div>

        {/* Scale */}
        <div>
          <div className="flex justify-between text-xs text-neutral-400 mb-1 font-medium">
            <span>Tỉ lệ chữ (Scale)</span>
            <span>{Math.round(settings.scale * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.6"
            max="1.5"
            step="0.05"
            value={settings.scale}
            onChange={(e) => updateField('scale', parseFloat(e.target.value))}
          />
        </div>

        {/* Accent Color */}
        <div>
          <label className="block text-[11px] text-neutral-400 mb-1.5 font-medium">Màu vạch vàng</label>
          <div className="flex items-center gap-2">
            {['#FFC107', '#FF9800', '#FF5722', '#4CAF50', '#2196F3', '#FFFFFF'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateField('accentColor', c)}
                className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-90 ${
                  settings.accentColor === c ? 'border-white scale-110' : 'border-editor-border'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Position Grid */}
        <div className="pt-2">
          <label className="block text-[11px] text-neutral-400 mb-1.5 font-medium">Vị trí đặt watermark</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: 'bottom-left', label: '↙ Dưới Trái' },
                { id: 'bottom-right', label: '↘ Dưới Phải' },
                { id: 'top-left', label: '↖ Trên Trái' },
                { id: 'top-right', label: '↗ Trên Phải' },
              ] as { id: WatermarkPosition; label: string }[]
            ).map((pos) => (
              <button
                key={pos.id}
                type="button"
                onClick={() => updateField('position', pos.id)}
                className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all min-h-[40px] ${
                  settings.position === pos.id
                    ? 'border-accent bg-accent/15 text-accent font-semibold'
                    : 'border-editor-border bg-editor-surface text-neutral-400'
                }`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Optional Note / Remarks */}
      <div className="control-section">
        <div className="flex items-center justify-between mb-2">
          <div className="control-section-title mb-0 flex items-center gap-1.5">
            <StickyNote size={14} className="text-accent" />
            Ghi chú / Công trình
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.showNote}
            onClick={() => updateField('showNote', !settings.showNote)}
            className={`toggle-switch ${settings.showNote ? 'active' : ''}`}
          >
            <span className="toggle-switch-dot" />
          </button>
        </div>
        {settings.showNote && (
          <textarea
            rows={2}
            value={settings.note}
            onChange={(e) => updateField('note', e.target.value)}
            placeholder="Nhập nội dung ghi chú..."
            className="resize-none mt-2"
          />
        )}
      </div>

      {/* Custom Logo Upload */}
      <div className="control-section">
        <div className="control-section-title flex items-center gap-1.5 mb-2">
          <Upload size={14} className="text-accent" />
          Logo riêng (tùy chọn)
        </div>
        <div className="flex items-center gap-2">
          <label className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold text-center cursor-pointer bg-editor-surface border border-editor-border hover:border-accent/60 transition-colors min-h-[44px] flex items-center justify-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
            {settings.customLogo ? 'Đổi logo khác' : 'Chọn ảnh logo'}
          </label>
          {settings.customLogo && (
            <button
              type="button"
              onClick={() => onChange({ customLogo: null })}
              className="px-3 py-2 text-xs text-red-400 hover:text-red-300 min-h-[44px]"
            >
              Xóa
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* 3 Thumb-Friendly Horizontal Tabs */}
      <div className="flex border-b border-editor-border bg-editor-surface/60 sticky top-0 z-20 flex-none px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 px-2 text-xs font-bold text-center flex items-center justify-center gap-1.5 transition-all min-h-[44px] ${
              activeTab === tab.id
                ? 'text-accent border-b-2 border-accent'
                : 'text-neutral-400 hover:text-white border-b-2 border-transparent'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3.5 overscroll-contain">
        {activeTab === 'time' && renderTimeSection()}
        {activeTab === 'location' && renderLocationSection()}
        {activeTab === 'style' && renderStyleSection()}
      </div>
    </div>
  );
}
