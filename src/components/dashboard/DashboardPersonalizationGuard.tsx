import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCRM } from '../../context/CRMContext';
import { useLanguage } from '../../context/LanguageContext';

function walkText(root: Node, visitor: (node: Text) => void) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    visitor(current as Text);
    current = walker.nextNode();
  }
}

export const DashboardPersonalizationGuard = () => {
  const { activeView } = useCRM();
  const { currentUser } = useAuth();
  const { language } = useLanguage();

  useEffect(() => {
    if (activeView !== 'dashboard') return;

    const apply = () => {
      const root = document.querySelector('main');
      if (!root) return;
      const employeeName = language === 'ar' ? (currentUser.nameAr || currentUser.name) : currentUser.name;

      walkText(root, node => {
        const raw = node.nodeValue || '';
        if (raw.includes('سحابة بيانات سبلندر المباشرة') || raw.includes('Live Splendor Cloud Sync')) {
          node.nodeValue = language === 'ar' ? `مرحباً ${employeeName}` : `Welcome, ${employeeName}`;
          return;
        }
        if (raw.includes('إجمالي السجلات السحابية:')) {
          node.nodeValue = raw.replace('إجمالي السجلات السحابية:', 'إجمالي السجلات:');
          return;
        }
        if (raw.includes('Cloud Documents:')) {
          node.nodeValue = raw.replace('Cloud Documents:', 'Total Records:').replace('live records', 'records');
          return;
        }
        if (raw.includes('زمن الاستجابة:') || raw.includes('Latency:')) {
          const span = node.parentElement;
          if (span) span.style.display = 'none';
          const previous = span?.previousElementSibling as HTMLElement | null;
          if (previous && (previous.textContent || '').trim() === '•') previous.style.display = 'none';
          return;
        }
        if (language === 'ar' && raw.includes('عبر سحابة سبلندر')) {
          node.nodeValue = raw.replace('عبر سحابة سبلندر', 'عبر نظام سبلندر');
        }
        if (language === 'en' && raw.includes('via live Splendor Cloud')) {
          node.nodeValue = raw.replace('via live Splendor Cloud', 'through Splendor OS');
        }
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    const root = document.querySelector('main');
    if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [activeView, currentUser.name, currentUser.nameAr, language]);

  return null;
};
