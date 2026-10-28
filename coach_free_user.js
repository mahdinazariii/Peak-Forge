/**
 * coach_free_user.js — Coach profile page (free tier)
 * Loads real profile data from /api/profile and supports live updates.
 */

// ── State ────────────────────────────────────────────────────────────────────
let profile      = {};
let coachProfile = {};
let athleteCount = 0;

const store = {
  name: '',
  products: [],
};

// ── Render ───────────────────────────────────────────────────────────────────
function renderProfile() {
  const first = profile.first_name || '';
  const last  = profile.last_name  || '';
  $('fullName').textContent = `${first} ${last}`.trim() || '—';
  $('avatar').textContent   = first[0] || '?';
  $('place').textContent    = [profile.city, profile.country].filter(Boolean).join('، ') || '—';
  $('history').textContent  = coachProfile.certifications || '—';

  $('sAth').textContent   = fa(athleteCount);
  $('sYears').textContent = fa(coachProfile.experience_years || 0);
  $('sProd').textContent  = fa(store.products.length);
}

function renderMedals() {
  const list = $('medals');
  if (!list) return;
  list.innerHTML = '<li class="empty-note">مدرک و افتخاری ثبت نشده.</li>';
}

function fillForm() {
  const form = $('profileForm');
  if (!form) return;
  const map = {
    first:   profile.first_name,
    last:    profile.last_name,
    city:    profile.city,
    country: profile.country,
    height:  null,
    weight:  null,
    history: coachProfile.certifications,
  };
  Object.entries(map).forEach(([k, v]) => {
    if (form.elements[k]) form.elements[k].value = v ?? '';
  });
}

// ── Store ─────────────────────────────────────────────────────────────────────
function renderStore() {
  $('storeName').textContent = store.name || `فروشگاه مربی ${profile.first_name || ''}`;
  const box = $('products');
  box.innerHTML = '';
  if (!store.products.length) {
    box.appendChild(el('p', 'empty', 'هنوز محصولی ثبت نشده.'));
    return;
  }
  store.products.forEach((p) => {
    const row = el('div', 'product');
    row.append(
      el('strong', null, p.name),
      el('span', 'price', fa(p.price) + ' تومان'),
    );
    const x = el('button', 'icon-btn', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', 'حذف محصول');
    x.addEventListener('click', () => {
      store.products.splice(store.products.indexOf(p), 1);
      renderStore();
      renderProfile();
    });
    row.appendChild(x);
    box.appendChild(row);
  });
}

$('prodForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name  = $('pName').value.trim();
  const price = +$('pPrice').value;
  if (!name || price < 0) return;
  store.products.push({ name, price });
  $('pName').value  = '';
  $('pPrice').value = '';
  renderStore();
  renderProfile();
  toast('محصول ثبت شد');
});

// ── Edit / Save form ──────────────────────────────────────────────────────────
const form    = $('profileForm');
const editBtn = $('editBtn');
let editing   = false;

editBtn && editBtn.addEventListener('click', async () => {
  if (editing) {
    const payload = {
      first_name:        form.elements.first.value.trim()   || undefined,
      last_name:         form.elements.last.value.trim()    || undefined,
      city:              form.elements.city.value.trim()    || undefined,
      country:           form.elements.country.value.trim() || undefined,
      experience_years:  parseFloat(form.elements.height?.value) || undefined,  // reuse field
      certifications:    form.elements.history?.value.trim() || undefined,
    };

    editBtn.disabled = true;
    const result = await apiFetch('/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    editBtn.disabled = false;

    if (!result || !result.ok) {
      toast((result?.data?.error) || 'خطا در ذخیره‌سازی.');
      return;
    }

    if (payload.first_name)       profile.first_name              = payload.first_name;
    if (payload.last_name)        profile.last_name               = payload.last_name;
    if (payload.city)             profile.city                    = payload.city;
    if (payload.country)          profile.country                 = payload.country;
    if (payload.certifications)   coachProfile.certifications     = payload.certifications;
    if (payload.experience_years) coachProfile.experience_years   = payload.experience_years;

    localStorage.setItem('user', JSON.stringify(profile));
    renderProfile();
    toast('پروفایل با موفقیت ذخیره شد.');
  }

  editing = !editing;
  form.querySelectorAll('input').forEach((i) => (i.disabled = !editing));
  form.classList.toggle('editing', editing);
  editBtn.textContent = editing ? 'ذخیره' : 'ویرایش';
  if (!editing) fillForm();
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  if (!requireAuth()) return;

  const cached = getLocalUser();
  if (cached) {
    profile = cached;
    renderProfile();
  }

  const result = await apiFetch('/profile');
  if (!result || !result.ok) {
    toast('خطا در بارگذاری پروفایل.');
    return;
  }

  profile      = result.data.user    || {};
  coachProfile = result.data.profile || {};

  // Fetch athlete count
  const statsResult = await apiFetch('/profile/stats/coach');
  if (statsResult && statsResult.ok) {
    athleteCount = statsResult.data.athlete_count || 0;
  }

  renderProfile();
  renderMedals();
  fillForm();
  renderStore();
}

init();
