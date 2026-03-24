/**
 * translations.ts
 * English → Turkish dictionary for the MFS Operations app.
 *
 * Hakan: review Turkish values and adjust slang/tone as needed.
 * Operational vocabulary aims for the informal Turkish used in a
 * warehouse/sales context (e.g. "Sevkiyat" not "Gönderim").
 */

export type Lang = 'en' | 'tr'

const t = {

  // ── Navigation & global ──────────────────────────────────────────────────
  logout:         { en: 'Logout',          tr: 'Çıkış' },
  loggingOut:     { en: 'Logging out…',    tr: 'Çıkılıyor…' },
  loading:        { en: 'Loading…',        tr: 'Yükleniyor…' },
  loadingTeam:    { en: 'Loading team…',   tr: 'Ekip yükleniyor…' },
  retry:          { en: 'Retry',           tr: 'Tekrar dene' },
  refresh:        { en: 'Refresh',         tr: 'Yenile' },
  save:           { en: 'Save',            tr: 'Kaydet' },
  saving:         { en: 'Saving…',         tr: 'Kaydediliyor…' },
  syncing:        { en: 'syncing',         tr: 'senkronize' },
  stuck:          { en: 'stuck',           tr: 'takılı' },
  cancel:         { en: 'Cancel',          tr: 'İptal' },
  close:          { en: 'Close',           tr: 'Kapat' },
  search:         { en: 'Search…',         tr: 'Ara…' },
  noResultsFor:   { en: 'No results for',  tr: 'Sonuç yok:' },
  tryDifferent:   { en: 'Try a different search term', tr: 'Farklı bir arama deneyin' },
  allClear:       { en: 'All clear',       tr: 'Sorun yok' },

  // ── Bottom nav labels ────────────────────────────────────────────────────
  navDispatch:    { en: 'Dispatch',    tr: 'Sevkiyat' },
  navComplaints:  { en: 'Complaints',  tr: 'Şikayetler' },
  navVisits:      { en: 'Visits',      tr: 'Ziyaretler' },
  navDashboard:   { en: 'Dashboard',   tr: 'Panel'   },
  navAdmin:       { en: 'Admin',       tr: 'Yönetim' },
  navMap:         { en: 'Map',         tr: 'Harita'  },

  // ── Login screen ─────────────────────────────────────────────────────────
  teamLogin:      { en: 'Team Login',          tr: 'Ekip Girişi' },
  teamLoginSub:   { en: 'Drivers, warehouse & sales', tr: 'Sürücüler, depo ve satış' },
  adminLogin:     { en: 'Admin Login',         tr: 'Yönetici Girişi' },
  adminLoginSub:  { en: 'Hakan & Ege only',    tr: 'Sadece Hakan & Ege' },
  inventory:      { en: 'Inventory',           tr: 'Stok Takibi' },
  inventorySub:   { en: 'Stock tracking & scanning', tr: 'Stok kontrolü ve tarama' },
  otherApps:      { en: 'Other apps',          tr: 'Diğer uygulamalar' },
  whoAreYou:      { en: 'Who are you?',        tr: 'Sen kimsin?' },
  welcomeBack:    { en: 'Welcome back',        tr: 'Hoş geldin' },
  username:       { en: 'Username',            tr: 'Kullanıcı adı' },
  password:       { en: 'Password',            tr: 'Şifre' },
  addUsersFirst:  { en: 'Add users in the Admin panel first.', tr: 'Önce Yönetim panelinden kullanıcı ekleyin.' },
  noTeamYet:      { en: 'No team members yet.', tr: 'Henüz ekip üyesi yok.' },
  hakanOrEge:     { en: 'Hakan or Ege',        tr: 'Hakan veya Ege' },

  // ── Screen 1 — Dispatch (Discrepancy Log) ────────────────────────────────
  dispatchLog:    { en: 'Dispatch Log',    tr: 'Sevkiyat Kaydı' },
  customer:       { en: 'Customer',        tr: 'Müşteri' },
  selectCustomer: { en: 'Select customer', tr: 'Müşteri seç' },
  searchCustomers:{ en: 'Search customers…', tr: 'Müşteri ara…' },
  product:        { en: 'Product',         tr: 'Ürün' },
  selectProduct:  { en: 'Select product',  tr: 'Ürün seç' },
  searchProducts: { en: 'Search products…', tr: 'Ürün ara…' },
  discrepancyStatus: { en: 'Discrepancy status', tr: 'Eksiklik durumu' },
  short:          { en: 'Short',           tr: 'Eksik' },
  notSent:        { en: 'Not sent',        tr: 'Gönderilmedi' },
  quantities:     { en: 'Quantities',      tr: 'Miktarlar' },
  orderedQty:     { en: 'Ordered quantity', tr: 'Sipariş miktarı' },
  sentQty:        { en: 'Sent quantity',   tr: 'Gönderilen miktar' },
  unit:           { en: 'Unit',            tr: 'Birim' },
  kg:             { en: 'kg',              tr: 'kg' },
  units:          { en: 'units',           tr: 'adet' },
  reason:         { en: 'Reason',          tr: 'Sebep' },
  reasonForDisc:  { en: 'Reason for discrepancy', tr: 'Eksiklik sebebi' },
  outOfStock:     { en: 'Out of stock',    tr: 'Stokta yok' },
  supplierShort:  { en: 'Supplier short',  tr: 'Tedarikçi eksik' },
  butcherError:   { en: 'Butcher error',   tr: 'Kasap hatası' },
  other:          { en: 'Other',           tr: 'Diğer' },
  noteOptional:   { en: 'Note (optional)', tr: 'Not (isteğe bağlı)' },
  optionalNote:   { en: 'Any additional context…', tr: 'Ek bilgi…' },
  logDiscrepancy: { en: 'Log Discrepancy', tr: 'Eksiklik Kaydet' },

  // ── Screen 2 — Complaint Log ──────────────────────────────────────────────
  complaintLog:   { en: 'Complaint Log',   tr: 'Şikayet Kaydı' },
  logNew:         { en: 'Log New',         tr: 'Yeni Kayıt' },
  openComplaints: { en: 'Open Complaints', tr: 'Açık Şikayetler' },
  complaintCat:   { en: 'Category',        tr: 'Kategori' },
  weight:         { en: 'Weight',          tr: 'Gramaj' },
  quality:        { en: 'Quality',         tr: 'Kalite' },
  delivery:       { en: 'Delivery',        tr: 'Teslimat' },
  missingItem:    { en: 'Missing item',    tr: 'Eksik ürün' },
  pricing:        { en: 'Pricing',         tr: 'Fiyat' },
  service:        { en: 'Service',         tr: 'Hizmet' },
  description:    { en: 'Description',     tr: 'Açıklama' },
  complaintDesc:  { en: 'What did the customer say? What was the specific issue?',
                    tr: 'Müşteri ne dedi? Sorun tam olarak neydi?' },
  receivedVia:    { en: 'Received via',    tr: 'Nasıl iletildi' },
  phone:          { en: 'Phone call',      tr: 'Telefon' },
  inPerson:       { en: 'In person',       tr: 'Yüz yüze' },
  whatsapp:       { en: 'WhatsApp',        tr: 'WhatsApp' },
  email:          { en: 'Email',           tr: 'E-posta' },
  status:         { en: 'Status',          tr: 'Durum' },
  open:           { en: 'Open',            tr: 'Açık' },
  resolved:       { en: 'Resolved',        tr: 'Çözüldü' },
  resolutionNote: { en: 'Resolution note', tr: 'Çözüm notu' },
  resolvePrompt:  { en: 'What was done to resolve this complaint?',
                    tr: 'Bu şikayet nasıl çözüldü?' },
  resolvePrompt2: { en: 'What was done to resolve this? Be specific.',
                    tr: 'Nasıl çözüldü? Detaylı yaz.' },
  logComplaint:   { en: 'Log Complaint',   tr: 'Şikayet Kaydet' },
  markResolved:   { en: 'Mark Resolved',   tr: 'Çözüldü Olarak İşaretle' },
  loggedBy:       { en: 'Logged by',       tr: 'Kaydeden' },
  noOpenComp:     { en: 'No open complaints', tr: 'Açık şikayet yok' },

  // ── Screen 3 — Visit Log ──────────────────────────────────────────────────
  visitLog:       { en: 'Visit Log',       tr: 'Ziyaret Kaydı' },
  visitType:      { en: 'Visit type',      tr: 'Ziyaret türü' },
  routine:        { en: 'Routine',         tr: 'Rutin' },
  newPitch:       { en: 'New pitch',       tr: 'Yeni teklif' },
  complaintFollowup: { en: 'Complaint follow-up', tr: 'Şikayet takibi' },
  deliveryIssue:  { en: 'Delivery issue',  tr: 'Teslimat sorunu' },
  visitOutcome:   { en: 'Visit outcome',   tr: 'Ziyaret sonucu' },
  outcome:        { en: 'Outcome',         tr: 'Sonuç' },
  positive:       { en: 'Positive',        tr: 'Olumlu' },
  neutral:        { en: 'Neutral',         tr: 'Nötr' },
  atRisk:         { en: 'At risk',         tr: 'Risk altında' },
  lost:           { en: 'Lost',            tr: 'Kaybedildi' },
  commitmentMade: { en: 'Was a commitment made?', tr: 'Taahhüt verildi mi?' },
  commitmentDetail: { en: 'Commitment detail', tr: 'Taahhüt detayı' },
  commitmentPrompt: { en: 'What was promised? (price, product, delivery arrangement…)',
                      tr: 'Ne vaat edildi? (fiyat, ürün, teslimat düzenlemesi…)' },
  existingCustomer: { en: 'Existing customer', tr: 'Mevcut müşteri' },
  newProspect:    { en: 'New prospect',    tr: 'Yeni aday' },
  prospectName:   { en: 'Prospect name',   tr: 'Aday adı' },
  prospectNameField: { en: 'Business or contact name', tr: 'İşletme veya iletişim adı' },
  prospectPostcode: { en: 'Prospect postcode', tr: 'Posta kodu' },
  postcodeOptional: { en: 'Postcode (optional)', tr: 'Posta kodu (isteğe bağlı)' },
  postcodeHint:     { en: 'Used to map prospect activity — e.g. S10 1TE', tr: 'Prospect takibi için kullanılır — ör. S10 1TE' },
  notesOptional:  { en: 'Notes (optional)', tr: 'Notlar (isteğe bağlı)' },
  notesPrompt:    { en: 'Market intelligence, competitor mentions, product feedback…',
                    tr: 'Piyasa bilgisi, rakip, ürün geri bildirimi…' },
  yes:            { en: 'Yes',             tr: 'Evet' },
  no:             { en: 'No',              tr: 'Hayır' },
  logVisit:       { en: 'Log Visit',       tr: 'Ziyaret Kaydet' },

  // ── Recent activity feed ──────────────────────────────────────────────────
  myActivityToday:   { en: 'My activity today',     tr: 'Bugünkü hareketlerim' },
  todayProgress:     { en: "Today's progress",       tr: 'Bugünkü ilerleme' },
  visitsLabel:       { en: 'Visits',                 tr: 'Ziyaretler' },
  prospectsLabel:    { en: 'Prospects',              tr: 'Prospects' },
  complaintFu:       { en: 'Complaint f/u',          tr: 'Şikayet takibi' },
  pendingSync:       { en: 'Pending sync',           tr: 'Senkronizasyon bekliyor' },
  editVisit:         { en: 'Edit visit',             tr: 'Ziyareti düzenle' },
  updateVisit:       { en: 'Update visit',           tr: 'Ziyareti güncelle' },
  deleteVisit:       { en: 'Delete visit',           tr: 'Ziyareti sil' },
  deleteConfirmMsg:  { en: 'Permanently delete this visit?', tr: 'Bu ziyareti kalıcı olarak sil?' },
  deleteConfirmYes:  { en: 'Yes, delete',            tr: 'Evet, sil' },
  cancel:            { en: 'Cancel',                 tr: 'İptal' },
  noActivityYet:     { en: 'No visits logged today', tr: 'Bugün ziyaret girilmedi' },
  loading:           { en: 'Loading…',               tr: 'Yükleniyor…' },

  // ── Language toggle ───────────────────────────────────────────────────────
  switchToTr:     { en: 'TR',              tr: 'TR' },
  switchToEn:     { en: 'EN',              tr: 'EN' },

} as const

export type TranslationKey = keyof typeof t

export function translate(key: TranslationKey, lang: Lang): string {
  return t[key][lang]
}

export default t
