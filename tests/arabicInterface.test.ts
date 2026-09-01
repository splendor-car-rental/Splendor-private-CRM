import { describe, expect, it } from 'vitest';
import { containsLatinUiText, translateArabicUiText } from '../src/i18n/arabicInterface';

describe('Arabic internal-interface normalization', () => {
  it('translates high-visibility navigation badges without Latin UI copy', () => {
    const samples = ['Live Ops', 'GPS Live', 'B2B LPO', '12/12 Passed', 'Fleet ROI Simulator'];
    for (const sample of samples) {
      const translated = translateArabicUiText(sample, 'aggressive');
      expect(containsLatinUiText(translated)).toBe(false);
    }
  });

  it('translates dynamic counters used by the sidebar', () => {
    expect(translateArabicUiText('11 Avail', 'aggressive')).toBe('11 متاح');
    expect(translateArabicUiText('3 Active', 'aggressive')).toBe('3 نشط');
    expect(translateArabicUiText('4 Review', 'aggressive')).toBe('4 للمراجعة');
    expect(translateArabicUiText('2 Unmatched', 'aggressive')).toBe('2 غير مطابق');
  });

  it('removes English abbreviations embedded inside existing Arabic labels', () => {
    const translated = translateArabicUiText('أوامر التوريد للشركات B2B LPO مع VAT و TRN', 'safe');
    expect(translated).toContain('بين الشركات');
    expect(translated).toContain('أمر توريد');
    expect(translated).toContain('ضريبة القيمة المضافة');
    expect(translated).toContain('الرقم الضريبي');
    expect(containsLatinUiText(translated)).toBe(false);
  });

  it('localizes purchase-order interface terminology', () => {
    expect(translateArabicUiText('Vehicle Details Table', 'aggressive')).toBe('جدول بيانات المركبة');
    expect(translateArabicUiText('VAT Registration (TRN)', 'aggressive')).toBe('التسجيل الضريبي');
    expect(translateArabicUiText('Print / PDF', 'aggressive')).toBe('طباعة / ملف مستند');
  });

  it('does not rewrite pure-English business data in safe content mode', () => {
    const supplier = 'Alayham for Car Rental L.L.C';
    expect(translateArabicUiText(supplier, 'safe')).toBe(supplier);
  });

  it('never rewrites email addresses or URLs', () => {
    expect(translateArabicUiText('booking@alayhamcar.ae', 'aggressive')).toBe('booking@alayhamcar.ae');
    expect(translateArabicUiText('https://splendorcar.ae', 'aggressive')).toBe('https://splendorcar.ae');
  });
});
