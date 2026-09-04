import admin from 'firebase-admin';
import puppeteer from 'puppeteer-core';
import { createDurable } from './persistence';
import { issueNextNumber } from './idGenerator';
import { globalStore } from './dataStore';
import { LtoError, type LtoActor } from './leaseToOwn';
import type { RecordAuditFn } from './businessRules';
import { LTO_LETTERHEAD_HEADER_JPEG_BASE64, LTO_LETTERHEAD_FOOTER_PNG_BASE64 } from './assets/ltoLetterheadAsset';
import { escapeHtml } from './htmlEscape';
import type { Contract, Customer, LtoInstallment, CRMDocument } from '../types';

// ----------------------------------------------------
// LEASE-TO-OWN CONTRACT DOCUMENT GENERATION
// ----------------------------------------------------
// The approved Splendor letterhead is embedded unchanged. Contract/customer
// fields are escaped before being interpolated into the generated HTML so
// stored CRM data cannot become executable markup during PDF rendering.
// Rendering uses real Chromium so Arabic shaping/RTL is handled by the
// browser text engine rather than custom PDF shaping code.

async function launchBrowser() {
  const chromium = (await import('@sparticuz/chromium')).default;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true
  });
}

function money(n: number): string {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function arDate(iso: string | undefined): string {
  if (!iso) return '.......................';
  const d = new Date(iso);
  // This runs server-side (Vercel), whose runtime timezone is not
  // guaranteed to be UAE's -- it's commonly UTC. Without an explicit
  // timeZone, a timestamp close to midnight UAE time (UTC+4) can render as
  // the wrong calendar day on a signed legal contract. Every date on this
  // document must read as it would to someone standing in the UAE,
  // regardless of where the rendering server physically runs.
  return d.toLocaleDateString('ar-AE', { year: 'numeric', month: 'long', day: 'numeric', calendar: 'gregory', timeZone: 'Asia/Dubai' });
}

/** Builds the full Arabic contract HTML without performing I/O. */
export function buildLtoContractHtml(contract: Contract, customer: Customer, installments: LtoInstallment[]): string {
  const lto = contract.lto;
  if (!lto) throw new LtoError(`Contract ${contract.id} is not a Lease-to-Own agreement.`);

  const idLabel = customer.idType === 'passport' ? 'رقم جواز السفر' : customer.idType === 'gcc_id' ? 'رقم بطاقة الهوية الخليجية' : 'رقم الهوية الإماراتية';
  const vehicleDescription = `${escapeHtml(contract.vehicleName)} -- رقم اللوحة: ${escapeHtml(contract.vehiclePlate || 'TBD')} -- رقم الهيكل (VIN): ${escapeHtml(contract.vehicleVin || 'N/A')}`;
  const customerName = escapeHtml(customer.fullName);
  const nationality = escapeHtml(customer.nationality || '.......');
  const idNumber = escapeHtml(customer.idNumber || '.......');
  const licenseNumber = escapeHtml(customer.licenseNumber || '.......');

  const scheduleRows = installments.map(i => `
    <tr>
      <td>${i.installmentNumber}${i.isFinalPayment ? ' (دفعة نهائية)' : ''}</td>
      <td>${escapeHtml(arDate(i.dueDate))}</td>
      <td>${money(i.amount)} درهم</td>
      <td>${money(i.principalPortion)} درهم</td>
      <td>${money(i.markupPortion)} درهم</td>
    </tr>`).join('\n');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans Arabic', 'Noto Sans', Arial, sans-serif; direction: rtl; text-align: right; font-size: 12px; line-height: 1.9; color: #1a1a1a; margin: 0; padding: 0 40px; }
  h1 { text-align: center; font-size: 20px; margin: 10px 0 20px; }
  h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  p { margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 11px; }
  th, td { border: 1px solid #999; padding: 5px 8px; text-align: center; }
  th { background: #f2f2f2; }
  .party-block { display: flex; justify-content: space-between; margin-top: 50px; }
  .party { width: 45%; }
  .party p { border-bottom: 1px solid #999; padding-bottom: 14px; margin-bottom: 14px; }
</style>
</head>
<body>
  <h1>عقد إيجار سيارة ينتهي بالتملك</h1>
  <p>تم الاتفاق بتاريخ ${escapeHtml(arDate(contract.createdAt))} بين كل من:</p>
  <p><strong>أولاً:</strong> شركة سبلندر لتأجير السيارات (ويشار إليها فيما يلي بـ\"المؤجر\" - الطرف الأول).</p>
  <p><strong>ثانياً:</strong> ${customerName}، الجنسية: ${nationality}، ${idLabel}: ${idNumber}، رقم رخصة القيادة: ${licenseNumber} (ويشار إليه فيما يلي بـ\"المستأجر\" - الطرف الثاني).</p>

  <h2>تمهيد</h2>
  <p>لما كان المؤجر يعمل في مجال تأجير السيارات بغرض نقل ملكية المركبة إلى المستأجر بعد سداد كامل القيمة الإيجارية المتفق عليها خلال المدة الزمنية المحددة في هذا العقد، وحيث إن المستأجر قد عاين المركبة معاينة تامة نافية للجهالة واطلع على جميع شروطها ومواصفاتها ووثائقها، وحيث إن الطرفين في كامل الأهلية القانونية، فقد اتفق الطرفان على ما يلي:</p>
  <h2>البند الأول -- التمهيد جزء من العقد</h2>
  <p>يعتبر التمهيد السابق جزءاً لا يتجزأ من هذا العقد ومكملاً لبنوده.</p>
  <h2>البند الثاني -- وصف المركبة</h2>
  <p>${vehicleDescription}</p>
  <h2>البند الثالث -- القيمة الإيجارية وجدول السداد</h2>
  <p>تبلغ القيمة الإجمالية لهذا العقد ${money(lto.totalContractValue)} درهم إماراتي، منها دفعة مقدمة قدرها ${money(lto.downPayment)} درهم، وقسط شهري قدره ${money(lto.monthlyInstallment)} درهم لمدة ${lto.termMonths} شهراً${lto.finalPayment > 0 ? `، بالإضافة إلى دفعة نهائية قدرها ${money(lto.finalPayment)} درهم` : ''}. يوضح الجدول أدناه توزيع كل قسط بين الجزء الذي يُحتسب من أصل قيمة التملك والجزء الآخر، بحيث يصبح المستأجر مالكاً تدريجياً للمركبة كلما سدد أقساطه.</p>
  <table><thead><tr><th>رقم القسط</th><th>تاريخ الاستحقاق</th><th>القيمة</th><th>حصة أصل التملك</th><th>الحصة الأخرى</th></tr></thead><tbody>${scheduleRows}</tbody></table>
  <p>يحق للمؤجر فسخ هذا العقد واسترداد المركبة في حال تأخر المستأجر عن سداد الأقساط لمدة شهرين متتاليين.</p>
  <h2>البند الرابع -- استعمال المركبة</h2>
  <p>لا يجوز للمستأجر استعمال المركبة في غير الأغراض المخصصة لها، ولا إجراء أي تعديل عليها إلا بموافقة كتابية من المؤجر، ويكون المستأجر مسؤولاً نظامياً ومالياً عن أي ضرر يلحق بالمركبة أثناء استعمالها.</p>
  <h2>البند الخامس -- حظر البيع أو التأجير من الباطن</h2>
  <p>لا يجوز للمستأجر بيع المركبة أو تأجيرها لآخر إلا بموافقة كتابية مسبقة من المؤجر. وفي حال مخالفة هذا البند يُعتبر العقد مفسوخاً من تلقاء نفسه دون حاجة للجوء إلى القضاء، ويحق للمؤجر استرداد المركبة في أي وقت دون الرجوع إلى المستأجر، ودون أن يحق للمستأجر المطالبة بما سبق سداده.</p>
  <h2>البند السادس -- التسوية المبكرة ونقل الملكية</h2>
  <p>إذا رغب المستأجر في سداد كامل الأقساط المتبقية قبل الموعد المحدد، يقوم المؤجر بتسوية المديونية بالكامل ونقل ملكية المركبة إلى المستأجر فوراً، على نفقة المستأجر الراغب في ذلك.</p>
  <h2>البند السابع -- التزامات المستأجر تجاه المركبة</h2>
  <p>يكون المستأجر مسؤولاً مسؤولية كاملة عن المحافظة على المركبة، ويتحمل تكاليف الصيانة التشغيلية، ومصاريف التأمين الشامل، ورسوم الترخيص السنوي، ورسوم البوابات المرورية (سالك ودرب)، والالتزام بجميع القوانين واللوائح المنظمة للسير والمرور داخل دولة الإمارات العربية المتحدة.</p>
  <h2>البند الثامن -- مدة العقد والتسليم</h2>
  <p>تبدأ مدة هذا العقد اعتباراً من تاريخ تسليم المركبة للمستأجر بتاريخ ${escapeHtml(arDate(contract.startDateTime))} وحتى ${escapeHtml(arDate(contract.endDateTime))}، وذلك بموجب محضر تسليم موقّع من الطرفين يثبت خلو المركبة من العيوب. ومنذ تاريخ التسليم تصبح المركبة، من ناحية المسؤولية الجنائية والمدنية والمخالفات المرورية، على عاتق المستأجر دون غيره.</p>
  <h2>البند التاسع -- القانون الواجب التطبيق</h2>
  <p>يخضع هذا العقد لقوانين دولة الإمارات العربية المتحدة، وبصفة خاصة قانون المعاملات المدنية الإماراتي ولائحته التنفيذية. وكل خلاف ينشأ عن تطبيق هذا العقد ولا يتم تسويته ودياً بين الطرفين تختص بالفصل فيه المحكمة الإدارية المختصة، ويكون حكمها نهائياً.</p>
  <p style="margin-top:24px;">وتوثيقاً لما تقدم، وقّع الطرفان على هذا العقد. والله ولي التوفيق.</p>
  <div class="party-block">
    <div class="party"><p><strong>الطرف الأول (المؤجر): شركة سبلندر لتأجير السيارات</strong></p><p>الاسم: ..................................</p><p>التوقيع: ..................................</p><p>التاريخ: ..................................</p></div>
    <div class="party"><p><strong>الطرف الثاني (المستأجر): ${customerName}</strong></p><p>الاسم: ..................................</p><p>التوقيع: ..................................</p><p>التاريخ: ..................................</p></div>
  </div>
</body>
</html>`;
}

function headerTemplate(): string {
  return `<div style="width:100%;margin:0;padding:0;"><img src="data:image/jpeg;base64,${LTO_LETTERHEAD_HEADER_JPEG_BASE64}" style="width:100%;display:block;" /></div>`;
}

function footerTemplate(): string {
  return `<div style="width:100%;margin:0;padding:0;"><img src="data:image/png;base64,${LTO_LETTERHEAD_FOOTER_PNG_BASE64}" style="width:100%;display:block;" /></div>`;
}

export async function renderLtoContractPdf(contract: Contract, customer: Customer, installments: LtoInstallment[]): Promise<Buffer> {
  const html = buildLtoContractHtml(contract, customer, installments);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4', printBackground: true, displayHeaderFooter: true,
      headerTemplate: headerTemplate(), footerTemplate: footerTemplate(),
      // Header/footer margins must match the real letterhead image's own
      // aspect ratio scaled to full A4 width (no left/right margin), or
      // Chromium's fixed-height header/footer box clips the image instead
      // of scaling it to fit. Header 1240x350px, footer 1240x93px -> at the
      // A4 printable width (~793.7px), header needs ~224px and footer ~60px.
      margin: { top: '226px', bottom: '60px', left: '0px', right: '0px' }
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

export async function generateLtoContractDocument(contractId: string, actor: LtoActor, recordAudit: RecordAuditFn): Promise<CRMDocument> {
  const contract = globalStore.contracts.find(c => c.id === contractId);
  if (!contract) throw new LtoError(`Contract ${contractId} not found.`);
  if (contract.contractType !== 'lease_to_own' || !contract.lto) throw new LtoError(`Contract ${contractId} is not a Lease-to-Own agreement.`);
  const customer = globalStore.customers.find(c => c.id === contract.customerId);
  if (!customer) throw new LtoError(`Customer ${contract.customerId} not found.`);
  const installmentsSnap = await admin.firestore().collection('lto_installments').where('contractId', '==', contractId).get();
  const installments = installmentsSnap.docs.map(d => d.data() as LtoInstallment).sort((a, b) => a.installmentNumber - b.installmentNumber);
  const pdfBuffer = await renderLtoContractPdf(contract, customer, installments);
  const docId = await issueNextNumber('Document');
  const now = new Date().toISOString();
  const storagePath = `lease-to-own-contracts/${contract.id}/${docId}.pdf`;
  await admin.storage().bucket().file(storagePath).save(pdfBuffer, { metadata: { contentType: 'application/pdf' } });
  const document: CRMDocument = {
    id: docId, title: `عقد الإيجار المنتهي بالتملك -- ${contract.id}`, category: 'contract',
    fileName: `${contract.id}-lease-to-own-agreement.pdf`, fileSize: `${Math.max(1, Math.round(pdfBuffer.length / 1024))} KB`,
    fileType: 'application/pdf', fileUrl: `/api/documents/file?path=${encodeURIComponent(storagePath)}`,
    relatedEntityType: 'contract', relatedEntityId: contract.id, relatedEntityName: contract.customerName,
    version: 1, uploadedBy: actor.uid, uploadedAt: now
  };
  await createDurable('documents', document as unknown as { id: string });
  globalStore.documents.unshift(document);
  await recordAudit({ userId: actor.uid, userName: actor.name, userRole: actor.role, entityType: 'Contract', entityId: contract.id, action: 'create', newValue: `Generated the Lease-to-Own contract document (${docId}) from the system's own approved template.` });
  return document;
}
