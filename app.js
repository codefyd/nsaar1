
(() => {
  const API_URL = window.APP_CONFIG?.API_URL || '';
  const state = {
    token: localStorage.getItem('quran_center_token') || '',
    userName: localStorage.getItem('quran_center_name') || '',
    userRole: localStorage.getItem('quran_center_role') || '',
    bundle: null,
    publicSettings: null,
    achievements: null
  };

  const loginModal = new bootstrap.Modal(document.getElementById('staffLoginModal'));
  const globalLoader = document.getElementById('globalLoader');

  function showLoader(show = true) { globalLoader.classList.toggle('d-none', !show); }
  function ensureConfig() {
    if (!API_URL) {
      Swal.fire({ icon: 'warning', title: 'إعدادات ناقصة', text: 'ضع رابط Google Apps Script داخل config.js' });
      return false;
    }
    return true;
  }

  async function api(action, data = {}, withToken = false, method = 'POST') {
    if (!ensureConfig()) throw new Error('Missing config');
    showLoader(true);
    try {
      if (method === 'GET') {
        const params = new URLSearchParams({ action, ...data, ...(withToken && state.token ? { token: state.token } : {}) });
        const res = await fetch(`${API_URL}?${params.toString()}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'حدث خطأ');
        return json;
      }
      const body = new URLSearchParams();
      body.append('action', action);
      Object.entries(data).forEach(([k, v]) => body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));
      if (withToken && state.token) body.append('token', state.token);
      const res = await fetch(API_URL, { method: 'POST', body });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'حدث خطأ');
      return json;
    } finally {
      showLoader(false);
    }
  }

  function saveSession(data) {
    state.token = data.token; state.userName = data.name; state.userRole = data.role;
    localStorage.setItem('quran_center_token', data.token);
    localStorage.setItem('quran_center_name', data.name);
    localStorage.setItem('quran_center_role', data.role);
    updateAuthUI();
  }
  function clearSession() {
    state.token = ''; state.userName = ''; state.userRole = ''; state.bundle = null;
    localStorage.removeItem('quran_center_token'); localStorage.removeItem('quran_center_name'); localStorage.removeItem('quran_center_role');
    updateAuthUI();
  }
  function updateAuthUI() { document.getElementById('logoutBtn').classList.toggle('d-none', !state.token); }

  function byId(id) { return document.getElementById(id); }
  function getTabButtons() { return [...document.querySelectorAll('#staffTabs .nav-link')]; }
  function htmlEscape(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  function nl2br(v) { return htmlEscape(v).replace(/\n/g, '<br>'); }
  function formatDate(v) { if (!v) return '-'; const d = new Date(v); return isNaN(d) ? v : d.toLocaleString('ar-SA'); }
  function toNumber(v) { return Number(v || 0) || 0; }

  function route() {
    const view = (location.hash || '#/home').replace('#/', '');
    document.querySelectorAll('.view-section').forEach(s => s.classList.add('d-none'));
    const map = { home: 'homeView', register: 'registerView', student: 'studentView', achievements: 'achievementsView', staff: 'staffView' };
    const target = byId(map[view] || 'homeView');
    target.classList.remove('d-none');
    if (view === 'staff') {
      if (!state.token) { loginModal.show(); location.hash = '#/home'; return; }
      loadDashboard();
    }
    if (view === 'achievements') loadAchievements();
  }

  async function loadPublicSettings() {
    const res = await api('getPublicBootstrap', {}, false, 'GET');
    state.publicSettings = res.data;
    fillPublicSelects();
    renderAchievements(res.data['الإنجازات']);
  }

  function fillSelect(selectId, items, placeholder) {
    const select = byId(selectId);
    select.innerHTML = `<option value="">${placeholder}</option>` + (items || []).map(v => `<option>${htmlEscape(v)}</option>`).join('');
  }

  function fillPublicSelects() {
    const p = state.publicSettings || {};
    fillSelect('selectLevel', p['المراحل الدراسية'], 'اختر المرحلة');
    fillSelect('selectGrade', p['الصفوف الدراسية'], 'اختر الصف');
    fillSelect('selectRelation', p['صلات ولي الأمر'], 'اختر الصلة');
  }

  function statCard(label, value, icon, note='') {
    return `<div class="col-lg-3 col-md-6"><div class="kpi-card"><div class="bg-icon-float"><i class="fa-solid ${icon}"></i></div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="small-muted">${note}</div></div></div>`;
  }

  function dataItem(label, value) { return `<div class="data-item"><div class="label">${label}</div><div class="value">${value || '-'}</div></div>`; }
  function roleCan(...roles) { return roles.includes(state.userRole); }
  function whatsappUrl(phone, message) { const clean = String(phone || '').replace(/\D/g, ''); return `https://wa.me/${clean}?text=${encodeURIComponent(message || '')}`; }

  function replaceVars(text, vars) {
    let out = String(text || '');
    Object.entries(vars || {}).forEach(([k, v]) => { out = out.replaceAll(`{{${k}}}`, String(v ?? '')); });
    return out;
  }

  function getTemplateByKey(key) {
    const items = state.bundle?.['الإعدادات']?.['قوالب واتساب'] || [];
    return items.find(x => x['المفتاح'] === key) || null;
  }

  function buildWhatsappMessage(key, vars) {
    const template = getTemplateByKey(key);
    if (!template) return '';
    return replaceVars(template['النص'], vars);
  }

  async function loadDashboard() {
    try {
      const res = await api('getDashboardBundle', {}, true);
      state.bundle = res.data;
      byId('staffWelcome').textContent = `${state.bundle['المستخدم']['الاسم']} — ${state.bundle['المستخدم']['الدور']}`;
      renderDashboard();
      updateTabVisibility();
    } catch (e) {
      clearSession();
      Swal.fire({ icon: 'error', title: 'تعذر فتح البوابة', text: e.message });
      location.hash = '#/home';
    }
  }

  function renderDashboard() {
    const s = state.bundle['إحصائيات'];
    byId('dashboardStats').innerHTML = [
      statCard('إجمالي الطلاب', s['إجمالي الطلاب'], 'fa-users', 'حسب الصلاحية'),
      statCard('الطلبات الجديدة', s['الطلبات الجديدة'], 'fa-inbox', 'بانتظار المعالجة'),
      statCard('إنذارات تعليمية', s['الإنذارات التعليمية'], 'fa-triangle-exclamation', 'إجمالي الإنذارات'),
      statCard('إنذارات إدارية مفتوحة', s['الإنذارات الإدارية المفتوحة'], 'fa-list-check', 'تأخر/غياب/بعذر')
    ].join('');
    renderStudents(); renderRequests(); renderEduWarnings(); renderAdminWarnings(); renderNotes(); renderSettings(); renderLogs();
  }

  function renderStudents() {
    const students = state.bundle['الطلاب'] || [];
    const rows = students.map(s => `
      <tr>
        <td><button class="btn btn-link p-0 student-details" data-id="${htmlEscape(s['هوية الطالب'])}">${htmlEscape(s['اسم الطالب ثلاثي'])}</button></td>
        <td>${htmlEscape(s['هوية الطالب'])}</td>
        <td>${htmlEscape(s['الحلقة'])}</td>
        <td>${htmlEscape(s['المرحلة الدراسية'])}</td>
        <td>${htmlEscape(s['الصف الدراسي'])}</td>
        <td>${toNumber(s['مجموع الحفظ'])}</td>
        <td>${htmlEscape(s['حالة الطالب'])}</td>
        <td>${toNumber(s['عدد التأخرات'])}/${toNumber(s['عدد الغيابات'])}/${toNumber(s['عدد الغيابات بعذر'])}</td>
      </tr>`).join('');
    byId('studentsTab').innerHTML = `
      <div class="table-card">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <h5 class="mb-0">إدارة الطلاب</h5>
          ${roleCan('مدير','مشرف إداري') ? '<div class="d-flex gap-2"><button class="btn btn-primary btn-sm" id="addStudentBtn">إضافة طالب</button><button class="btn btn-outline-primary btn-sm" id="bulkUpdateBtn">تعديل جماعي</button></div>' : ''}
        </div>
        <div class="table-responsive"><table class="table align-middle"><thead><tr><th>الاسم</th><th>الهوية</th><th>الحلقة</th><th>المرحلة</th><th>الصف</th><th>الحفظ</th><th>الحالة</th><th>تأخر/غياب/بعذر</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="text-center text-muted">لا توجد بيانات</td></tr>'}</tbody></table></div>
      </div>`;
    document.querySelectorAll('.student-details').forEach(b => b.addEventListener('click', () => showStudentDetails(b.dataset.id)));
    byId('addStudentBtn')?.addEventListener('click', onAddStudent);
    byId('bulkUpdateBtn')?.addEventListener('click', onBulkUpdateStudents);
  }

  async function showStudentDetails(studentId) {
    const s = (state.bundle['الطلاب'] || []).find(x => x['هوية الطالب'] === studentId);
    if (!s) return;
    const canEdit = roleCan('مدير','مشرف إداري');
    const canNote = roleCan('معلم','مدير','مشرف إداري');
    const html = `
      <div class="text-end">
        <div class="data-grid mb-3">
          ${dataItem('الاسم الرباعي', s['اسم الطالب ثلاثي'])}
          ${dataItem('رقم الهوية', s['هوية الطالب'])}
          ${dataItem('رقم الجوال', s['رقم جوال الطالب'])}
          ${dataItem('الحي / العنوان', s['العنوان / الحي'])}
          ${dataItem('المرحلة الدراسية', s['المرحلة الدراسية'])}
          ${dataItem('الصف الدراسي', s['الصف الدراسي'])}
          ${dataItem('جوال ولي الأمر', s['رقم جوال ولي الأمر'])}
          ${dataItem('هوية ولي الأمر', s['رقم هوية ولي الأمر'])}
          ${dataItem('صلة ولي الأمر', s['صلة ولي الأمر'])}
          ${dataItem('الحلقة', s['الحلقة'])}
          ${dataItem('مجموع الحفظ', s['مجموع الحفظ'])}
          ${dataItem('حالة الطالب', s['حالة الطالب'])}
        </div>
        <div class="d-flex gap-2 flex-wrap">
          ${canEdit ? '<button class="btn btn-primary" id="editStudentModalBtn">تعديل</button>' : ''}
          ${canNote ? '<button class="btn btn-outline-primary" id="addTeacherNoteBtn">إضافة ملاحظة</button>' : ''}
          <a class="btn btn-outline-success" target="_blank" href="${whatsappUrl(s['رقم جوال ولي الأمر'], buildWhatsappMessage('عام', { 'اسم الطالب': s['اسم الطالب ثلاثي'], 'الحلقة': s['الحلقة'] }))}">واتساب ولي الأمر</a>
        </div>
      </div>`;
    await Swal.fire({ title: 'تفاصيل الطالب', html, width: 1000, showConfirmButton: false, didOpen: () => {
      byId('editStudentModalBtn')?.addEventListener('click', () => onEditStudent(s));
      byId('addTeacherNoteBtn')?.addEventListener('click', () => onAddTeacherNote(s));
    }});
  }

  async function onAddStudent() {
    const { value } = await Swal.fire({
      title: 'إضافة طالب', width: 900,
      html: studentFormHtml({}), showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء',
      preConfirm: () => collectStudentFormValues()
    });
    if (!value) return;
    try { await api('saveStudent', value, true); await loadDashboard(); Swal.fire({ icon: 'success', title: 'تم الحفظ' }); } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message }); }
  }

  async function onEditStudent(s) {
    const { value } = await Swal.fire({
      title: 'تعديل الطالب', width: 900,
      html: studentFormHtml(s), showCancelButton: true, confirmButtonText: 'حفظ', cancelButtonText: 'إلغاء',
      preConfirm: () => collectStudentFormValues(s['هوية الطالب'])
    });
    if (!value) return;
    try { await api('saveStudent', value, true); await loadDashboard(); Swal.fire({ icon: 'success', title: 'تم التعديل' }); } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message }); }
  }

  function studentFormHtml(s = {}) {
    const lists = state.bundle?.['الإعدادات'] || {};
    const levels = (lists['المراحل الدراسية'] || []).map(v => `<option ${s['المرحلة الدراسية']===v?'selected':''}>${htmlEscape(v)}</option>`).join('');
    const grades = (lists['الصفوف الدراسية'] || []).map(v => `<option ${s['الصف الدراسي']===v?'selected':''}>${htmlEscape(v)}</option>`).join('');
    const circles = (lists['الحلق'] || []).map(v => `<option ${s['الحلقة']===v?'selected':''}>${htmlEscape(v)}</option>`).join('');
    const status = (lists['حالات الطلاب'] || []).map(v => `<option ${s['حالة الطالب']===v?'selected':''}>${htmlEscape(v)}</option>`).join('');
    const rel = (lists['صلات ولي الأمر'] || []).map(v => `<option ${s['صلة ولي الأمر']===v?'selected':''}>${htmlEscape(v)}</option>`).join('');
    return `
    <div class="row g-2 text-end">
      <div class="col-md-6"><input id="f1" class="swal2-input" placeholder="اسم الطالب ثلاثي" value="${htmlEscape(s['اسم الطالب ثلاثي']||'')}"></div>
      <div class="col-md-6"><input id="f2" class="swal2-input" placeholder="هوية الطالب" value="${htmlEscape(s['هوية الطالب']||'')}"></div>
      <div class="col-md-6"><input id="f3" class="swal2-input" placeholder="رقم جوال الطالب" value="${htmlEscape(s['رقم جوال الطالب']||'')}"></div>
      <div class="col-md-6"><input id="f4" class="swal2-input" placeholder="تاريخ ميلاد الطالب" value="${htmlEscape(s['تاريخ ميلاد الطالب']||'')}"></div>
      <div class="col-md-6"><input id="f5" class="swal2-input" placeholder="العنوان / الحي" value="${htmlEscape(s['العنوان / الحي']||'')}"></div>
      <div class="col-md-3"><select id="f6" class="swal2-select"><option value="">المرحلة الدراسية</option>${levels}</select></div>
      <div class="col-md-3"><select id="f7" class="swal2-select"><option value="">الصف الدراسي</option>${grades}</select></div>
      <div class="col-md-6"><input id="f8" class="swal2-input" placeholder="اسم ولي الأمر ثلاثي" value="${htmlEscape(s['اسم ولي الأمر ثلاثي']||'')}"></div>
      <div class="col-md-6"><input id="f9" class="swal2-input" placeholder="رقم جوال ولي الأمر" value="${htmlEscape(s['رقم جوال ولي الأمر']||'')}"></div>
      <div class="col-md-6"><input id="f10" class="swal2-input" placeholder="رقم هوية ولي الأمر" value="${htmlEscape(s['رقم هوية ولي الأمر']||'')}"></div>
      <div class="col-md-6"><select id="f11" class="swal2-select"><option value="">صلة ولي الأمر</option>${rel}</select></div>
      <div class="col-md-4"><select id="f12" class="swal2-select"><option value="">الحلقة</option>${circles}</select></div>
      <div class="col-md-4"><input id="f13" class="swal2-input" placeholder="مجموع الحفظ" value="${htmlEscape(s['مجموع الحفظ']||'0')}"></div>
      <div class="col-md-4"><select id="f14" class="swal2-select"><option value="">حالة الطالب</option>${status}</select></div>
      <div class="col-md-4"><input id="f15" class="swal2-input" placeholder="عدد التأخرات" value="${htmlEscape(s['عدد التأخرات']||'0')}"></div>
      <div class="col-md-4"><input id="f16" class="swal2-input" placeholder="عدد الغيابات" value="${htmlEscape(s['عدد الغيابات']||'0')}"></div>
      <div class="col-md-4"><input id="f17" class="swal2-input" placeholder="عدد الغيابات بعذر" value="${htmlEscape(s['عدد الغيابات بعذر']||'0')}"></div>
    </div>`;
  }

  function collectStudentFormValues(existingId = '') {
    return {
      'هوية الطالب الأصلية': existingId,
      'اسم الطالب ثلاثي': byId('f1').value.trim(),
      'هوية الطالب': byId('f2').value.trim(),
      'رقم جوال الطالب': byId('f3').value.trim(),
      'تاريخ ميلاد الطالب': byId('f4').value.trim(),
      'العنوان / الحي': byId('f5').value.trim(),
      'المرحلة الدراسية': byId('f6').value,
      'الصف الدراسي': byId('f7').value,
      'اسم ولي الأمر ثلاثي': byId('f8').value.trim(),
      'رقم جوال ولي الأمر': byId('f9').value.trim(),
      'رقم هوية ولي الأمر': byId('f10').value.trim(),
      'صلة ولي الأمر': byId('f11').value,
      'الحلقة': byId('f12').value,
      'مجموع الحفظ': byId('f13').value.trim() || '0',
      'حالة الطالب': byId('f14').value,
      'عدد التأخرات': byId('f15').value.trim() || '0',
      'عدد الغيابات': byId('f16').value.trim() || '0',
      'عدد الغيابات بعذر': byId('f17').value.trim() || '0'
    };
  }

  async function onBulkUpdateStudents() {
    const students = state.bundle['الطلاب'] || [];
    const options = students.map(s => `<option value="${htmlEscape(s['هوية الطالب'])}">${htmlEscape(s['اسم الطالب ثلاثي'])} — ${htmlEscape(s['هوية الطالب'])}</option>`).join('');
    const circles = (state.bundle['الإعدادات']['الحلق'] || []).map(v => `<option>${htmlEscape(v)}</option>`).join('');
    const grades = (state.bundle['الإعدادات']['الصفوف الدراسية'] || []).map(v => `<option>${htmlEscape(v)}</option>`).join('');
    const status = (state.bundle['الإعدادات']['حالات الطلاب'] || []).map(v => `<option>${htmlEscape(v)}</option>`).join('');
    const { value } = await Swal.fire({
      title: 'تعديل جماعي', width: 900, showCancelButton: true, confirmButtonText: 'تنفيذ', cancelButtonText: 'إلغاء',
      html: `<div class="text-end"><select id="bulkIds" class="swal2-select" multiple size="8">${options}</select><select id="bulkCircle" class="swal2-select"><option value="">الحلقة</option>${circles}</select><select id="bulkGrade" class="swal2-select"><option value="">الصف</option>${grades}</select><input id="bulkMem" class="swal2-input" placeholder="مجموع الحفظ"><select id="bulkStatus" class="swal2-select"><option value="">حالة الطالب</option>${status}</select></div>`,
      preConfirm: () => ({
        ids: [...byId('bulkIds').selectedOptions].map(o => o.value),
        'الحلقة': byId('bulkCircle').value,
        'الصف الدراسي': byId('bulkGrade').value,
        'مجموع الحفظ': byId('bulkMem').value,
        'حالة الطالب': byId('bulkStatus').value
      })
    });
    if (!value || !value.ids.length) return;
    try { await api('bulkUpdateStudents', value, true); await loadDashboard(); Swal.fire({ icon: 'success', title: 'تم التحديث الجماعي' }); } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر التنفيذ', text: e.message }); }
  }

  function renderRequests() {
    const reqs = state.bundle['الطلبات'] || [];
    const rows = reqs.map(r => `<tr>
      <td>${r['رقم الطلب']}</td><td>${r['نوع الطلب']}</td><td>${htmlEscape(r['اسم الطالب ثلاثي'])}</td><td>${htmlEscape(r['هوية الطالب'])}</td><td>${htmlEscape(r['المرحلة الدراسية'])}</td><td>${htmlEscape(r['الصف الدراسي'])}</td><td>${htmlEscape(r['حالة الطلب'])}</td><td>${formatDate(r['تاريخ الطلب'])}</td>
      <td>${renderRequestActions(r)}</td>
    </tr>`).join('');
    byId('requestsTab').innerHTML = `<div class="table-card"><h5 class="mb-3">الطلبات الواردة</h5><div class="table-responsive"><table class="table align-middle"><thead><tr><th>الرقم</th><th>النوع</th><th>الاسم</th><th>الهوية</th><th>المرحلة</th><th>الصف</th><th>الحالة</th><th>التاريخ</th><th>الإجراء</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="text-center text-muted">لا توجد طلبات</td></tr>'}</tbody></table></div></div>`;
    document.querySelectorAll('.req-act').forEach(btn => btn.addEventListener('click', () => onRequestAction(btn.dataset.id, btn.dataset.action)));
    document.querySelectorAll('.wa-btn').forEach(btn => btn.addEventListener('click', () => openRequestWhatsapp(btn.dataset.id)));
  }

  function renderRequestActions(r) {
    const can = roleCan('مدير','مشرف إداري') && ['جديد','انتظار','تعديل جديد'].includes(r['حالة الطلب']);
    return `${can ? `<div class="d-flex gap-1 flex-wrap"><button class="btn btn-success btn-sm req-act" data-id="${r['رقم الطلب']}" data-action="قبول">قبول</button><button class="btn btn-warning btn-sm req-act" data-id="${r['رقم الطلب']}" data-action="انتظار">انتظار</button><button class="btn btn-outline-danger btn-sm req-act" data-id="${r['رقم الطلب']}" data-action="رفض">رفض</button><button class="btn btn-outline-success btn-sm wa-btn" data-id="${r['رقم الطلب']}">واتساب</button></div>` : '<span class="text-muted">—</span>'}`;
  }

  async function openRequestWhatsapp(requestId) {
    const r = (state.bundle['الطلبات'] || []).find(x => x['رقم الطلب'] === requestId);
    if (!r) return;
    const key = r['نوع الطلب'] === 'تسجيل' ? 'طلب_تسجيل' : 'طلب_تعديل';
    const text = buildWhatsappMessage(key, {
      'اسم الطالب': r['اسم الطالب ثلاثي'], 'المرحلة': r['المرحلة الدراسية'], 'الصف': r['الصف الدراسي'], 'رقم الطلب': r['رقم الطلب'], 'الحلقة': r['الحلقة المقترحة'] || '', 'الحالة': r['حالة الطلب']
    });
    window.open(whatsappUrl(r['رقم جوال ولي الأمر'] || r['رقم جوال الطالب'], text), '_blank');
  }

  async function onRequestAction(requestId, action) {
    const req = (state.bundle['الطلبات'] || []).find(x => x['رقم الطلب'] === requestId);
    if (!req) return;
    let extra = {};
    if (action === 'قبول' && req['نوع الطلب'] === 'تسجيل') {
      const circles = (state.bundle['الإعدادات']['الحلق'] || []).map(v => `<option>${htmlEscape(v)}</option>`).join('');
      const { value } = await Swal.fire({ title: 'اعتماد الطلب', html: `<select id="accCircle" class="swal2-select"><option value="">اختر الحلقة</option>${circles}</select>`, showCancelButton: true, preConfirm: () => ({ 'الحلقة': byId('accCircle').value }) });
      if (!value?.['الحلقة']) return;
      extra = value;
    }
    if (action === 'رفض') {
      const { value } = await Swal.fire({ title: 'سبب الرفض', input: 'text', inputValidator: v => !v && 'السبب مطلوب', showCancelButton: true });
      if (!value) return;
      extra = { 'سبب الرفض': value };
    }
    try { await api('processRequest', { 'رقم الطلب': requestId, 'الإجراء': action, ...extra }, true); await loadDashboard(); Swal.fire({ icon: 'success', title: 'تم التنفيذ' }); } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر التنفيذ', text: e.message }); }
  }

  function renderEduWarnings() {
    const items = state.bundle['الإنذارات التعليمية'] || [];
    const rows = items.map(w => `<tr><td>${htmlEscape(w['اسم الطالب'])}</td><td>${htmlEscape(w['هوية الطالب'])}</td><td>${htmlEscape(w['نوع الإنذار'])}</td><td>${htmlEscape(w['سبب الإنذار'])}</td><td>${htmlEscape(w['الإجراء الحالي'])}</td><td>${formatDate(w['تاريخ الإنذار'])}</td><td><a class="btn btn-outline-success btn-sm" target="_blank" href="${whatsappUrl(w['رقم جوال ولي الأمر'], buildWhatsappMessage('إنذار_تعليمي', { 'اسم الطالب': w['اسم الطالب'], 'سبب الإنذار': w['سبب الإنذار'], 'الإجراء': w['الإجراء الحالي'], 'الحلقة': w['الحلقة'] }))}">واتساب</a></td></tr>`).join('');
    byId('eduWarningsTab').innerHTML = `
      <div class="table-card">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><h5 class="mb-0">الإنذارات التعليمية</h5>${roleCan('مدير','مشرف تعليمي','مشرف إداري') ? '<button class="btn btn-primary btn-sm" id="addEduWarningBtn">إضافة إنذار</button>' : ''}</div>
        <div class="table-responsive"><table class="table align-middle"><thead><tr><th>الطالب</th><th>الهوية</th><th>النوع</th><th>السبب</th><th>الإجراء الحالي</th><th>التاريخ</th><th>التواصل</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="text-center text-muted">لا توجد بيانات</td></tr>'}</tbody></table></div>
      </div>`;
    byId('addEduWarningBtn')?.addEventListener('click', onAddEduWarning);
  }

  async function onAddEduWarning() {
    const students = state.bundle['الطلاب'] || [];
    const types = state.bundle['الإعدادات']['أنواع الإنذارات التعليمية'] || [];
    const actions = state.bundle['الإعدادات']['إجراءات الإنذارات التعليمية'] || [];
    const { value } = await Swal.fire({
      title: 'إضافة إنذار تعليمي', width: 900, showCancelButton: true,
      html: `<select id="ew1" class="swal2-select">${students.map(s => `<option value="${htmlEscape(s['هوية الطالب'])}">${htmlEscape(s['اسم الطالب ثلاثي'])}</option>`).join('')}</select><select id="ew2" class="swal2-select">${types.map(v => `<option>${htmlEscape(v)}</option>`).join('')}</select><input id="ew3" class="swal2-input" placeholder="سبب الإنذار"><select id="ew4" class="swal2-select">${actions.map(v => `<option>${htmlEscape(v)}</option>`).join('')}</select><textarea id="ew5" class="swal2-textarea" placeholder="ملاحظات"></textarea>`,
      preConfirm: () => ({ 'هوية الطالب': byId('ew1').value, 'نوع الإنذار': byId('ew2').value, 'سبب الإنذار': byId('ew3').value, 'الإجراء الحالي': byId('ew4').value, 'ملاحظات': byId('ew5').value })
    });
    if (!value) return;
    try { await api('addEducationalWarning', value, true); await loadDashboard(); Swal.fire({ icon: 'success', title: 'تمت الإضافة' }); } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message }); }
  }

  function renderAdminWarnings() {
    const section = state.bundle['الإنذارات الإدارية'] || {};
    const groups = ['التأخر','الغياب','الغياب بعذر'];
    byId('adminWarningsTab').innerHTML = `
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h5 class="mb-0">الإنذارات الإدارية</h5>
        ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-primary btn-sm" id="generateAdminWarningsBtn">توليد الإنذارات المستحقة</button>' : ''}
      </div>
      <div class="row g-3">${groups.map(g => renderAdminWarningGroup(g, section[g] || [])).join('')}</div>`;
    byId('generateAdminWarningsBtn')?.addEventListener('click', onGenerateAdministrativeWarnings);
    document.querySelectorAll('.complete-admin-warning').forEach(btn => btn.addEventListener('click', () => onCompleteAdministrativeWarning(btn.dataset.id)));
    document.querySelectorAll('.wa-admin').forEach(btn => btn.addEventListener('click', () => onOpenAdministrativeWhatsapp(btn.dataset.id)));
  }

  function renderAdminWarningGroup(title, items) {
    const rows = items.map(w => `<tr><td>${htmlEscape(w['اسم الطالب'])}</td><td>${htmlEscape(w['رقم العتبة'])}</td><td>${htmlEscape(w['العدد الحالي'])}</td><td>${htmlEscape(w['الإجراء'])}</td><td>${formatDate(w['تاريخ الإنذار'])}</td><td><div class="d-flex gap-1 flex-wrap"><button class="btn btn-outline-success btn-sm wa-admin" data-id="${w['id']}">واتساب</button>${roleCan('مدير','مشرف إداري') ? `<button class="btn btn-success btn-sm complete-admin-warning" data-id="${w['id']}">إكمال</button>` : ''}</div></td></tr>`).join('');
    return `<div class="col-12"><div class="table-card"><h6 class="fw-bold mb-3">${title}</h6><div class="table-responsive"><table class="table align-middle"><thead><tr><th>الطالب</th><th>العتبة</th><th>العدد</th><th>الإجراء الحالي</th><th>التاريخ</th><th>الإجراء</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="text-center text-muted">لا توجد إنذارات مفتوحة</td></tr>'}</tbody></table></div></div></div>`;
  }

  async function onGenerateAdministrativeWarnings() {
    try { const res = await api('generateAdministrativeWarnings', {}, true); await loadDashboard(); Swal.fire({ icon: 'success', title: 'تم التوليد', text: `تم إنشاء ${res.data['عدد الإنذارات']} إنذار/إنذارات مستحقة` }); } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر التوليد', text: e.message }); }
  }

  async function onCompleteAdministrativeWarning(id) {
    const { value } = await Swal.fire({ title: 'إكمال الإنذار', html: `<input id="c1" class="swal2-input" placeholder="الإجراء المنفذ"><textarea id="c2" class="swal2-textarea" placeholder="ملاحظات الإقفال"></textarea>`, showCancelButton: true, preConfirm: () => ({ 'الإجراء المنفذ': byId('c1').value, 'ملاحظات الإقفال': byId('c2').value }) });
    if (!value) return;
    try { await api('completeAdministrativeWarning', { id, ...value }, true); await loadDashboard(); Swal.fire({ icon: 'success', title: 'تم إقفال الإنذار' }); } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر الإقفال', text: e.message }); }
  }

  function findAdminWarningById(id) {
    for (const k of ['التأخر','الغياب','الغياب بعذر']) {
      const found = (state.bundle['الإنذارات الإدارية']?.[k] || []).find(x => x.id === id);
      if (found) return { type: k, item: found };
    }
    return null;
  }

  function onOpenAdministrativeWhatsapp(id) {
    const found = findAdminWarningById(id); if (!found) return;
    const tMap = { 'التأخر': 'إنذار_تأخر', 'الغياب': 'إنذار_غياب', 'الغياب بعذر': 'إنذار_غياب_بعذر' };
    const message = buildWhatsappMessage(tMap[found.type], {
      'اسم الطالب': found.item['اسم الطالب'], 'رقم العتبة': found.item['رقم العتبة'], 'العدد': found.item['العدد الحالي'], 'الإجراء': found.item['الإجراء'], 'الحلقة': found.item['الحلقة']
    });
    window.open(whatsappUrl(found.item['رقم جوال ولي الأمر'], message), '_blank');
  }

  function renderNotes() {
    const notes = state.bundle['ملاحظات المعلمين'] || [];
    byId('notesTab').innerHTML = `<div class="table-card"><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="mb-0">ملاحظات المعلمين</h5></div><div class="table-responsive"><table class="table align-middle"><thead><tr><th>الطالب</th><th>الحلقة</th><th>الملاحظة</th><th>المعلم</th><th>التاريخ</th></tr></thead><tbody>${notes.map(n => `<tr><td>${htmlEscape(n['اسم الطالب'])}</td><td>${htmlEscape(n['الحلقة'])}</td><td>${nl2br(n['الملاحظة'])}</td><td>${htmlEscape(n['اسم المعلم'])}</td><td>${formatDate(n['تاريخ الإنشاء'])}</td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted">لا توجد ملاحظات</td></tr>'}</tbody></table></div></div>`;
  }

  async function onAddTeacherNote(student) {
    const { value } = await Swal.fire({ title: 'إضافة ملاحظة', input: 'textarea', inputLabel: `على الطالب ${student['اسم الطالب ثلاثي']}`, showCancelButton: true });
    if (!value) return;
    try { await api('addTeacherNote', { 'هوية الطالب': student['هوية الطالب'], 'الملاحظة': value }, true); await loadDashboard(); Swal.fire({ icon: 'success', title: 'تم حفظ الملاحظة' }); } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message }); }
  }

  function renderSettings() {
    const s = state.bundle['الإعدادات'] || {};
    byId('settingsTab').innerHTML = `
      <div class="row g-3">
        <div class="col-xl-4"><div class="setting-box"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">الحلق والقوائم</h6>${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" data-settings="lists">تحرير</button>' : ''}</div><div class="small-muted">الحلق، المراحل، الصفوف، الحالات، الصلات، أنواع الإنذارات، الإجراءات</div><div class="mt-3">${renderSettingBadges(s['الحلق'])}</div></div></div>
        <div class="col-xl-4"><div class="setting-box"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">روابط التقويم والدرايف</h6>${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" data-settings="links">تحرير</button>' : ''}</div><div class="small-muted">رابط تقويم النظام ورابط مجلد الدرايف الرسمي.</div><div class="mt-3">${renderLinksPreview(s['روابط'])}</div></div></div>
        <div class="col-xl-4"><div class="setting-box"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">المستخدمون</h6>${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" data-settings="users">تحرير</button>' : ''}</div><div class="small-muted">التحكم الكامل بالمستخدمين والوظائف والحلق ورموز الدخول.</div><div class="mt-3">${renderUsersPreview(s['المستخدمون'])}</div></div></div>
        <div class="col-xl-6"><div class="setting-box"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">قوالب واتساب</h6>${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" data-settings="templates">تحرير</button>' : ''}</div><div class="small-muted">القوالب المستخدمة في الطلبات والإنذارات والتواصل العام.</div><div class="mt-3">${renderTemplatesPreview(s['قوالب واتساب'])}</div></div></div>
        <div class="col-xl-6"><div class="setting-box"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">عتبات الإنذارات الإدارية</h6>${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" data-settings="thresholds">تحرير</button>' : ''}</div><div class="small-muted">كل نوع له عتبات متسلسلة ولا يُنشأ إنذار متقدم قبل إكمال السابق.</div><div class="mt-3">${renderThresholdsPreview(s['عتبات الإنذارات الإدارية'])}</div></div></div>
        <div class="col-12"><div class="setting-box"><div class="d-flex justify-content-between align-items-center mb-2"><h6 class="fw-bold mb-0">شاشة الإنجازات</h6>${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" data-settings="achievements">تحرير</button>' : ''}</div><div class="small-muted">إدارة أرقام الإنجازات وبطاقات الشرف والروابط العامة الظاهرة للزوار.</div><div class="mt-3">${renderAchievementSettingPreview(s['الإنجازات'])}</div></div></div>
      </div>`;
    document.querySelectorAll('[data-settings]').forEach(btn => btn.addEventListener('click', () => onEditSettingCategory(btn.dataset.settings)));
  }

  function renderSettingBadges(items=[]) { return (items || []).map(v => `<span class="badge-soft me-1 mb-1 d-inline-block">${htmlEscape(v)}</span>`).join('') || '<div class="text-muted">لا توجد بيانات</div>'; }
  function renderLinksPreview(obj={}) { return Object.entries(obj || {}).map(([k,v]) => `<div class="mb-2"><strong>${htmlEscape(k)}:</strong> <span class="small-muted">${htmlEscape(v)}</span></div>`).join('') || '<div class="text-muted">لا توجد روابط</div>'; }
  function renderUsersPreview(items=[]) { return (items||[]).slice(0,6).map(u => `<div class="mb-2"><strong>${htmlEscape(u['الاسم'])}</strong> — ${htmlEscape(u['الوظيفة'])}</div>`).join('') || '<div class="text-muted">لا يوجد مستخدمون</div>'; }
  function renderTemplatesPreview(items=[]) { return (items||[]).slice(0,5).map(t => `<div class="mb-3"><div class="fw-bold">${htmlEscape(t['المفتاح'])}</div><div class="wa-preview">${nl2br(String(t['النص']).slice(0,140))}</div></div>`).join('') || '<div class="text-muted">لا توجد قوالب</div>'; }
  function renderThresholdsPreview(items=[]) { return (items||[]).map(t => `<div class="mb-2"><strong>${htmlEscape(t['النوع'])}</strong> — عتبة ${t['رقم العتبة']} عند ${t['العدد']} (${htmlEscape(t['الإجراء'])})</div>`).join('') || '<div class="text-muted">لا توجد عتبات</div>'; }
  function renderAchievementSettingPreview(obj={}) { return `<div class="small-muted">${htmlEscape(obj['عنوان الصفحة'] || '')}</div><div class="mt-2">${(obj['بطاقات الإحصاء']||[]).map(x => `<span class="badge-soft me-1 mb-1 d-inline-block">${htmlEscape(x['العنوان'])}: ${htmlEscape(x['القيمة'])}</span>`).join('')}</div>`; }

  async function onEditSettingCategory(kind) {
    try {
      if (kind === 'lists') return await editListsSettings();
      if (kind === 'links') return await editLinksSettings();
      if (kind === 'users') return await editUsersSettings();
      if (kind === 'templates') return await editTemplatesSettings();
      if (kind === 'thresholds') return await editThresholdsSettings();
      if (kind === 'achievements') return await editAchievementsSettings();
    } catch (e) { Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message }); }
  }

  async function editListsSettings() {
    const s = state.bundle['الإعدادات'];
    const { value } = await Swal.fire({ title:'تحرير القوائم', width: 950, showCancelButton:true, html:`
      <textarea id="sl1" class="swal2-textarea" placeholder="الحلق (كل سطر عنصر)">${(s['الحلق']||[]).join('\n')}</textarea>
      <textarea id="sl2" class="swal2-textarea" placeholder="المراحل الدراسية">${(s['المراحل الدراسية']||[]).join('\n')}</textarea>
      <textarea id="sl3" class="swal2-textarea" placeholder="الصفوف الدراسية">${(s['الصفوف الدراسية']||[]).join('\n')}</textarea>
      <textarea id="sl4" class="swal2-textarea" placeholder="حالات الطلاب">${(s['حالات الطلاب']||[]).join('\n')}</textarea>
      <textarea id="sl5" class="swal2-textarea" placeholder="صلات ولي الأمر">${(s['صلات ولي الأمر']||[]).join('\n')}</textarea>
      <textarea id="sl6" class="swal2-textarea" placeholder="أنواع الإنذارات التعليمية">${(s['أنواع الإنذارات التعليمية']||[]).join('\n')}</textarea>
      <textarea id="sl7" class="swal2-textarea" placeholder="إجراءات الإنذارات التعليمية">${(s['إجراءات الإنذارات التعليمية']||[]).join('\n')}</textarea>`,
      preConfirm:()=>({
        'الحلق': lines(byId('sl1').value), 'المراحل الدراسية': lines(byId('sl2').value), 'الصفوف الدراسية': lines(byId('sl3').value), 'حالات الطلاب': lines(byId('sl4').value), 'صلات ولي الأمر': lines(byId('sl5').value), 'أنواع الإنذارات التعليمية': lines(byId('sl6').value), 'إجراءات الإنذارات التعليمية': lines(byId('sl7').value)
      }) });
    if (!value) return;
    await api('saveSettingCategory', { 'الفئة': 'القوائم', 'البيانات': value }, true); await loadDashboard(); Swal.fire({ icon:'success', title:'تم الحفظ' });
  }

  async function editLinksSettings() {
    const s = state.bundle['الإعدادات']['روابط'] || {};
    const { value } = await Swal.fire({ title:'تحرير الروابط', showCancelButton:true, html:`<input id="ln1" class="swal2-input" placeholder="رابط التقويم" value="${htmlEscape(s['رابط التقويم']||'')}"><input id="ln2" class="swal2-input" placeholder="رابط الدرايف" value="${htmlEscape(s['رابط الدرايف']||'')}"><input id="ln3" class="swal2-input" placeholder="رابط الموقع الرسمي" value="${htmlEscape(s['رابط الموقع الرسمي']||'')}">`, preConfirm:()=>({'رابط التقويم':byId('ln1').value,'رابط الدرايف':byId('ln2').value,'رابط الموقع الرسمي':byId('ln3').value}) });
    if (!value) return;
    await api('saveSettingCategory', { 'الفئة':'روابط', 'البيانات': value }, true); await loadDashboard(); Swal.fire({ icon:'success', title:'تم الحفظ' });
  }

  async function editUsersSettings() {
    const items = state.bundle['الإعدادات']['المستخدمون'] || [];
    const { value } = await Swal.fire({ title:'تحرير المستخدمين', width:1000, showCancelButton:true, html:`<textarea id="us1" class="swal2-textarea" style="min-height:360px">${htmlEscape(JSON.stringify(items, null, 2))}</textarea><div class="small-muted mt-2">حرر JSON للمستخدمين: الاسم، الوظيفة، الحلقة، رمز الدخول، نشط</div>`, preConfirm:()=>JSON.parse(byId('us1').value) });
    if (!value) return;
    await api('saveSettingCategory', { 'الفئة':'المستخدمون', 'البيانات': value }, true); await loadDashboard(); Swal.fire({ icon:'success', title:'تم الحفظ' });
  }

  async function editTemplatesSettings() {
    const items = state.bundle['الإعدادات']['قوالب واتساب'] || [];
    const { value } = await Swal.fire({ title:'تحرير قوالب واتساب', width:1000, showCancelButton:true, html:`<textarea id="tp1" class="swal2-textarea" style="min-height:380px">${htmlEscape(JSON.stringify(items, null, 2))}</textarea><div class="small-muted mt-2">كل قالب: المفتاح، الاسم، النص، المتغيرات</div>`, preConfirm:()=>JSON.parse(byId('tp1').value) });
    if (!value) return;
    await api('saveSettingCategory', { 'الفئة':'قوالب واتساب', 'البيانات': value }, true); await loadDashboard(); Swal.fire({ icon:'success', title:'تم الحفظ' });
  }

  async function editThresholdsSettings() {
    const items = state.bundle['الإعدادات']['عتبات الإنذارات الإدارية'] || [];
    const { value } = await Swal.fire({ title:'تحرير العتبات', width:1000, showCancelButton:true, html:`<textarea id="th1" class="swal2-textarea" style="min-height:380px">${htmlEscape(JSON.stringify(items, null, 2))}</textarea><div class="small-muted mt-2">كل عنصر: النوع، رقم العتبة، العدد، الإجراء، مفتاح القالب</div>`, preConfirm:()=>JSON.parse(byId('th1').value) });
    if (!value) return;
    await api('saveSettingCategory', { 'الفئة':'عتبات الإنذارات الإدارية', 'البيانات': value }, true); await loadDashboard(); Swal.fire({ icon:'success', title:'تم الحفظ' });
  }

  async function editAchievementsSettings() {
    const obj = state.bundle['الإعدادات']['الإنجازات'] || {};
    const { value } = await Swal.fire({ title:'تحرير الإنجازات', width:1000, showCancelButton:true, html:`<textarea id="ac1" class="swal2-textarea" style="min-height:380px">${htmlEscape(JSON.stringify(obj, null, 2))}</textarea><div class="small-muted mt-2">العنوان، الوصف، بطاقات الإحصاء، الإنجازات النصية، روابط عامة</div>`, preConfirm:()=>JSON.parse(byId('ac1').value) });
    if (!value) return;
    await api('saveSettingCategory', { 'الفئة':'الإنجازات', 'البيانات': value }, true); await loadDashboard(); renderAchievements(value); Swal.fire({ icon:'success', title:'تم الحفظ' });
  }

  function renderLogs() {
    const items = state.bundle['سجل العمليات'] || [];
    byId('logsTab').innerHTML = `<div class="table-card"><h5 class="mb-3">سجل العمليات</h5><div class="table-responsive"><table class="table align-middle"><thead><tr><th>العملية</th><th>الوصف</th><th>المستخدم</th><th>الدور</th><th>التاريخ</th></tr></thead><tbody>${items.map(l => `<tr><td>${htmlEscape(l['العملية'])}</td><td>${htmlEscape(l['الوصف'])}</td><td>${htmlEscape(l['اسم المستخدم'])}</td><td>${htmlEscape(l['الدور'])}</td><td>${formatDate(l['التاريخ'])}</td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-muted">لا توجد عمليات</td></tr>'}</tbody></table></div></div>`;
  }

  function renderAchievements(data) {
    const d = data || state.publicSettings?.['الإنجازات'] || {};
    if (!d) return;
    byId('achievementsContent').innerHTML = `
      <div class="panel-card mb-3"><h2 class="section-title mb-2">${htmlEscape(d['عنوان الصفحة'] || 'إنجازات المجمع')}</h2><div class="small-muted">${htmlEscape(d['وصف الصفحة'] || '')}</div></div>
      <div class="row g-3 mb-3">${(d['بطاقات الإحصاء'] || []).map(x => statCard(x['العنوان'], x['القيمة'], x['أيقونة'] || 'fa-star', x['وصف'] || '')).join('')}</div>
      <div class="row g-3">
        <div class="col-lg-8"><div class="panel-card"><h5 class="mb-3">أبرز الإنجازات</h5>${(d['الإنجازات النصية'] || []).map(t => `<div class="mb-3 border rounded-4 p-3"><i class="fa-solid fa-check text-success ms-2"></i>${htmlEscape(t)}</div>`).join('') || '<div class="text-muted">لا توجد بيانات</div>'}</div></div>
        <div class="col-lg-4"><div class="panel-card"><h5 class="mb-3">روابط عامة</h5>${Object.entries(d['روابط عامة'] || {}).map(([k,v]) => `<a class="btn btn-outline-primary w-100 mb-2" target="_blank" href="${htmlEscape(v)}">${htmlEscape(k)}</a>`).join('') || '<div class="text-muted">لا توجد روابط</div>'}</div></div>
      </div>`;
  }
  async function loadAchievements() { if (!state.publicSettings) await loadPublicSettings(); renderAchievements(state.publicSettings['الإنجازات']); }

  function lines(v) { return String(v || '').split('\n').map(x => x.trim()).filter(Boolean); }

  function exportTableData(ext) {
    const data = state.bundle?.['الطلاب'] || [];
    if (!data.length) return Swal.fire({ icon:'info', title:'لا توجد بيانات للتصدير' });
    const exportRows = data.map(s => ({
      'الاسم': s['اسم الطالب ثلاثي'], 'الهوية': s['هوية الطالب'], 'جوال الطالب': s['رقم جوال الطالب'], 'الحلقة': s['الحلقة'], 'المرحلة': s['المرحلة الدراسية'], 'الصف': s['الصف الدراسي'], 'الحفظ': s['مجموع الحفظ'], 'الحالة': s['حالة الطالب'], 'التأخرات': s['عدد التأخرات'], 'الغيابات': s['عدد الغيابات'], 'الغيابات بعذر': s['عدد الغيابات بعذر']
    }));
    if (ext === 'csv') {
      const sheet = XLSX.utils.json_to_sheet(exportRows);
      const csv = XLSX.utils.sheet_to_csv(sheet);
      downloadFile(new Blob([csv], { type:'text/csv;charset=utf-8;' }), `students_${Date.now()}.csv`);
    } else {
      const wb = XLSX.utils.book_new(); const ws = XLSX.utils.json_to_sheet(exportRows); XLSX.utils.book_append_sheet(wb, ws, 'الطلاب'); XLSX.writeFile(wb, `students_${Date.now()}.xlsx`);
    }
  }
  function downloadFile(blob, fileName) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

  function updateTabVisibility() {
    const hidden = {
      requestsTab: !roleCan('مدير','مشرف إداري'),
      settingsTab: !roleCan('مدير','مشرف إداري'),
      logsTab: !roleCan('مدير','مشرف إداري'),
      eduWarningsTab: !roleCan('مدير','مشرف إداري','مشرف تعليمي'),
      adminWarningsTab: !roleCan('مدير','مشرف إداري')
    };
    getTabButtons().forEach(btn => btn.parentElement.classList.toggle('d-none', !!hidden[btn.dataset.tab]));
    const activeBtn = getTabButtons().find(b => !b.parentElement.classList.contains('d-none') && b.classList.contains('active')) || getTabButtons().find(b => !b.parentElement.classList.contains('d-none'));
    if (activeBtn) switchTab(activeBtn.dataset.tab, activeBtn);
  }
  function switchTab(tabId, btn) {
    document.querySelectorAll('.tab-pane-custom').forEach(t => t.classList.add('d-none'));
    getTabButtons().forEach(b => b.classList.remove('active'));
    byId(tabId).classList.remove('d-none');
    btn?.classList.add('active');
  }

  byId('openLoginBtn').addEventListener('click', () => loginModal.show());
  byId('logoutBtn').addEventListener('click', async () => { try { if (state.token) await api('logout', {}, true); } catch(e){} clearSession(); location.hash = '#/home'; });
  byId('staffLoginForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { const res = await api('login', { 'رمز الدخول': byId('staffCode').value.trim() }); saveSession(res.data); loginModal.hide(); await loadDashboard(); location.hash = '#/staff'; }
    catch(err){ Swal.fire({ icon:'error', title:'تعذر الدخول', text: err.message }); }
  });
  byId('registrationForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { const data = Object.fromEntries(new FormData(e.target).entries()); const res = await api('registerStudent', data); e.target.reset(); Swal.fire({ icon:'success', title:'تم إرسال الطلب', text:`رقم الطلب: ${res.data['رقم الطلب']}` }); }
    catch(err){ Swal.fire({ icon:'error', title:'تعذر الإرسال', text: err.message }); }
  });
  byId('studentLookupForm').addEventListener('submit', async e => {
    e.preventDefault();
    try { const res = await api('getStudentData', Object.fromEntries(new FormData(e.target).entries())); const s = res.data; byId('studentResult').innerHTML = `<div class="panel-card"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><div><h5 class="mb-1 fw-bold">${htmlEscape(s['اسم الطالب ثلاثي'])}</h5><div class="small-muted">الحلقة: ${htmlEscape(s['الحلقة'])} — الحالة: ${htmlEscape(s['حالة الطالب'])}</div></div><div class="d-flex gap-2"><button class="btn btn-outline-primary btn-sm" id="requestEditBtn">طلب تعديل بيانات</button><a class="btn btn-outline-success btn-sm" target="_blank" href="${whatsappUrl(s['رقم جوال ولي الأمر'], buildWhatsappMessage('عام', { 'اسم الطالب': s['اسم الطالب ثلاثي'], 'الحلقة': s['الحلقة'] }))}">واتساب</a></div></div><div class="data-grid">${dataItem('هوية الطالب', s['هوية الطالب'])}${dataItem('جوال الطالب', s['رقم جوال الطالب'])}${dataItem('تاريخ الميلاد', s['تاريخ ميلاد الطالب'])}${dataItem('المرحلة', s['المرحلة الدراسية'])}${dataItem('الصف', s['الصف الدراسي'])}${dataItem('جوال ولي الأمر', s['رقم جوال ولي الأمر'])}${dataItem('العنوان', s['العنوان / الحي'])}${dataItem('مجموع الحفظ', s['مجموع الحفظ'])}</div></div>`; byId('requestEditBtn').addEventListener('click', () => requestStudentEdit(s)); }
    catch(err){ byId('studentResult').innerHTML = `<div class="alert alert-danger">${htmlEscape(err.message)}</div>`; }
  });
  async function requestStudentEdit(student) {
    const fields = ['رقم جوال الطالب','العنوان / الحي','رقم جوال ولي الأمر','الحلقة','الصف الدراسي'];
    const { value } = await Swal.fire({ title:'طلب تعديل بيانات', html:`<select id="re1" class="swal2-select">${fields.map(f => `<option>${htmlEscape(f)}</option>`).join('')}</select><input id="re2" class="swal2-input" placeholder="القيمة الجديدة"><textarea id="re3" class="swal2-textarea" placeholder="ملاحظات"></textarea>`, showCancelButton:true, preConfirm:()=>({ 'هوية الطالب': student['هوية الطالب'], 'الحقل المطلوب تعديله': byId('re1').value, 'القيمة الجديدة': byId('re2').value, 'ملاحظات': byId('re3').value }) });
    if (!value) return;
    try { await api('requestStudentUpdate', value); Swal.fire({ icon:'success', title:'تم إرسال الطلب' }); } catch(e){ Swal.fire({ icon:'error', title:'تعذر الإرسال', text:e.message }); }
  }

  getTabButtons().forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn)));
  byId('exportCsvBtn').addEventListener('click', () => exportTableData('csv'));
  byId('exportExcelBtn').addEventListener('click', () => exportTableData('xlsx'));
  window.addEventListener('hashchange', route);
  updateAuthUI();
  loadPublicSettings().then(route).catch(err => Swal.fire({ icon:'error', title:'تعذر التحميل الأولي', text: err.message }));
})();
