/**
 * ath_free_user.js — Athlete profile page (free tier)
 * Loads real profile data from /api/profile and supports live updates.
 */

const fa = (n, d = 0) =>
  Number(n).toLocaleString('fa-IR', {
    maximumFractionDigits: d,
    minimumFractionDigits: d,
  });
const $ = (id) => document.getElementById(id);

// ── State ────────────────────────────────────────────────────────────────────
let profile = {};
let athleteProfile = {};

// ── Render ───────────────────────────────────────────────────────────────────
function renderProfile() {
  const first = profile.first_name || '';
  const last  = profile.last_name  || '';
  $('fullName').textContent = `${first} ${last}`.trim() || '—';
  $('avatar').textContent   = first[0] || '?';
  $('place').textContent    = [profile.city, profile.country].filter(Boolean).join('، ') || '—';

  const h = athleteProfile.height || 0;
  const w = athleteProfile.weight || 0;
  $('sHeight').textContent = h ? fa(h)     : '—';
  $('sWeight').textContent = w ? fa(w, 1)  : '—';
  $('sBmi').textContent    = (h && w) ? fa(w / Math.pow(h / 100, 2), 1) : '—';
  $('sYears').textContent  = '—';          // reserved for future field
}

function fillForm() {
  const form = $('profileForm');
  if (!form) return;
  const map = {
    first:   profile.first_name,
    last:    profile.last_name,
    city:    profile.city,
    country: profile.country,
    height:  athleteProfile.height,
    weight:  athleteProfile.weight,
    history: '',    // not yet in DB — future field
  };
  Object.entries(map).forEach(([k, v]) => {
    if (form.elements[k]) form.elements[k].value = v ?? '';
  });
}

// ── Medals (static placeholders for now) ─────────────────────────────────────
function renderMedals() {
  const list = $('medals');
  if (!list) return;
  list.innerHTML = '<li class="empty-note">مدال و افتخاری ثبت نشده.</li>';
}

// ── Edit / Save form ──────────────────────────────────────────────────────────
const form    = $('profileForm');
const editBtn = $('editBtn');
let editing   = false;

editBtn && editBtn.addEventListener('click', async () => {
  if (editing) {
    // Gather changed values
    const payload = {
      first_name: form.elements.first.value.trim()   || undefined,
      last_name:  form.elements.last.value.trim()    || undefined,
      city:       form.elements.city.value.trim()    || undefined,
      country:    form.elements.country.value.trim() || undefined,
      height:     parseFloat(form.elements.height.value) || undefined,
      weight:     parseFloat(form.elements.weight.value) || undefined,
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

    // Merge updates into local state
    if (payload.first_name) profile.first_name = payload.first_name;
    if (payload.last_name)  profile.last_name  = payload.last_name;
    if (payload.city)       profile.city       = payload.city;
    if (payload.country)    profile.country    = payload.country;
    if (payload.height)     athleteProfile.height = payload.height;
    if (payload.weight)     athleteProfile.weight = payload.weight;

    // Persist locally for quick reload
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

  // Try cached user first for instant render
  const cached = getLocalUser();
  if (cached) {
    profile = cached;
    renderProfile();
  }

  // Then fetch fresh data from API
  const result = await apiFetch('/profile');
  if (!result || !result.ok) {
    toast('خطا در بارگذاری پروفایل.');
    return;
  }

  profile        = result.data.user    || {};
  athleteProfile = result.data.profile || {};

  renderProfile();
  renderMedals();
  fillForm();
}

init();
