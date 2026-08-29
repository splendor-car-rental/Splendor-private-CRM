import React, { useState } from 'react';
import { 
  AlertTriangle, CheckCircle2, Camera, Plus, Trash2, 
  Eye, ShieldCheck, Sparkles 
} from 'lucide-react';
import { VehicleDamageMarker } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '../common/Badge';

interface VehicleInspectionDamageHotspotsProps {
  damages: VehicleDamageMarker[];
  onChange: (damages: VehicleDamageMarker[]) => void;
  readOnly?: boolean;
}

const VEHICLE_ZONES = [
  { id: 'front_bumper', nameEn: 'Front Bumper & Lip', nameAr: 'المصد الأمامي والشفة السفلية', top: '10%', left: '50%' },
  { id: 'hood', nameEn: 'Bonnet / Hood', nameAr: 'غطاء المحرك الأمامي', top: '24%', left: '50%' },
  { id: 'windshield', nameEn: 'Windshield Glass', nameAr: 'الزجاج الأمامي', top: '38%', left: '50%' },
  { id: 'roof', nameEn: 'Roof & Sunroof', nameAr: 'السقف والفتحة البانورامية', top: '52%', left: '50%' },
  { id: 'rear_bumper', nameEn: 'Rear Bumper & Diffuser', nameAr: 'المصد الخلفي ومشتت الهواء', top: '90%', left: '50%' },
  { id: 'left_door', nameEn: 'Left Doors & Quarter', nameAr: 'الأبواب الجانبية اليسرى', top: '50%', left: '20%' },
  { id: 'right_door', nameEn: 'Right Doors & Quarter', nameAr: 'الأبواب الجانبية اليمنى', top: '50%', left: '80%' },
  { id: 'rims', nameEn: 'Wheels & Carbon Ceramic Rims', nameAr: 'الجنوط والسيراميك كربوني', top: '75%', left: '20%' },
  { id: 'interior', nameEn: 'Luxury Interior & Leather', nameAr: 'المقصورة والفرش الجلدي', top: '65%', left: '50%' }
];

const SEVERITY_LEVELS = [
  { id: 'minor_scratch', nameEn: 'Minor Surface Scuff', nameAr: 'خدش سطحي طفيف', color: 'emerald' },
  { id: 'deep_scratch', nameEn: 'Deep Paint Scratch', nameAr: 'خدش عميق في الدهان', color: 'amber' },
  { id: 'paint_chip', nameEn: 'Stone / Paint Chip', nameAr: 'ضربات حصى في الطلاء', color: 'amber' },
  { id: 'dent', nameEn: 'Body Dent / Ding', nameAr: 'طعجة أو انبعاج بالهيكل', color: 'rose' },
  { id: 'curb_rash', nameEn: 'Alloy Wheel Curb Rash', nameAr: 'احتكاك بحواف الرصيف', color: 'rose' }
];

