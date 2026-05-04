// ========== API CONFIGURATION ==========
const API_URL = "https://iot-production-17b1.up.railway.app/api/items";

// ========== DOM ELEMENTS ==========
// All initialized in DOMContentLoaded — never access these before that fires
let itemDescriptionTextarea;
let dateMissingInput;
let timeMissingInput;
let lastLocationInput;
let searchBtn;
let searchStatus;
let searchResultContainer;
let reportSection;
let reportForm;
let studentNameInput;
let contactNumberInput;
let studentEmailInput;
let reportItemDescriptionTextarea;
let reportDateMissingInput;
let reportTimeMissingInput;
let reportLastLocationInput;
let refPhotoFile1Input;
let refPhotoFile2Input;
let matchedItemIdInput;
let matchScoreInput;
let submitReportBtn;
let cancelReportBtn;
let reportFormMessage;
let reportSuccessPanel;
let sidebarToggle;
let sidebarBackdrop;
let logoutBtn;

// ========== APP STATE ==========
let currentSection = 'dashboard';

// FIX: matched_item_id must default to null (not 0 or "")
// so it gets stored as SQL NULL in the database.
// If it's stored as "" the admin's .is('matched_item_id', null) filter won't find it.
const matchState = {
  matched_item_id: null,   // CRITICAL: keep as null, never ""
  match_score: 0,
  item_description: '',
  date_missing: '',
  time_missing: '',
  last_location: '',
};

// ========== PROFILE LOADING ==========
async function loadUserProfile() {
  try {
    if (!window.supabaseClient) {
      console.warn('[loadUserProfile] Supabase client not available');
      return;
    }

    const { data } = await window.supabaseClient.auth.getSession();
    const session = data?.session;

    if (!session?.user?.id) {
      console.log('[loadUserProfile] No active session');
      return;
    }

    if (typeof getProfile !== 'function') {
      console.warn('[loadUserProfile] getProfile() not available from auth.js');
      return;
    }

    const profile = await getProfile(session.user.id);
    console.log('[loadUserProfile] Profile fetched:', profile);

    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = profile?.full_name || 'Student';

    // Pre-fill report form fields with profile data
    if (studentNameInput && profile?.full_name) studentNameInput.value = profile.full_name;
    if (studentEmailInput && profile?.email) studentEmailInput.value = profile.email;

  } catch (error) {
    console.error('[loadUserProfile] Error:', error);
  }
}

// ========== TOAST NOTIFICATION ==========
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast?.parentNode?.removeChild(toast), 3500);
}

// ========== STATUS MESSAGES ==========
function setStatusMessage(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message;
  element.className = 'status-message';
  if (message) element.classList.add(`status-message--${type}`);
}

// ========== SEARCH RESULT RENDERING ==========
function renderSearchResult({ matched_item_id, match_score }) {
  if (!searchResultContainer) {
    console.warn('[renderSearchResult] searchResultContainer not found');
    return;
  }

  searchResultContainer.innerHTML = '';
  const normalizedScore = Number(match_score) || 0;
  console.log('[renderSearchResult] AI Match Score:', normalizedScore, '| matched_item_id:', matched_item_id);

  if (normalizedScore >= 70) {
    searchResultContainer.innerHTML = `
      <div class="match-score-card">
        <h3>Match Found!</h3>
        <div class="match-score-percentage">${normalizedScore}%</div>
        <p>We found an item in our office that closely matches your description.</p>
        <div class="match-actions">
          <button class="btn btn-success" id="verifyReportBtn">Verify &amp; File Report</button>
        </div>
      </div>
    `;
    document.getElementById('verifyReportBtn')?.addEventListener('click', showReportForm);
  } else {
    searchResultContainer.innerHTML = `
      <div class="no-match-message">
        <p>No immediate match found in our system.</p>
        <p>You can still file a formal report so we can notify you once your item is turned in.</p>
        <div class="match-actions">
          <button class="btn btn-secondary" id="fileReportBtn">File a Formal Report</button>
        </div>
      </div>
    `;
    document.getElementById('fileReportBtn')?.addEventListener('click', showReportForm);
  }
}

