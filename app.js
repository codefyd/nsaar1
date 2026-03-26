(() => {
  const API_URL = window.APP_CONFIG?.API_URL || '';

  const STORAGE_KEYS = {
    token: 'nassar_quran_token',
    name: 'nassar_quran_name',
    role: 'nassar_quran_role'
  };

  const state = {
    token: localStorage.getItem(STORAGE_KEYS.token) || '',
    userName: localStorage.getItem(STORAGE_KEYS.name) || '',
    userRole: localStorage.getItem(STORAGE_KEYS.role) || '',
    bundle: null,
    publicSettings: null
  };

  const loginModalEl = document.getElementById('staffLoginModal');
  const loginModal = loginModalEl ? new bootstrap.Modal(loginModalEl) : null;
  const globalLoader = document.getElementById('globalLoader');

  function byId(id) { return document.getElementById(id); }
  function q(selector, root = document) { return root.querySelector(selector); }
  function qa(selector, root = document) { return [...root.querySelectorAll(selector)]; }

  function showLoader(show = true) {
    if (globalLoader) globalLoader.classList.toggle('d-none', !show);
  }

  function ensureConfig() {
    if (!API_URL) {
      Swal.fire({
        icon: 'warning',
        title: 'إعدادات ناقصة',
        text: 'ضع رابط Google Apps Script داخل config.js'
      });
      return false;
    }
    return true;
  }

  async function api(action, data = {}, withToken = false, method = 'POST') {
    if (!ensureConfig()) throw new Error('Missing config');
    showLoader(true);
    try {
      if (method === 'GET') {
        const params = new URLSearchParams({
          action,
          ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')])),
          ...(withToken && state.token ? { token: state.token } : {})
        });

        const res = await fetch(`${API_URL}?${params.toString()}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'حدث خطأ غير متوقع');
        return json;
      }

      const body = new URLSearchParams();
      body.append('action', action);

      Object.entries(data).forEach(([k, v]) => {
        body.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
      });

      if (withToken && state.token) body.append('token', state.token);

      const res = await fetch(API_URL, {
        method: 'POST',
        body
      });

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'حدث خطأ غير متوقع');
      return json;
    } finally {
      showLoader(false);
    }
  }

  function saveSession(data) {
    state.token = data.token || '';
    state.userName = data.name || '';
    state.userRole = data.role || '';

    localStorage.setItem(STORAGE_KEYS.token, state.token);
    localStorage.setItem(STORAGE_KEYS.name, state.userName);
    localStorage.setItem(STORAGE_KEYS.role, state.userRole);

    updateAuthUI();
  }

  function clearSession() {
    state.token = '';
    state.userName = '';
    state.userRole = '';
    state.bundle = null;

    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.name);
    localStorage.removeItem(STORAGE_KEYS.role);

    updateAuthUI();
  }

  function updateAuthUI() {
    const logoutBtn = byId('logoutBtn');
    const staffWelcome = byId('staffWelcome');

    if (logoutBtn) logoutBtn.classList.toggle('d-none', !state.token);

    if (staffWelcome) {
      staffWelcome.textContent = state.token
        ? `مرحبًا، ${state.userName || 'مستخدم النظام'}`
        : 'غير مسجل الدخول';
    }
  }

  function htmlEscape(v) {
    return String(v ?? '').replace(/[&<>"']/g, m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function nl2br(v) {
    return htmlEscape(v).replace(/\n/g, '<br>');
  }

  function formatDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('ar-SA');
  }

  function toNumber(v) {
    return Number(v || 0) || 0;
  }

  function roleCan(...roles) {
    return roles.includes(state.userRole);
  }

  function getTabButtons() {
    return qa('#staffTabs .nav-link');
  }

  function dataItem(label, value) {
    return `
      <div class="data-item">
        <div class="label">${htmlEscape(label)}</div>
        <div class="value">${htmlEscape(value || '-')}</div>
      </div>
    `;
  }

  function statCard(label, value, icon, note = '') {
    return `
      <div class="col-lg-3 col-md-6">
        <div class="kpi-card">
          <div class="bg-icon-float"><i class="fa-solid ${htmlEscape(icon)}"></i></div>
          <div class="kpi-label">${htmlEscape(label)}</div>
          <div class="kpi-value">${htmlEscape(value)}</div>
          <div class="small-muted">${htmlEscape(note)}</div>
        </div>
      </div>
    `;
  }

  function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
  }

  function whatsappUrl(phone, message) {
    const clean = normalizePhone(phone);
    return `https://wa.me/${clean}?text=${encodeURIComponent(message || '')}`;
  }

  function replaceVars(text, vars) {
    let out = String(text || '');
    Object.entries(vars || {}).forEach(([k, v]) => {
      out = out.replaceAll(`{{${k}}}`, String(v ?? ''));
    });
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

  function fillSelect(selectId, items, placeholder) {
    const select = byId(selectId);
    if (!select) return;
    select.innerHTML =
      `<option value="">${htmlEscape(placeholder)}</option>` +
      (items || []).map(v => `<option value="${htmlEscape(v)}">${htmlEscape(v)}</option>`).join('');
  }

  function fillPublicSelects() {
    const p = state.publicSettings || {};
    fillSelect('registerStage', p['المراحل الدراسية'] || [], 'اختر المرحلة');
    fillSelect('registerGrade', p['الصفوف الدراسية'] || [], 'اختر الصف');
    fillSelect('guardianRelation', p['صلات ولي الأمر'] || [], 'اختر الصلة');
  }

  async function loadPublicSettings() {
    const res = await api('getPublicBootstrap', {}, false, 'GET');
    state.publicSettings = res.data || {};
    fillPublicSelects();
    renderAchievements(state.publicSettings['الإنجازات'] || {});
  }

  function renderAchievements(data) {
    const d = data || {};
    const target = byId('achievementsContent');
    if (!target) return;

    const stats = Array.isArray(d['بطاقات الإحصاء']) ? d['بطاقات الإحصاء'] : [];
    const items = Array.isArray(d['الإنجازات النصية']) ? d['الإنجازات النصية'] : [];

    target.innerHTML = `
      <div class="panel-card mb-3">
        <h2 class="section-title mb-2">${htmlEscape(d['عنوان الصفحة'] || 'إنجازات المجمع')}</h2>
        <div class="small-muted">${htmlEscape(d['وصف الصفحة'] || '')}</div>
      </div>

      <div class="row g-3 mb-3">
        ${stats.map(x => statCard(
          x['العنوان'] || '—',
          x['القيمة'] || 0,
          x['أيقونة'] || 'fa-star',
          x['وصف'] || ''
        )).join('')}
      </div>

      <div class="panel-card">
        <h5 class="mb-3">أبرز الإنجازات</h5>
        ${
          items.length
            ? items.map(t => `
              <div class="mb-3 border rounded-4 p-3">
                <i class="fa-solid fa-check text-success ms-2"></i>${htmlEscape(t)}
              </div>
            `).join('')
            : '<div class="text-muted">لا توجد بيانات حالياً</div>'
        }
      </div>
    `;
  }

  function route() {
    const view = (location.hash || '#/home').replace('#/', '');
    const map = {
      home: 'homeView',
      register: 'registerView',
      student: 'studentView',
      achievements: 'achievementsView',
      staff: 'staffView'
    };

    qa('.view-section').forEach(s => s.classList.add('d-none'));

    const targetId = map[view] || 'homeView';
    const target = byId(targetId);
    if (target) target.classList.remove('d-none');

    qa('.navbar .nav-link').forEach(a => {
      const href = a.getAttribute('href') || '';
      a.classList.toggle('active-route', href === `#/${view}`);
    });

    if (view === 'staff') {
      if (!state.token) {
        loginModal?.show();
        location.hash = '#/home';
        return;
      }
      loadDashboard();
    }

    if (view === 'achievements') {
      renderAchievements(state.publicSettings?.['الإنجازات'] || {});
    }
  }

  async function loadDashboard() {
    try {
      const res = await api('getDashboardBundle', {}, true);
      state.bundle = res.data || {};
      const user = state.bundle['المستخدم'] || {};
      byId('staffWelcome').textContent = `${user['الاسم'] || state.userName} — ${user['الدور'] || state.userRole}`;
      renderDashboard();
      updateTabVisibility();
    } catch (e) {
      clearSession();
      Swal.fire({
        icon: 'error',
        title: 'تعذر فتح البوابة',
        text: e.message
      });
      location.hash = '#/home';
    }
  }

  function ensureStatsContainer() {
    const shell = q('#staffView .staff-body');
    if (!shell) return null;

    let stats = byId('dashboardStats');
    if (!stats) {
      stats = document.createElement('div');
      stats.id = 'dashboardStats';
      stats.className = 'row g-3 mb-3';
      shell.insertBefore(stats, byId('staffTabs'));
    }
    return stats;
  }

  function renderDashboard() {
    const s = state.bundle?.['إحصائيات'] || {};
    const statsEl = ensureStatsContainer();

    if (statsEl) {
      statsEl.innerHTML = [
        statCard('إجمالي الطلاب', s['إجمالي الطلاب'] || 0, 'fa-users', 'حسب الصلاحية'),
        statCard('الطلبات الجديدة', s['الطلبات الجديدة'] || 0, 'fa-inbox', 'بانتظار المعالجة'),
        statCard('الإنذارات التعليمية', s['الإنذارات التعليمية'] || 0, 'fa-triangle-exclamation', 'إجمالي الإنذارات'),
        statCard('الإنذارات الإدارية المفتوحة', s['الإنذارات الإدارية المفتوحة'] || 0, 'fa-list-check', 'تأخر / غياب / بعذر')
      ].join('');
    }

    renderStudents();
    renderRequests();
    renderEduWarnings();
    renderAdminWarnings();
    renderNotes();
    renderSettings();
    renderLogs();
  }

  function renderStudents() {
    const target = byId('studentsTab');
    if (!target) return;

    const students = state.bundle?.['الطلاب'] || [];
    const rows = students.map(s => `
      <tr>
        <td>
          <button class="btn btn-link p-0 student-details" type="button" data-id="${htmlEscape(s['هوية الطالب'])}">
            ${htmlEscape(s['اسم الطالب ثلاثي'])}
          </button>
        </td>
        <td>${htmlEscape(s['هوية الطالب'])}</td>
        <td>${htmlEscape(s['الحلقة'])}</td>
        <td>${htmlEscape(s['المرحلة الدراسية'])}</td>
        <td>${htmlEscape(s['الصف الدراسي'])}</td>
        <td>${toNumber(s['مجموع الحفظ'])}</td>
        <td>${htmlEscape(s['حالة الطالب'])}</td>
        <td>${toNumber(s['عدد التأخرات'])}/${toNumber(s['عدد الغيابات'])}/${toNumber(s['عدد الغيابات بعذر'])}</td>
      </tr>
    `).join('');

    target.innerHTML = `
      <div class="table-card">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <h5 class="mb-0">إدارة الطلاب</h5>
          <div class="d-flex gap-2 flex-wrap">
            ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-primary btn-sm" type="button" id="addStudentBtn">إضافة طالب</button>' : ''}
            ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-outline-primary btn-sm" type="button" id="bulkUpdateBtn">تعديل جماعي</button>' : ''}
            <button class="btn btn-outline-primary btn-sm" type="button" id="exportCsvBtn">تصدير CSV</button>
            <button class="btn btn-outline-success btn-sm" type="button" id="exportExcelBtn">تصدير Excel</button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهوية</th>
                <th>الحلقة</th>
                <th>المرحلة</th>
                <th>الصف</th>
                <th>الحفظ</th>
                <th>الحالة</th>
                <th>تأخر/غياب/بعذر</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8" class="text-center text-muted">لا توجد بيانات</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    qa('.student-details', target).forEach(btn => {
      btn.addEventListener('click', () => showStudentDetails(btn.dataset.id));
    });

    byId('addStudentBtn')?.addEventListener('click', onAddStudent);
    byId('bulkUpdateBtn')?.addEventListener('click', onBulkUpdateStudents);
    byId('exportCsvBtn')?.addEventListener('click', () => exportTableData('csv'));
    byId('exportExcelBtn')?.addEventListener('click', () => exportTableData('xlsx'));
  }

  async function showStudentDetails(studentId) {
    const s = (state.bundle?.['الطلاب'] || []).find(x => String(x['هوية الطالب']) === String(studentId));
    if (!s) return;

    const canEdit = roleCan('مدير', 'مشرف إداري');
    const canNote = roleCan('معلم', 'مدير', 'مشرف إداري', 'مشرف تعليمي');
    const canEduWarn = roleCan('مدير', 'مشرف تعليمي', 'مشرف إداري');

    const result = await Swal.fire({
      title: htmlEscape(s['اسم الطالب ثلاثي'] || 'بيانات الطالب'),
      width: 950,
      showCloseButton: true,
      showConfirmButton: false,
      html: `
        <div class="text-end">
          <div class="data-grid mb-3">
            ${dataItem('الاسم', s['اسم الطالب ثلاثي'])}
            ${dataItem('الهوية', s['هوية الطالب'])}
            ${dataItem('رقم جوال الطالب', s['رقم جوال الطالب'])}
            ${dataItem('رقم جوال ولي الأمر', s['رقم جوال ولي الأمر'])}
            ${dataItem('الحلقة', s['الحلقة'])}
            ${dataItem('المرحلة', s['المرحلة الدراسية'])}
            ${dataItem('الصف', s['الصف الدراسي'])}
            ${dataItem('العنوان / الحي', s['العنوان / الحي'])}
            ${dataItem('الحالة', s['حالة الطالب'])}
            ${dataItem('مجموع الحفظ', s['مجموع الحفظ'])}
            ${dataItem('عدد التأخرات', s['عدد التأخرات'])}
            ${dataItem('عدد الغيابات', s['عدد الغيابات'])}
            ${dataItem('عدد الغيابات بعذر', s['عدد الغيابات بعذر'])}
          </div>

          <div class="d-flex gap-2 flex-wrap justify-content-end">
            ${canEdit ? '<button class="btn btn-primary" type="button" id="swalEditStudentBtn">تعديل بيانات الطالب</button>' : ''}
            ${canNote ? '<button class="btn btn-outline-primary" type="button" id="swalAddNoteBtn">إضافة ملاحظة</button>' : ''}
            ${canEduWarn ? '<button class="btn btn-outline-danger" type="button" id="swalEduWarnBtn">إنذار تعليمي</button>' : ''}
            <a class="btn btn-outline-success" target="_blank" href="${whatsappUrl(s['رقم جوال ولي الأمر'], buildWhatsappMessage('عام', {
              'اسم الطالب': s['اسم الطالب ثلاثي'],
              'الحلقة': s['الحلقة'],
              'المرحلة': s['المرحلة الدراسية']
            }))}">واتساب</a>
          </div>
        </div>
      `,
      didOpen: () => {
        byId('swalEditStudentBtn')?.addEventListener('click', () => {
          Swal.close();
          onEditStudent(s);
        });
        byId('swalAddNoteBtn')?.addEventListener('click', () => {
          Swal.close();
          onAddTeacherNote(s);
        });
        byId('swalEduWarnBtn')?.addEventListener('click', () => {
          Swal.close();
          onAddEducationalWarning(s);
        });
      }
    });

    return result;
  }

  async function onAddStudent() {
    const relationOptions = (state.publicSettings?.['صلات ولي الأمر'] || []).map(v => `<option value="${htmlEscape(v)}">${htmlEscape(v)}</option>`).join('');
    const stageOptions = (state.publicSettings?.['المراحل الدراسية'] || []).map(v => `<option value="${htmlEscape(v)}">${htmlEscape(v)}</option>`).join('');
    const gradeOptions = (state.publicSettings?.['الصفوف الدراسية'] || []).map(v => `<option value="${htmlEscape(v)}">${htmlEscape(v)}</option>`).join('');

    const { value } = await Swal.fire({
      title: 'إضافة طالب',
      width: 1000,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="row g-2 text-end">
          <div class="col-md-6"><input id="st1" class="swal2-input" placeholder="اسم الطالب ثلاثي"></div>
          <div class="col-md-6"><input id="st2" class="swal2-input" placeholder="هوية الطالب"></div>
          <div class="col-md-6"><input id="st3" class="swal2-input" placeholder="رقم جوال الطالب"></div>
          <div class="col-md-6"><input id="st4" class="swal2-input" placeholder="تاريخ ميلاد الطالب"></div>
          <div class="col-md-6"><input id="st5" class="swal2-input" placeholder="العنوان / الحي"></div>
          <div class="col-md-3"><select id="st6" class="swal2-select"><option value="">المرحلة الدراسية</option>${stageOptions}</select></div>
          <div class="col-md-3"><select id="st7" class="swal2-select"><option value="">الصف الدراسي</option>${gradeOptions}</select></div>
          <div class="col-md-6"><input id="st8" class="swal2-input" placeholder="اسم ولي الأمر ثلاثي"></div>
          <div class="col-md-6"><input id="st9" class="swal2-input" placeholder="رقم جوال ولي الأمر"></div>
          <div class="col-md-6"><input id="st10" class="swal2-input" placeholder="رقم هوية ولي الأمر"></div>
          <div class="col-md-6"><select id="st11" class="swal2-select"><option value="">صلة ولي الأمر</option>${relationOptions}</select></div>
          <div class="col-md-4"><input id="st12" class="swal2-input" placeholder="الحلقة"></div>
          <div class="col-md-4"><input id="st13" class="swal2-input" placeholder="حالة الطالب"></div>
          <div class="col-md-4"><input id="st14" class="swal2-input" placeholder="مجموع الحفظ" value="0"></div>
        </div>
      `,
      preConfirm: () => ({
        'اسم الطالب ثلاثي': byId('st1').value.trim(),
        'هوية الطالب': byId('st2').value.trim(),
        'رقم جوال الطالب': byId('st3').value.trim(),
        'تاريخ ميلاد الطالب': byId('st4').value.trim(),
        'العنوان / الحي': byId('st5').value.trim(),
        'المرحلة الدراسية': byId('st6').value,
        'الصف الدراسي': byId('st7').value,
        'اسم ولي الأمر ثلاثي': byId('st8').value.trim(),
        'رقم جوال ولي الأمر': byId('st9').value.trim(),
        'رقم هوية ولي الأمر': byId('st10').value.trim(),
        'صلة ولي الأمر': byId('st11').value,
        'الحلقة': byId('st12').value.trim(),
        'حالة الطالب': byId('st13').value.trim(),
        'مجموع الحفظ': byId('st14').value.trim()
      })
    });

    if (!value) return;

    try {
      await api('saveStudent', value, true);
      Swal.fire({ icon: 'success', title: 'تمت الإضافة بنجاح' });
      await loadDashboard();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  async function onEditStudent(student) {
    const { value } = await Swal.fire({
      title: 'تعديل بيانات الطالب',
      width: 1000,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="row g-2 text-end">
          <div class="col-md-6"><input id="ed1" class="swal2-input" placeholder="اسم الطالب ثلاثي" value="${htmlEscape(student['اسم الطالب ثلاثي'] || '')}"></div>
          <div class="col-md-6"><input id="ed2" class="swal2-input" placeholder="هوية الطالب" value="${htmlEscape(student['هوية الطالب'] || '')}"></div>
          <div class="col-md-6"><input id="ed3" class="swal2-input" placeholder="رقم جوال الطالب" value="${htmlEscape(student['رقم جوال الطالب'] || '')}"></div>
          <div class="col-md-6"><input id="ed4" class="swal2-input" placeholder="تاريخ ميلاد الطالب" value="${htmlEscape(student['تاريخ ميلاد الطالب'] || '')}"></div>
          <div class="col-md-6"><input id="ed5" class="swal2-input" placeholder="العنوان / الحي" value="${htmlEscape(student['العنوان / الحي'] || '')}"></div>
          <div class="col-md-6"><input id="ed6" class="swal2-input" placeholder="الحلقة" value="${htmlEscape(student['الحلقة'] || '')}"></div>
          <div class="col-md-4"><input id="ed7" class="swal2-input" placeholder="المرحلة الدراسية" value="${htmlEscape(student['المرحلة الدراسية'] || '')}"></div>
          <div class="col-md-4"><input id="ed8" class="swal2-input" placeholder="الصف الدراسي" value="${htmlEscape(student['الصف الدراسي'] || '')}"></div>
          <div class="col-md-4"><input id="ed9" class="swal2-input" placeholder="حالة الطالب" value="${htmlEscape(student['حالة الطالب'] || '')}"></div>
          <div class="col-md-4"><input id="ed10" class="swal2-input" placeholder="مجموع الحفظ" value="${htmlEscape(student['مجموع الحفظ'] || 0)}"></div>
          <div class="col-md-4"><input id="ed11" class="swal2-input" placeholder="عدد التأخرات" value="${htmlEscape(student['عدد التأخرات'] || 0)}"></div>
          <div class="col-md-4"><input id="ed12" class="swal2-input" placeholder="عدد الغيابات" value="${htmlEscape(student['عدد الغيابات'] || 0)}"></div>
          <div class="col-md-4"><input id="ed13" class="swal2-input" placeholder="عدد الغيابات بعذر" value="${htmlEscape(student['عدد الغيابات بعذر'] || 0)}"></div>
          <div class="col-md-4"><input id="ed14" class="swal2-input" placeholder="اسم ولي الأمر ثلاثي" value="${htmlEscape(student['اسم ولي الأمر ثلاثي'] || '')}"></div>
          <div class="col-md-4"><input id="ed15" class="swal2-input" placeholder="رقم جوال ولي الأمر" value="${htmlEscape(student['رقم جوال ولي الأمر'] || '')}"></div>
          <div class="col-md-4"><input id="ed16" class="swal2-input" placeholder="رقم هوية ولي الأمر" value="${htmlEscape(student['رقم هوية ولي الأمر'] || '')}"></div>
        </div>
      `,
      preConfirm: () => ({
        'اسم الطالب ثلاثي': byId('ed1').value.trim(),
        'هوية الطالب': byId('ed2').value.trim(),
        'رقم جوال الطالب': byId('ed3').value.trim(),
        'تاريخ ميلاد الطالب': byId('ed4').value.trim(),
        'العنوان / الحي': byId('ed5').value.trim(),
        'الحلقة': byId('ed6').value.trim(),
        'المرحلة الدراسية': byId('ed7').value.trim(),
        'الصف الدراسي': byId('ed8').value.trim(),
        'حالة الطالب': byId('ed9').value.trim(),
        'مجموع الحفظ': byId('ed10').value.trim(),
        'عدد التأخرات': byId('ed11').value.trim(),
        'عدد الغيابات': byId('ed12').value.trim(),
        'عدد الغيابات بعذر': byId('ed13').value.trim(),
        'اسم ولي الأمر ثلاثي': byId('ed14').value.trim(),
        'رقم جوال ولي الأمر': byId('ed15').value.trim(),
        'رقم هوية ولي الأمر': byId('ed16').value.trim()
      })
    });

    if (!value) return;

    try {
      await api('saveStudent', value, true);
      Swal.fire({ icon: 'success', title: 'تم حفظ التعديل' });
      await loadDashboard();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر حفظ التعديل', text: e.message });
    }
  }

  async function onBulkUpdateStudents() {
    const students = state.bundle?.['الطلاب'] || [];
    if (!students.length) {
      Swal.fire({ icon: 'info', title: 'لا توجد بيانات' });
      return;
    }

    const { value } = await Swal.fire({
      title: 'تعديل جماعي',
      width: 1000,
      showCancelButton: true,
      confirmButtonText: 'تنفيذ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <div class="small-muted mb-2">أدخل مصفوفة JSON تحتوي على الطلاب بعد التعديل الجماعي.</div>
          <textarea id="bulkJson" class="swal2-textarea" style="min-height:360px">${htmlEscape(JSON.stringify(students, null, 2))}</textarea>
        </div>
      `,
      preConfirm: () => JSON.parse(byId('bulkJson').value)
    });

    if (!value) return;

    try {
      await api('bulkUpdateStudents', { 'البيانات': value }, true);
      Swal.fire({ icon: 'success', title: 'تم التحديث الجماعي' });
      await loadDashboard();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر التنفيذ', text: e.message });
    }
  }

  function renderRequests() {
    const target = byId('requestsTab');
    if (!target) return;

    const items = state.bundle?.['الطلبات الواردة'] || [];
    const rows = items.map(r => `
      <tr>
        <td>${htmlEscape(r['رقم الطلب'] || '')}</td>
        <td>${htmlEscape(r['اسم الطالب ثلاثي'] || '')}</td>
        <td>${htmlEscape(r['نوع الطلب'] || '')}</td>
        <td>${htmlEscape(r['الحالة'] || '')}</td>
        <td>${formatDate(r['تاريخ الطلب'])}</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-outline-primary btn-sm request-view-btn" type="button" data-id="${htmlEscape(r['رقم الطلب'] || '')}">عرض</button>
            ${roleCan('مدير','مشرف إداري') ? `<button class="btn btn-primary btn-sm request-process-btn" type="button" data-id="${htmlEscape(r['رقم الطلب'] || '')}">معالجة</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    target.innerHTML = `
      <div class="table-card">
        <h5 class="mb-3">الطلبات الواردة</h5>
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>اسم الطالب</th>
                <th>نوع الطلب</th>
                <th>الحالة</th>
                <th>التاريخ</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="6" class="text-center text-muted">لا توجد طلبات</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    qa('.request-view-btn', target).forEach(btn => btn.addEventListener('click', () => showRequestDetails(btn.dataset.id)));
    qa('.request-process-btn', target).forEach(btn => btn.addEventListener('click', () => processRequestFlow(btn.dataset.id)));
  }

  async function showRequestDetails(requestId) {
    const item = (state.bundle?.['الطلبات الواردة'] || []).find(x => String(x['رقم الطلب']) === String(requestId));
    if (!item) return;

    await Swal.fire({
      title: `الطلب رقم ${htmlEscape(requestId)}`,
      width: 900,
      showConfirmButton: false,
      showCloseButton: true,
      html: `
        <div class="data-grid text-end">
          ${Object.entries(item).map(([k, v]) => dataItem(k, typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''))).join('')}
        </div>
      `
    });
  }

  async function processRequestFlow(requestId) {
    const item = (state.bundle?.['الطلبات الواردة'] || []).find(x => String(x['رقم الطلب']) === String(requestId));
    if (!item) return;

    const { value } = await Swal.fire({
      title: `معالجة الطلب ${htmlEscape(requestId)}`,
      showCancelButton: true,
      confirmButtonText: 'اعتماد',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <select id="rq1" class="swal2-select">
            <option value="معتمد">معتمد</option>
            <option value="مرفوض">مرفوض</option>
            <option value="قيد المراجعة">قيد المراجعة</option>
          </select>
          <textarea id="rq2" class="swal2-textarea" placeholder="ملاحظات المعالجة"></textarea>
        </div>
      `,
      preConfirm: () => ({
        'رقم الطلب': item['رقم الطلب'],
        'الحالة': byId('rq1').value,
        'ملاحظات المعالجة': byId('rq2').value
      })
    });

    if (!value) return;

    try {
      await api('processRequest', value, true);
      Swal.fire({ icon: 'success', title: 'تمت معالجة الطلب' });
      await loadDashboard();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر المعالجة', text: e.message });
    }
  }

  function renderEduWarnings() {
    const target = byId('eduWarningsTab');
    if (!target) return;

    const items = state.bundle?.['الإنذارات التعليمية'] || [];
    const rows = items.map(r => `
      <tr>
        <td>${htmlEscape(r['اسم الطالب'] || r['اسم الطالب ثلاثي'] || '')}</td>
        <td>${htmlEscape(r['هوية الطالب'] || '')}</td>
        <td>${htmlEscape(r['نوع الإنذار'] || '')}</td>
        <td>${htmlEscape(r['سبب الإنذار'] || '')}</td>
        <td>${htmlEscape(r['الإجراء الحالي'] || '')}</td>
        <td>${formatDate(r['تاريخ الإنذار'])}</td>
        <td>${htmlEscape(r['بواسطة الإنشاء'] || '')}</td>
      </tr>
    `).join('');

    target.innerHTML = `
      <div class="table-card">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <h5 class="mb-0">الإنذارات التعليمية</h5>
          <div class="small-muted">إصدار ومتابعة الإنذارات التعليمية للطلاب.</div>
        </div>
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>اسم الطالب</th>
                <th>الهوية</th>
                <th>نوع الإنذار</th>
                <th>السبب</th>
                <th>الإجراء الحالي</th>
                <th>التاريخ</th>
                <th>بواسطة</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7" class="text-center text-muted">لا توجد إنذارات تعليمية</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function onAddEducationalWarning(student) {
    const actionList = state.bundle?.['الإعدادات']?.['الإجراءات الإدارية والتعليمية']?.['إجراءات تعليمية'] || [];
    const actionOptions = actionList.map(v => `<option value="${htmlEscape(v)}">${htmlEscape(v)}</option>`).join('');

    const { value } = await Swal.fire({
      title: 'إنذار تعليمي',
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <input id="ew1" class="swal2-input" value="${htmlEscape(student['اسم الطالب ثلاثي'] || '')}" disabled>
          <input id="ew2" class="swal2-input" value="${htmlEscape(student['هوية الطالب'] || '')}" disabled>
          <input id="ew3" class="swal2-input" placeholder="نوع الإنذار">
          <textarea id="ew4" class="swal2-textarea" placeholder="سبب الإنذار"></textarea>
          <select id="ew5" class="swal2-select">
            <option value="">الإجراء الحالي</option>
            ${actionOptions}
          </select>
          <textarea id="ew6" class="swal2-textarea" placeholder="ملاحظات"></textarea>
        </div>
      `,
      preConfirm: () => ({
        'هوية الطالب': student['هوية الطالب'],
        'نوع الإنذار': byId('ew3').value.trim(),
        'سبب الإنذار': byId('ew4').value.trim(),
        'الإجراء الحالي': byId('ew5').value.trim(),
        'ملاحظات': byId('ew6').value.trim()
      })
    });

    if (!value) return;

    try {
      await api('addEducationalWarning', value, true);
      Swal.fire({ icon: 'success', title: 'تم إنشاء الإنذار التعليمي' });
      await loadDashboard();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  function renderAdminWarnings() {
    const target = byId('adminWarningsTab');
    if (!target) return;

    const items = state.bundle?.['الإنذارات الإدارية'] || [];
    const rows = items.map(r => `
      <tr>
        <td>${htmlEscape(r['اسم الطالب'] || r['اسم الطالب ثلاثي'] || '')}</td>
        <td>${htmlEscape(r['نوع الإنذار'] || '')}</td>
        <td>${htmlEscape(r['رقم العتبة'] || '')}</td>
        <td>${htmlEscape(r['الإجراء'] || '')}</td>
        <td>${htmlEscape(r['الحالة'] || '')}</td>
        <td>${formatDate(r['تاريخ الإنذار'])}</td>
        <td>
          ${
            r['الحالة'] === 'مفتوح' && roleCan('مدير','مشرف إداري')
              ? `<button class="btn btn-primary btn-sm admin-complete-btn" type="button" data-id="${htmlEscape(r['id'] || r['ID'] || '')}">إقفال</button>`
              : '<span class="text-muted">—</span>'
          }
        </td>
      </tr>
    `).join('');

    target.innerHTML = `
      <div class="table-card">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h5 class="mb-1">الإنذارات الإدارية</h5>
            <div class="small-muted">متابعة التأخر والغياب والغياب بعذر وفق العتبات المتسلسلة.</div>
          </div>
          ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-outline-primary btn-sm" type="button" id="generateAdminWarningsBtn">توليد الإنذارات الإدارية</button>' : ''}
        </div>
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>اسم الطالب</th>
                <th>النوع</th>
                <th>رقم العتبة</th>
                <th>الإجراء</th>
                <th>الحالة</th>
                <th>التاريخ</th>
                <th>الإقفال</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="7" class="text-center text-muted">لا توجد إنذارات إدارية</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;

    byId('generateAdminWarningsBtn')?.addEventListener('click', generateAdministrativeWarnings);
    qa('.admin-complete-btn', target).forEach(btn => btn.addEventListener('click', () => completeAdministrativeWarning(btn.dataset.id)));
  }

  async function generateAdministrativeWarnings() {
    try {
      await api('generateAdministrativeWarnings', {}, true);
      Swal.fire({ icon: 'success', title: 'تم توليد الإنذارات الإدارية' });
      await loadDashboard();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر التنفيذ', text: e.message });
    }
  }

  async function completeAdministrativeWarning(warningId) {
    const { value } = await Swal.fire({
      title: 'إقفال الإنذار الإداري',
      showCancelButton: true,
      confirmButtonText: 'إقفال',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <input id="aw1" class="swal2-input" placeholder="الإجراء المنفذ">
          <textarea id="aw2" class="swal2-textarea" placeholder="ملاحظات"></textarea>
        </div>
      `,
      preConfirm: () => ({
        'id': warningId,
        'الإجراء المنفذ': byId('aw1').value.trim(),
        'ملاحظات': byId('aw2').value.trim()
      })
    });

    if (!value) return;

    try {
      await api('completeAdministrativeWarning', value, true);
      Swal.fire({ icon: 'success', title: 'تم إقفال الإنذار' });
      await loadDashboard();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الإقفال', text: e.message });
    }
  }

  function renderNotes() {
    const target = byId('notesTab');
    if (!target) return;

    const items = state.bundle?.['ملاحظات المعلمين'] || [];
    const rows = items.map(r => `
      <tr>
        <td>${htmlEscape(r['اسم الطالب'] || r['اسم الطالب ثلاثي'] || '')}</td>
        <td>${htmlEscape(r['الحلقة'] || '')}</td>
        <td>${htmlEscape(r['اسم المعلم'] || '')}</td>
        <td>${htmlEscape(r['الملاحظة'] || '')}</td>
        <td>${formatDate(r['تاريخ الإنشاء'])}</td>
      </tr>
    `).join('');

    target.innerHTML = `
      <div class="table-card">
        <h5 class="mb-3">الملاحظات</h5>
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>الطالب</th>
                <th>الحلقة</th>
                <th>المعلم</th>
                <th>الملاحظة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5" class="text-center text-muted">لا توجد ملاحظات</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function onAddTeacherNote(student) {
    const { value } = await Swal.fire({
      title: 'إضافة ملاحظة',
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <input id="nt1" class="swal2-input" value="${htmlEscape(student['اسم الطالب ثلاثي'] || '')}" disabled>
          <textarea id="nt2" class="swal2-textarea" placeholder="اكتب الملاحظة"></textarea>
        </div>
      `,
      preConfirm: () => ({
        'هوية الطالب': student['هوية الطالب'],
        'الملاحظة': byId('nt2').value.trim()
      })
    });

    if (!value) return;

    try {
      await api('addTeacherNote', value, true);
      Swal.fire({ icon: 'success', title: 'تم حفظ الملاحظة' });
      await loadDashboard();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  function renderSettingBadges(items = []) {
    return (items || []).map(v => `<span class="item">${htmlEscape(v)}</span>`).join('') || '<div class="text-muted">لا توجد بيانات</div>';
  }

  function renderUsersPreview(items = []) {
    return (items || []).slice(0, 6).map(u => `
      <div class="official-mini mb-2">
        <div class="text">
          <h6>${htmlEscape(u['الاسم'] || '')}</h6>
          <p>${htmlEscape(u['الوظيفة'] || '')}${u['الحلقة'] ? ` — ${htmlEscape(u['الحلقة'])}` : ''}</p>
        </div>
        <div class="icon"><i class="fa-solid fa-user"></i></div>
      </div>
    `).join('') || '<div class="text-muted">لا يوجد مستخدمون</div>';
  }

  function renderTemplatesPreview(items = []) {
    return (items || []).slice(0, 5).map(t => `
      <div class="mb-2">
        <strong>${htmlEscape(t['الاسم'] || '')}</strong>
        <div class="small-muted">${htmlEscape(t['المفتاح'] || '')}</div>
      </div>
    `).join('') || '<div class="text-muted">لا توجد قوالب</div>';
  }

  function renderThresholdsPreview(items = []) {
    return (items || []).slice(0, 6).map(t => `
      <div class="mb-2">
        <strong>${htmlEscape(t['النوع'] || '')}</strong>
        — العتبة ${htmlEscape(t['رقم العتبة'] || '')}
        — العدد ${htmlEscape(t['العدد'] || '')}
      </div>
    `).join('') || '<div class="text-muted">لا توجد عتبات</div>';
  }

  function renderAchievementSettingPreview(obj = {}) {
    const stats = Array.isArray(obj['بطاقات الإحصاء']) ? obj['بطاقات الإحصاء'].length : 0;
    const items = Array.isArray(obj['الإنجازات النصية']) ? obj['الإنجازات النصية'].length : 0;
    return `
      <div class="small-muted mb-2">العنوان: ${htmlEscape(obj['عنوان الصفحة'] || '—')}</div>
      <div class="small-muted mb-2">بطاقات الإحصاء: ${stats}</div>
      <div class="small-muted">الإنجازات النصية: ${items}</div>
    `;
  }

  function renderSettings() {
    const target = byId('settingsTab');
    if (!target) return;

    const s = state.bundle?.['الإعدادات'] || {};

    target.innerHTML = `
      <div class="row g-3">
        <div class="col-xl-6">
          <div class="settings-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="title">القوائم الأساسية</div>
              ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" type="button" data-settings="lists">تحرير</button>' : ''}
            </div>
            <div class="desc">المراحل الدراسية، الصفوف، صلات ولي الأمر، حالات الطلاب، وأنواع القوائم المساعدة.</div>
            <div class="list-soft">${renderSettingBadges([...(s['المراحل الدراسية'] || []), ...(s['الصفوف الدراسية'] || [])].slice(0, 10))}</div>
          </div>
        </div>

        <div class="col-xl-6">
          <div class="settings-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="title">المستخدمون</div>
              ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" type="button" data-settings="users">تحرير</button>' : ''}
            </div>
            <div class="desc">إدارة المستخدمين والوظائف والحلق ورموز الدخول.</div>
            <div class="mt-3">${renderUsersPreview(s['المستخدمون'] || [])}</div>
          </div>
        </div>

        <div class="col-xl-6">
          <div class="settings-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="title">قوالب واتساب</div>
              ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" type="button" data-settings="templates">تحرير</button>' : ''}
            </div>
            <div class="desc">القوالب المستخدمة للإنذارات والرسائل العامة.</div>
            <div class="mt-3">${renderTemplatesPreview(s['قوالب واتساب'] || [])}</div>
          </div>
        </div>

        <div class="col-xl-6">
          <div class="settings-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="title">عتبات الإنذارات الإدارية</div>
              ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" type="button" data-settings="thresholds">تحرير</button>' : ''}
            </div>
            <div class="desc">كل نوع له عتبات متسلسلة، ولا ينتقل للعتبة التالية قبل إغلاق السابقة.</div>
            <div class="mt-3">${renderThresholdsPreview(s['عتبات الإنذارات الإدارية'] || [])}</div>
          </div>
        </div>

        <div class="col-xl-6">
          <div class="settings-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="title">الإجراءات الإدارية والتعليمية</div>
              ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" type="button" data-settings="actions">تحرير</button>' : ''}
            </div>
            <div class="desc">الإجراءات المعتمدة التي تُستخدم أثناء المعالجة والإنذارات.</div>
            <div class="list-soft">
              ${renderSettingBadges([
                ...((s['الإجراءات الإدارية والتعليمية']?.['إجراءات إدارية']) || []),
                ...((s['الإجراءات الإدارية والتعليمية']?.['إجراءات تعليمية']) || [])
              ].slice(0, 12))}
            </div>
          </div>
        </div>

        <div class="col-xl-6">
          <div class="settings-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <div class="title">إنجازات المجمع</div>
              ${roleCan('مدير','مشرف إداري') ? '<button class="btn btn-sm btn-primary" type="button" data-settings="achievements">تحرير</button>' : ''}
            </div>
            <div class="desc">العنوان والوصف وبطاقات الإحصاء والإنجازات النصية الظاهرة في الصفحة العامة.</div>
            <div class="mt-3">${renderAchievementSettingPreview(s['الإنجازات'] || {})}</div>
          </div>
        </div>
      </div>
    `;

    qa('[data-settings]', target).forEach(btn => {
      btn.addEventListener('click', () => onEditSettingCategory(btn.dataset.settings));
    });
  }

  function renderLogs() {
    const target = byId('logsTab');
    if (!target) return;

    const items = state.bundle?.['سجل العمليات'] || [];
    const rows = items.map(r => `
      <tr>
        <td>${htmlEscape(r['العملية'] || '')}</td>
        <td>${htmlEscape(r['الوصف'] || '')}</td>
        <td>${htmlEscape(r['اسم المستخدم'] || '')}</td>
        <td>${htmlEscape(r['الدور'] || '')}</td>
        <td>${formatDate(r['التاريخ'])}</td>
      </tr>
    `).join('');

    target.innerHTML = `
      <div class="table-card">
        <h5 class="mb-3">سجل العمليات</h5>
        <div class="table-responsive">
          <table class="table align-middle">
            <thead>
              <tr>
                <th>العملية</th>
                <th>الوصف</th>
                <th>المستخدم</th>
                <th>الدور</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5" class="text-center text-muted">لا توجد عمليات</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  async function onEditSettingCategory(key) {
    switch (key) {
      case 'lists':
        return editListsSettings();
      case 'users':
        return editUsersSettings();
      case 'templates':
        return editTemplatesSettings();
      case 'thresholds':
        return editThresholdsSettings();
      case 'actions':
        return editActionsSettings();
      case 'achievements':
        return editAchievementsSettings();
      default:
        return;
    }
  }

  async function editListsSettings() {
    const s = state.bundle?.['الإعدادات'] || {};
    const { value } = await Swal.fire({
      title: 'تحرير القوائم الأساسية',
      width: 1100,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <label class="form-label">المراحل الدراسية</label>
          <textarea id="ls1" class="swal2-textarea" style="min-height:110px">${htmlEscape((s['المراحل الدراسية'] || []).join('\n'))}</textarea>

          <label class="form-label">الصفوف الدراسية</label>
          <textarea id="ls2" class="swal2-textarea" style="min-height:110px">${htmlEscape((s['الصفوف الدراسية'] || []).join('\n'))}</textarea>

          <label class="form-label">صلات ولي الأمر</label>
          <textarea id="ls3" class="swal2-textarea" style="min-height:110px">${htmlEscape((s['صلات ولي الأمر'] || []).join('\n'))}</textarea>
        </div>
      `,
      preConfirm: () => ({
        'المراحل الدراسية': lines(byId('ls1').value),
        'الصفوف الدراسية': lines(byId('ls2').value),
        'صلات ولي الأمر': lines(byId('ls3').value)
      })
    });

    if (!value) return;

    try {
      await Promise.all(
        Object.entries(value).map(([category, data]) =>
          api('saveSettingCategory', { 'الفئة': category, 'البيانات': data }, true)
        )
      );
      Swal.fire({ icon: 'success', title: 'تم حفظ القوائم' });
      await refreshAfterSettingsSave();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  async function editUsersSettings() {
    const items = state.bundle?.['الإعدادات']?.['المستخدمون'] || [];

    const rowsHtml = items.map((u, i) => `
      <div class="border rounded-4 p-3 mb-3 text-start">
        <div class="row g-2">
          <div class="col-md-6">
            <label class="form-label">الاسم</label>
            <input class="swal2-input user-name" data-i="${i}" value="${htmlEscape(u['الاسم'] || '')}" placeholder="الاسم">
          </div>
          <div class="col-md-6">
            <label class="form-label">الوظيفة</label>
            <select class="swal2-select user-role" data-i="${i}">
              <option value="معلم" ${u['الوظيفة'] === 'معلم' ? 'selected' : ''}>معلم</option>
              <option value="مشرف إداري" ${u['الوظيفة'] === 'مشرف إداري' ? 'selected' : ''}>مشرف إداري</option>
              <option value="مشرف تعليمي" ${u['الوظيفة'] === 'مشرف تعليمي' ? 'selected' : ''}>مشرف تعليمي</option>
              <option value="مدير" ${u['الوظيفة'] === 'مدير' ? 'selected' : ''}>مدير</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">الحلقة</label>
            <input class="swal2-input user-halaqah" data-i="${i}" value="${htmlEscape(u['الحلقة'] || '')}" placeholder="الحلقة">
          </div>
          <div class="col-md-6">
            <label class="form-label">رمز الدخول</label>
            <input class="swal2-input user-code" data-i="${i}" value="${htmlEscape(u['رمز الدخول'] || '')}" placeholder="رمز الدخول">
          </div>
          <div class="col-md-12">
            <label class="form-label">نشط</label>
            <select class="swal2-select user-active" data-i="${i}">
              <option value="true" ${u['نشط'] !== false ? 'selected' : ''}>نعم</option>
              <option value="false" ${u['نشط'] === false ? 'selected' : ''}>لا</option>
            </select>
          </div>
        </div>
      </div>
    `).join('');

    const { value } = await Swal.fire({
      title: 'إدارة المستخدمين',
      width: 1100,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div style="text-align:right">
          ${rowsHtml || '<div class="empty-state">لا يوجد مستخدمون حاليًا</div>'}
          <div class="small-muted mt-2">في حال رغبت بإضافة مستخدم جديد، أضفه يدويًا مؤقتًا من خلال JSON في الباك إند أو أخبرني لأجهز لك واجهة إضافة مستقلة.</div>
        </div>
      `,
      preConfirm: () => {
        const names = qa('.user-name');
        return names.map((el, i) => ({
          'الاسم': el.value.trim(),
          'الوظيفة': q(`.user-role[data-i="${i}"]`)?.value || '',
          'الحلقة': q(`.user-halaqah[data-i="${i}"]`)?.value.trim() || '',
          'رمز الدخول': q(`.user-code[data-i="${i}"]`)?.value.trim() || '',
          'نشط': (q(`.user-active[data-i="${i}"]`)?.value || 'true') === 'true'
        })).filter(x => x['الاسم'] && x['رمز الدخول']);
      }
    });

    if (!value) return;

    try {
      await api('saveSettingCategory', { 'الفئة': 'المستخدمون', 'البيانات': value }, true);
      Swal.fire({ icon: 'success', title: 'تم حفظ المستخدمين' });
      await refreshAfterSettingsSave();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  async function editTemplatesSettings() {
    const items = state.bundle?.['الإعدادات']?.['قوالب واتساب'] || [];

    const rowsHtml = items.map((t, i) => `
      <div class="border rounded-4 p-3 mb-3 text-start">
        <div class="row g-2">
          <div class="col-md-4">
            <label class="form-label">مفتاح القالب</label>
            <input class="swal2-input tpl-key" data-i="${i}" value="${htmlEscape(t['المفتاح'] || '')}">
          </div>
          <div class="col-md-4">
            <label class="form-label">اسم القالب</label>
            <input class="swal2-input tpl-name" data-i="${i}" value="${htmlEscape(t['الاسم'] || '')}">
          </div>
          <div class="col-md-4">
            <label class="form-label">المتغيرات</label>
            <input class="swal2-input tpl-vars" data-i="${i}" value="${htmlEscape((t['المتغيرات'] || []).join(', '))}">
          </div>
          <div class="col-md-12">
            <label class="form-label">نص القالب</label>
            <textarea class="swal2-textarea tpl-text" data-i="${i}" style="min-height:140px">${htmlEscape(t['النص'] || '')}</textarea>
          </div>
        </div>
      </div>
    `).join('');

    const { value } = await Swal.fire({
      title: 'إدارة قوالب واتساب',
      width: 1100,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: rowsHtml || '<div class="empty-state">لا توجد قوالب حالية</div>',
      preConfirm: () => {
        const keys = qa('.tpl-key');
        return keys.map((el, i) => ({
          'المفتاح': el.value.trim(),
          'الاسم': q(`.tpl-name[data-i="${i}"]`)?.value.trim() || '',
          'النص': q(`.tpl-text[data-i="${i}"]`)?.value || '',
          'المتغيرات': (q(`.tpl-vars[data-i="${i}"]`)?.value || '')
            .split(',')
            .map(x => x.trim())
            .filter(Boolean)
        })).filter(x => x['المفتاح'] && x['الاسم']);
      }
    });

    if (!value) return;

    try {
      await api('saveSettingCategory', { 'الفئة': 'قوالب واتساب', 'البيانات': value }, true);
      Swal.fire({ icon: 'success', title: 'تم حفظ القوالب' });
      await refreshAfterSettingsSave();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  async function editThresholdsSettings() {
    const items = state.bundle?.['الإعدادات']?.['عتبات الإنذارات الإدارية'] || [];

    const { value } = await Swal.fire({
      title: 'تحرير العتبات',
      width: 1000,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <textarea id="th1" class="swal2-textarea" style="min-height:380px">${htmlEscape(JSON.stringify(items, null, 2))}</textarea>
          <div class="small-muted mt-2">كل عنصر: النوع، رقم العتبة، العدد، الإجراء، مفتاح القالب</div>
        </div>
      `,
      preConfirm: () => JSON.parse(byId('th1').value)
    });

    if (!value) return;

    try {
      await api('saveSettingCategory', { 'الفئة': 'عتبات الإنذارات الإدارية', 'البيانات': value }, true);
      Swal.fire({ icon: 'success', title: 'تم حفظ العتبات' });
      await refreshAfterSettingsSave();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  async function editActionsSettings() {
    const obj = state.bundle?.['الإعدادات']?.['الإجراءات الإدارية والتعليمية'] || {};

    const { value } = await Swal.fire({
      title: 'تحرير الإجراءات',
      width: 1000,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <label class="form-label">إجراءات إدارية</label>
          <textarea id="ac11" class="swal2-textarea" style="min-height:140px">${htmlEscape(((obj['إجراءات إدارية'] || []).join('\n')))}</textarea>
          <label class="form-label">إجراءات تعليمية</label>
          <textarea id="ac12" class="swal2-textarea" style="min-height:140px">${htmlEscape(((obj['إجراءات تعليمية'] || []).join('\n')))}</textarea>
        </div>
      `,
      preConfirm: () => ({
        'إجراءات إدارية': lines(byId('ac11').value),
        'إجراءات تعليمية': lines(byId('ac12').value)
      })
    });

    if (!value) return;

    try {
      await api('saveSettingCategory', { 'الفئة': 'الإجراءات الإدارية والتعليمية', 'البيانات': value }, true);
      Swal.fire({ icon: 'success', title: 'تم حفظ الإجراءات' });
      await refreshAfterSettingsSave();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  async function editAchievementsSettings() {
    const obj = state.bundle?.['الإعدادات']?.['الإنجازات'] || {};
    const stats = Array.isArray(obj['بطاقات الإحصاء']) ? obj['بطاقات الإحصاء'] : [];
    const items = Array.isArray(obj['الإنجازات النصية']) ? obj['الإنجازات النصية'] : [];

    const { value } = await Swal.fire({
      title: 'تحرير الإنجازات',
      width: 1100,
      showCancelButton: true,
      confirmButtonText: 'حفظ',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <label class="form-label">عنوان الصفحة</label>
          <input id="ach1" class="swal2-input" value="${htmlEscape(obj['عنوان الصفحة'] || '')}">

          <label class="form-label">وصف الصفحة</label>
          <textarea id="ach2" class="swal2-textarea" style="min-height:120px">${htmlEscape(obj['وصف الصفحة'] || '')}</textarea>

          <label class="form-label">بطاقات الإحصاء (JSON)</label>
          <textarea id="ach3" class="swal2-textarea" style="min-height:180px">${htmlEscape(JSON.stringify(stats, null, 2))}</textarea>

          <label class="form-label">الإنجازات النصية (كل سطر إنجاز)</label>
          <textarea id="ach4" class="swal2-textarea" style="min-height:160px">${htmlEscape(items.join('\n'))}</textarea>
        </div>
      `,
      preConfirm: () => ({
        'عنوان الصفحة': byId('ach1').value.trim(),
        'وصف الصفحة': byId('ach2').value.trim(),
        'بطاقات الإحصاء': JSON.parse(byId('ach3').value || '[]'),
        'الإنجازات النصية': lines(byId('ach4').value)
      })
    });

    if (!value) return;

    try {
      await api('saveSettingCategory', { 'الفئة': 'الإنجازات', 'البيانات': value }, true);
      Swal.fire({ icon: 'success', title: 'تم حفظ الإنجازات' });
      await refreshAfterSettingsSave();
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الحفظ', text: e.message });
    }
  }

  async function refreshAfterSettingsSave() {
    await loadDashboard();
    await loadPublicSettings();
  }

  function lines(v) {
    return String(v || '')
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);
  }

  function exportTableData(ext) {
    const data = state.bundle?.['الطلاب'] || [];
    if (!data.length) {
      Swal.fire({ icon: 'info', title: 'لا توجد بيانات للتصدير' });
      return;
    }

    const exportRows = data.map(s => ({
      'الاسم': s['اسم الطالب ثلاثي'],
      'الهوية': s['هوية الطالب'],
      'جوال الطالب': s['رقم جوال الطالب'],
      'الحلقة': s['الحلقة'],
      'المرحلة': s['المرحلة الدراسية'],
      'الصف': s['الصف الدراسي'],
      'الحفظ': s['مجموع الحفظ'],
      'الحالة': s['حالة الطالب'],
      'التأخرات': s['عدد التأخرات'],
      'الغيابات': s['عدد الغيابات'],
      'الغيابات بعذر': s['عدد الغيابات بعذر']
    }));

    if (ext === 'csv') {
      const sheet = XLSX.utils.json_to_sheet(exportRows);
      const csv = XLSX.utils.sheet_to_csv(sheet);
      downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `students_${Date.now()}.csv`);
      return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'الطلاب');
    XLSX.writeFile(wb, `students_${Date.now()}.xlsx`);
  }

  function downloadFile(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function updateTabVisibility() {
    const hidden = {
      requestsTab: !roleCan('مدير', 'مشرف إداري'),
      settingsTab: !roleCan('مدير', 'مشرف إداري'),
      logsTab: !roleCan('مدير', 'مشرف إداري'),
      eduWarningsTab: !roleCan('مدير', 'مشرف إداري', 'مشرف تعليمي'),
      adminWarningsTab: !roleCan('مدير', 'مشرف إداري')
    };

    getTabButtons().forEach(btn => {
      btn.parentElement.classList.toggle('d-none', !!hidden[btn.dataset.tab]);
    });

    const activeBtn =
      getTabButtons().find(b => !b.parentElement.classList.contains('d-none') && b.classList.contains('active')) ||
      getTabButtons().find(b => !b.parentElement.classList.contains('d-none'));

    if (activeBtn) switchTab(activeBtn.dataset.tab, activeBtn);
  }

  function switchTab(tabId, btn) {
    qa('.tab-pane-custom').forEach(t => t.classList.add('d-none'));
    getTabButtons().forEach(b => b.classList.remove('active'));
    byId(tabId)?.classList.remove('d-none');
    btn?.classList.add('active');
  }

  async function submitRegisterForm(e) {
    e.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(e.target).entries());
      const res = await api('registerStudent', data);
      e.target.reset();
      Swal.fire({
        icon: 'success',
        title: 'تم إرسال الطلب',
        text: res.data?.message || `تم إرسال طلب التسجيل بنجاح${res.data?.['رقم الطلب'] ? ` — رقم الطلب: ${res.data['رقم الطلب']}` : ''}`
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'تعذر إرسال الطلب',
        text: err.message
      });
    }
  }

  async function submitStudentLookup(e) {
    e.preventDefault();
    const resultBox = byId('studentResult');
    try {
      const formData = Object.fromEntries(new FormData(e.target).entries());
      const data = {
        'هوية الطالب': formData['هوية الطالب'] || byId('studentIdentityInput')?.value || '',
        'رقم جوال ولي الأمر': formData['رقم جوال ولي الأمر'] || byId('guardianPhoneInput')?.value || ''
      };

      const res = await api('getStudentData', data);
      const s = res.data;

      resultBox.innerHTML = `
        <div class="panel-card">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
            <div>
              <h5 class="mb-1 fw-bold">${htmlEscape(s['اسم الطالب ثلاثي'])}</h5>
              <div class="small-muted">الحلقة: ${htmlEscape(s['الحلقة'])} — الحالة: ${htmlEscape(s['حالة الطالب'])}</div>
            </div>
            <div class="d-flex gap-2 flex-wrap">
              <button class="btn btn-outline-primary btn-sm" type="button" id="requestEditBtn">طلب تعديل بيانات</button>
              <a class="btn btn-outline-success btn-sm" target="_blank"
                href="${whatsappUrl(s['رقم جوال ولي الأمر'], buildWhatsappMessage('عام', {
                  'اسم الطالب': s['اسم الطالب ثلاثي'],
                  'الحلقة': s['الحلقة']
                }))}">
                واتساب
              </a>
            </div>
          </div>

          <div class="data-grid">
            ${dataItem('هوية الطالب', s['هوية الطالب'])}
            ${dataItem('جوال الطالب', s['رقم جوال الطالب'])}
            ${dataItem('تاريخ الميلاد', s['تاريخ ميلاد الطالب'])}
            ${dataItem('المرحلة', s['المرحلة الدراسية'])}
            ${dataItem('الصف', s['الصف الدراسي'])}
            ${dataItem('جوال ولي الأمر', s['رقم جوال ولي الأمر'])}
            ${dataItem('العنوان', s['العنوان / الحي'])}
            ${dataItem('مجموع الحفظ', s['مجموع الحفظ'])}
          </div>
        </div>
      `;

      byId('requestEditBtn')?.addEventListener('click', () => requestStudentEdit(s));
    } catch (err) {
      resultBox.innerHTML = `<div class="alert alert-danger">${htmlEscape(err.message)}</div>`;
    }
  }

  async function requestStudentEdit(student) {
    const fields = ['رقم جوال الطالب', 'العنوان / الحي', 'رقم جوال ولي الأمر', 'الحلقة', 'الصف الدراسي'];

    const { value } = await Swal.fire({
      title: 'طلب تعديل بيانات',
      showCancelButton: true,
      confirmButtonText: 'إرسال',
      cancelButtonText: 'إلغاء',
      html: `
        <div class="text-end">
          <select id="re1" class="swal2-select">
            ${fields.map(f => `<option value="${htmlEscape(f)}">${htmlEscape(f)}</option>`).join('')}
          </select>
          <input id="re2" class="swal2-input" placeholder="القيمة الجديدة">
          <textarea id="re3" class="swal2-textarea" placeholder="ملاحظات"></textarea>
        </div>
      `,
      preConfirm: () => ({
        'هوية الطالب': student['هوية الطالب'],
        'الحقل المطلوب تعديله': byId('re1').value,
        'القيمة الجديدة': byId('re2').value,
        'ملاحظات': byId('re3').value
      })
    });

    if (!value) return;

    try {
      await api('requestStudentUpdate', value);
      Swal.fire({ icon: 'success', title: 'تم إرسال الطلب' });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'تعذر الإرسال', text: e.message });
    }
  }

  function bindStaticEvents() {
    byId('openLoginBtn')?.addEventListener('click', () => loginModal?.show());
    byId('openLoginBtn2')?.addEventListener('click', () => loginModal?.show());
    byId('openLoginBtn3')?.addEventListener('click', () => loginModal?.show());

    byId('logoutBtn')?.addEventListener('click', async () => {
      try {
        if (state.token) await api('logout', {}, true);
      } catch (_) {}
      clearSession();
      location.hash = '#/home';
    });

    byId('staffLoginForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const res = await api('login', { 'رمز الدخول': byId('staffCode').value.trim() });
        saveSession(res.data || {});
        loginModal?.hide();
        await loadDashboard();
        location.hash = '#/staff';
      } catch (err) {
        Swal.fire({ icon: 'error', title: 'تعذر الدخول', text: err.message });
      }
    });

    byId('registerForm')?.addEventListener('submit', submitRegisterForm);
    byId('studentLookupForm')?.addEventListener('submit', submitStudentLookup);

    getTabButtons().forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
    });

    window.addEventListener('hashchange', route);
  }

  async function boot() {
    updateAuthUI();
    bindStaticEvents();
    try {
      await loadPublicSettings();
      route();
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: 'تعذر التحميل الأولي',
        text: err.message
      });
    }
  }

  boot();
})();