export const VehicleInspectionDamageHotspots: React.FC<VehicleInspectionDamageHotspotsProps> = ({
  damages,
  onChange,
  readOnly = false
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [selectedZone, setSelectedZone] = useState<string>('front_bumper');
  const [selectedSeverity, setSelectedSeverity] = useState<VehicleDamageMarker['severity']>('minor_scratch');
  const [damageNotes, setDamageNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const handleAddMarker = () => {
    if (readOnly) return;
    const newMarker: VehicleDamageMarker = {
      id: `DMG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      part: selectedZone as any,
      severity: selectedSeverity,
      notes: damageNotes.trim() || (isAr ? 'تم رصد الخدش أثناء الفحص الرقمي' : 'Noted during digital inspection audit'),
      photoUrl: photoUrl.trim() || undefined
    };

    onChange([...damages, newMarker]);
    setDamageNotes('');
    setPhotoUrl('');
  };

  const handleRemoveMarker = (id: string) => {
    if (readOnly) return;
    onChange(damages.filter(d => d.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{isAr ? 'مخطط الفحص البصري للمركبة ورصد الملاحظات' : 'Vehicle Condition Diagram & Hotspot Markers'}</span>
          </h4>
          <p className="text-[11px] text-zinc-500">
            {isAr ? 'انقر على منطقة المركبة لتسجيل الخدوش أو إرفاق الصور لتفادي النزاعات' : 'Pinpoint minor scuffs, curb rash, or interior wear to prevent return disputes'}
          </p>
        </div>

        <Badge variant={damages.length === 0 ? 'emerald' : 'amber'} size="sm">
          {damages.length === 0 ? (isAr ? 'حالة المعرض ممتازة (بدون ملاحظات)' : 'Pristine 100% Condition') : `${damages.length} ${isAr ? 'ملاحظة مسجلة' : 'Noted Items'}`}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Visual Car Schematic representation (5 cols) */}
        <div className="lg:col-span-5 p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center relative min-h-[300px] overflow-hidden">
          {/* Subtle Car Outline Graphic */}
          <div className="relative w-48 h-64 border-2 border-dashed border-zinc-800 rounded-[40px] flex flex-col items-center justify-between p-3 bg-zinc-900/30">
            <div className="w-24 h-5 rounded-t-full bg-zinc-800/60 border border-zinc-700 flex items-center justify-center text-[9px] text-zinc-400 font-mono">
              {isAr ? 'المقدمة' : 'FRONT'}
            </div>
            
            {/* Windshield */}
            <div className="w-32 h-10 border border-zinc-700/80 rounded-t-lg bg-zinc-950/40 flex items-center justify-center text-[8px] text-zinc-500 font-mono">
              WINDSHIELD
            </div>

            {/* Cabin */}
            <div className="w-36 h-16 border border-zinc-700/80 rounded-md bg-zinc-950/60 flex items-center justify-center text-[9px] text-zinc-400 font-mono">
              CABIN & SEATS
            </div>

            {/* Rear */}
            <div className="w-24 h-5 rounded-b-full bg-zinc-800/60 border border-zinc-700 flex items-center justify-center text-[9px] text-zinc-400 font-mono">
              {isAr ? 'الخلفية' : 'REAR'}
            </div>
          </div>

          {/* Hotspot buttons on schematic */}
          {VEHICLE_ZONES.map(zone => {
            const count = damages.filter(d => d.part === zone.id).length;
            const isSelected = selectedZone === zone.id;

            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => setSelectedZone(zone.id)}
                style={{ top: zone.top, left: zone.left }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all flex items-center justify-center shadow-lg ${
                  count > 0
                    ? 'bg-rose-500 text-zinc-950 ring-4 ring-rose-500/30'
                    : isSelected
                    ? 'bg-[#D4AF37] text-zinc-950 ring-4 ring-[#D4AF37]/30 scale-110'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                }`}
                title={isAr ? zone.nameAr : zone.nameEn}
              >
                <span className="w-4 h-4 text-[10px] font-bold flex items-center justify-center">
                  {count > 0 ? count : '+'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Damage form and list (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {!readOnly && (
            <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-200">
                  {isAr ? 'إضافة ملاحظة على:' : 'Selected Zone:'} <strong className="text-[#f5d97f]">
                    {isAr
                      ? VEHICLE_ZONES.find(z => z.id === selectedZone)?.nameAr
                      : VEHICLE_ZONES.find(z => z.id === selectedZone)?.nameEn}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'نوع الملاحظة / الشدة' : 'Severity Type'}</label>
                  <select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs"
                  >
                    {SEVERITY_LEVELS.map(sev => (
                      <option key={sev.id} value={sev.id}>
                        {isAr ? sev.nameAr : sev.nameEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">{isAr ? 'رابط الصورة المرفقة' : 'Photo Attachment URL'}</label>
                  <input
                    type="text"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                    placeholder="https://... photo evidence"
                    className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs"
                  />
                </div>
              </div>

              <div>
                <input
                  type="text"
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  placeholder={isAr ? 'وصف دقيق للملاحظة (مثال: خدش سطحي 2 سم قرب الكشاف الأيمن)...' : 'Detailed notes (e.g., 2cm light scuff near right headlamp)...'}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleAddMarker}
                className="w-full py-1.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#b39029] text-zinc-950 font-bold text-xs shadow hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAr ? 'تثبيت الملاحظة في التقرير الفني' : 'Pin Damage to Report'}</span>
              </button>
            </div>
          )}

          {/* Recorded items list */}
          <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
            {damages.length === 0 ? (
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-dashed border-zinc-800 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{isAr ? 'لا توجد خدوش أو ملاحظات مسجلة على المركبة.' : 'Zero damages recorded. Supercar in immaculate condition.'}</span>
              </div>
            ) : (
              damages.map(item => {
                const zoneObj = VEHICLE_ZONES.find(z => z.id === item.part);
                const sevObj = SEVERITY_LEVELS.find(s => s.id === item.severity);

                return (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-zinc-200">
                            {isAr ? zoneObj?.nameAr : zoneObj?.nameEn}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300">
                            {isAr ? sevObj?.nameAr : sevObj?.nameEn}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">{item.notes}</p>
                      </div>
                    </div>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMarker(item.id)}
                        className="p-1 rounded-lg text-zinc-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