// ========== BLIND SEARCH ==========
async function searchBlindMatch() {
  if (!itemDescriptionTextarea) {
    console.error('[searchBlindMatch] itemDescriptionTextarea not found');
    return;
  }

  const item_description = itemDescriptionTextarea.value.trim();
  const date_missing     = dateMissingInput?.value || '';
  const time_missing     = timeMissingInput?.value || '';
  const last_location    = lastLocationInput?.value.trim() || '';

  if (!item_description) {
    setStatusMessage(searchStatus, 'Please describe the lost item before searching.', 'error');
    itemDescriptionTextarea.focus();
    return;
  }

  if (searchBtn) searchBtn.disabled = true;
  setStatusMessage(searchStatus, 'Searching for the best match...', 'info');

  try {
    console.log('[searchBlindMatch] Sending request:', { item_description, date_missing, time_missing, last_location });

    const response = await fetch(`${API_URL}/blind-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_description, date_missing, time_missing, last_location }),
    });

    const result = await response.json();
    console.log('[searchBlindMatch] API response:', result);

    if (!response.ok) throw new Error(result.error || 'Blind match search failed');

    // FIX: Explicitly coerce matched_item_id to null if falsy
    // This prevents "" from leaking into the report submission
    matchState.matched_item_id = result.matched_item_id || null;
    matchState.match_score     = Number(result.match_score) || 0;
    matchState.item_description = item_description;
    matchState.date_missing    = date_missing;
    matchState.time_missing    = time_missing;
    matchState.last_location   = last_location;

    console.log('[searchBlindMatch] matchState saved:', matchState);

    // Pre-fill hidden fields
    // FIX: If matched_item_id is null, set value to "" in the input
    // but we'll convert it back to null before submission
    if (matchedItemIdInput) matchedItemIdInput.value = matchState.matched_item_id ?? '';
    if (matchScoreInput) matchScoreInput.value = matchState.match_score;
    if (reportItemDescriptionTextarea) reportItemDescriptionTextarea.value = item_description;
    if (reportDateMissingInput) reportDateMissingInput.value = date_missing;
    if (reportTimeMissingInput) reportTimeMissingInput.value = time_missing;
    if (reportLastLocationInput) reportLastLocationInput.value = last_location;

    renderSearchResult(result);
    setStatusMessage(searchStatus, 'Search completed.', 'success');

  } catch (error) {
    console.error('[searchBlindMatch] Error:', error);
    renderSearchResult({ matched_item_id: null, match_score: 0 });
    setStatusMessage(searchStatus, error.message || 'Unable to perform search.', 'error');
  } finally {
    if (searchBtn) searchBtn.disabled = false;
  }
}

// ========== SHOW REPORT FORM ==========
function showReportForm() {
  try {
    if (!reportSection) {
      console.warn('[showReportForm] reportSection not found');
      return;
    }

    reportSection.hidden = false;
    if (reportSuccessPanel) reportSuccessPanel.hidden = true;

    setStatusMessage(reportFormMessage, 'Complete the form and submit. Your match score has been preserved.', 'info');

    // Re-apply matchState to form fields
    if (reportItemDescriptionTextarea) reportItemDescriptionTextarea.value = matchState.item_description;
    if (reportDateMissingInput) reportDateMissingInput.value = matchState.date_missing;
    if (reportTimeMissingInput) reportTimeMissingInput.value = matchState.time_missing;
    if (reportLastLocationInput) reportLastLocationInput.value = matchState.last_location;
    if (matchedItemIdInput) matchedItemIdInput.value = matchState.matched_item_id ?? '';
    if (matchScoreInput) matchScoreInput.value = matchState.match_score;

    reportSection.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error('[showReportForm] Error:', error);
  }
}

// ========== HIDE REPORT FORM ==========
function hideReportForm() {
  if (reportSection) reportSection.hidden = true;
  if (reportSuccessPanel) reportSuccessPanel.hidden = true;
  setStatusMessage(reportFormMessage, '', 'info');
}

// ========== PHOTO UPLOAD ==========
async function uploadReferencePhoto(file) {
  if (!file) return '';

  if (!window.supabaseClient) throw new Error('Supabase client not available');

  const fileExt = file.name.split('.').pop() || 'jpg';
  const fileName = `reference_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

  console.log('[uploadReferencePhoto] Uploading:', fileName, 'to bucket: reference-photos');

  const { error } = await window.supabaseClient.storage
    .from('reference-photos')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) throw new Error('Upload failed: ' + error.message);

  return `${window.SUPABASE_URL}/storage/v1/object/public/reference-photos/${encodeURIComponent(fileName)}`;
}

// ========== REPORT SUBMISSION ==========
async function submitLostReport(event) {
  event.preventDefault();

  const student_name   = studentNameInput?.value.trim();
  const contact_number = contactNumberInput?.value.trim();
  const student_email  = studentEmailInput?.value.trim();
  const item_description = reportItemDescriptionTextarea?.value.trim();
  const date_missing   = reportDateMissingInput?.value || '';
  const time_missing   = reportTimeMissingInput?.value || '';
  const last_location  = reportLastLocationInput?.value.trim() || '';
  const refPhotoFile1  = refPhotoFile1Input?.files?.[0] || null;
  const refPhotoFile2  = refPhotoFile2Input?.files?.[0] || null;

  // FIX: Convert "" back to null so the DB stores SQL NULL
  // This is the KEY fix — without it, matched_item_id = "" in the DB
  // and the admin's .is('matched_item_id', null) query won't find unmatched reports
  const rawMatchedId   = matchedItemIdInput?.value || '';
  const matched_item_id = rawMatchedId.trim() === '' ? null : rawMatchedId;
  const match_score    = Number(matchScoreInput?.value) || 0;

  console.log('[submitLostReport] Payload preview:', {
    student_name,
    student_email,
    item_description,
    matched_item_id,  // should be null or a UUID string
    match_score,
  });

  // Validation
  if (!student_name || !student_email || !item_description) {
    setStatusMessage(reportFormMessage, 'Please complete your name, email, and item description.', 'error');
    return;
  }

  if (submitReportBtn) {
    submitReportBtn.disabled = true;
    submitReportBtn.textContent = 'Submitting...';
  }

  setStatusMessage(reportFormMessage, 'Submitting your report...', 'info');

  try {
    // Upload photos
    let ref_photo_url_1 = '';
    let ref_photo_url_2 = '';
    if (refPhotoFile1) ref_photo_url_1 = await uploadReferencePhoto(refPhotoFile1);
    if (refPhotoFile2) ref_photo_url_2 = await uploadReferencePhoto(refPhotoFile2);

    const payload = {
      student_name,
      contact_number,
      student_email,
      item_description,
      date_missing,
      time_missing,
      last_location,
      ref_photo_url_1,
      ref_photo_url_2,
      matched_item_id,   // null or UUID string — never ""
      match_score,
    };

    console.log('[submitLostReport] Sending to API:', payload);

    const response = await fetch(`${API_URL}/lost-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log('[submitLostReport] API response:', result);

    if (!response.ok) throw new Error(result.error || 'Failed to submit report.');

    // Success
    if (reportForm) reportForm.reset();
    if (reportSection) reportSection.hidden = true;
    if (reportSuccessPanel) reportSuccessPanel.hidden = false;

    // Reset matchState
    matchState.matched_item_id = null;
    matchState.match_score = 0;

    showToast('Report submitted! Please wait for Admin verification.', 'success');
    setStatusMessage(reportFormMessage, 'Your report has been filed. Admin will verify and contact you.', 'success');

    // Reset UI after 3 seconds
    setTimeout(() => {
      if (reportSection) reportSection.hidden = true;
      if (reportSuccessPanel) reportSuccessPanel.hidden = true;
      if (searchBtn) searchBtn.disabled = false;
      if (searchResultContainer) searchResultContainer.innerHTML = '';
      setStatusMessage(searchStatus, '', 'info');
      if (itemDescriptionTextarea) itemDescriptionTextarea.value = '';
      itemDescriptionTextarea?.focus();
    }, 3000);

  } catch (error) {
    console.error('[submitLostReport] Error:', error);
    setStatusMessage(reportFormMessage, error.message || 'Unable to submit report.', 'error');
  } finally {
    if (submitReportBtn) {
      submitReportBtn.disabled = false;
      submitReportBtn.textContent = 'Submit Report';
    }
  }
}

// ========== SIDEBAR ==========
function openSidebar() {
  document.querySelector('.dashboard-container')?.classList.add('sidebar-open');
}
function closeSidebar() {
  document.querySelector('.dashboard-container')?.classList.remove('sidebar-open');
}
function toggleSidebar() {
  document.querySelector('.dashboard-container')?.classList.toggle('sidebar-open');
}

// ========== NAVIGATION ==========
function initNavigation() {
  try {
    document.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;
        if (section) { switchSection(section); closeSidebar(); }
      });
    });

    sidebarToggle?.addEventListener('click', toggleSidebar);
    sidebarBackdrop?.addEventListener('click', closeSidebar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSidebar(); });

    console.log('[initNavigation] Navigation initialized');
  } catch (error) {
    console.error('[initNavigation] Error:', error);
  }
}

// ========== SECTION SWITCHING ==========
function switchSection(sectionName) {
  try {
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-section="${sectionName}"]`)?.classList.add('active');

    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById(`${sectionName}-section`)?.classList.add('active');

    currentSection = sectionName;
    console.log('[switchSection] Switched to:', sectionName);
  } catch (error) {
    console.error('[switchSection] Error:', error);
  }
}

// ========== LOGOUT ==========
function handleLogout() {
  try {
    if (typeof logout === 'function') logout();
    else if (typeof window.logout === 'function') window.logout();
    else window.location.href = '/login.html';
  } catch (error) {
    console.error('[handleLogout] Error:', error);
    window.location.href = '/login.html';
  }
}

// ========== PAGE INIT ==========
function initPage() {
  try {
    searchBtn?.addEventListener('click', searchBlindMatch);
    reportForm?.addEventListener('submit', submitLostReport);
    cancelReportBtn?.addEventListener('click', hideReportForm);
    logoutBtn?.addEventListener('click', handleLogout);

    // Also allow Enter key in description textarea to trigger search
    itemDescriptionTextarea?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        searchBlindMatch();
      }
    });

    console.log('[initPage] Page initialized. logoutBtn found:', !!logoutBtn);
  } catch (error) {
    console.error('[initPage] Error:', error);
  }
}

// ========== DOM CONTENT LOADED ==========
document.addEventListener('DOMContentLoaded', async function () {
  console.log('=== main.js DOMContentLoaded ===');

  try {
    // Grab all DOM references
    itemDescriptionTextarea        = document.getElementById('itemDescription');
    dateMissingInput               = document.getElementById('dateMissing');
    timeMissingInput               = document.getElementById('timeMissing');
    lastLocationInput              = document.getElementById('lastLocation');
    searchBtn                      = document.getElementById('searchBtn');
    searchStatus                   = document.getElementById('searchStatus');
    searchResultContainer          = document.getElementById('searchResultContainer');
    reportSection                  = document.getElementById('reportSection');
    reportForm                     = document.getElementById('reportForm');
    studentNameInput               = document.getElementById('studentName');
    contactNumberInput             = document.getElementById('contactNumber');
    studentEmailInput              = document.getElementById('studentEmail');
    reportItemDescriptionTextarea  = document.getElementById('reportItemDescription');
    reportDateMissingInput         = document.getElementById('reportDateMissing');
    reportTimeMissingInput         = document.getElementById('reportTimeMissing');
    reportLastLocationInput        = document.getElementById('reportLastLocation');
    refPhotoFile1Input             = document.getElementById('refPhotoFile1');
    refPhotoFile2Input             = document.getElementById('refPhotoFile2');
    matchedItemIdInput             = document.getElementById('matchedItemId');
    matchScoreInput                = document.getElementById('matchScore');
    submitReportBtn                = document.getElementById('submitReportBtn');
    cancelReportBtn                = document.getElementById('cancelReportBtn');
    reportFormMessage              = document.getElementById('reportFormMessage');
    reportSuccessPanel             = document.getElementById('reportSuccessPanel');
    sidebarToggle                  = document.getElementById('sidebarToggle');
    sidebarBackdrop                = document.getElementById('sidebarBackdrop');
    logoutBtn                      = document.getElementById('logoutBtn');

    // Log any missing critical elements
    const critical = { itemDescriptionTextarea, searchBtn, reportForm, logoutBtn };
    Object.entries(critical).forEach(([name, el]) => {
      if (!el) console.warn(`[DOMContentLoaded] ⚠️ Missing element: #${name}`);
    });

    if (typeof checkAuthAndRedirect === 'function') await checkAuthAndRedirect();

    await loadUserProfile();
    initNavigation();
    initPage();

    console.log('=== main.js Initialization Complete ===');

  } catch (error) {
    console.error('[DOMContentLoaded] Fatal error:', error);
  }
});