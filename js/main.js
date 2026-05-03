const API_URL = "https://iot-production-17b1.up.railway.app/api/items";

const itemDescriptionTextarea = document.getElementById('itemDescription');
const dateMissingInput = document.getElementById('dateMissing');
const timeMissingInput = document.getElementById('timeMissing');
const lastLocationInput = document.getElementById('lastLocation');
const searchBtn = document.getElementById('searchBtn');
const searchStatus = document.getElementById('searchStatus');
const searchResultContainer = document.getElementById('searchResultContainer');

const reportSection = document.getElementById('reportSection');
const reportForm = document.getElementById('reportForm');
const studentNameInput = document.getElementById('studentName');
const contactNumberInput = document.getElementById('contactNumber');
const studentEmailInput = document.getElementById('studentEmail');
const reportItemDescriptionTextarea = document.getElementById('reportItemDescription');
const reportDateMissingInput = document.getElementById('reportDateMissing');
const reportTimeMissingInput = document.getElementById('reportTimeMissing');
const reportLastLocationInput = document.getElementById('reportLastLocation');
const refPhotoFile1Input = document.getElementById('refPhotoFile1');
const refPhotoFile2Input = document.getElementById('refPhotoFile2');
const matchedItemIdInput = document.getElementById('matchedItemId');
const matchScoreInput = document.getElementById('matchScore');
const submitReportBtn = document.getElementById('submitReportBtn');
const cancelReportBtn = document.getElementById('cancelReportBtn');
const reportFormMessage = document.getElementById('reportFormMessage');
const reportSuccessPanel = document.getElementById('reportSuccessPanel');

const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
let currentSection = 'dashboard';

const matchState = {
  matched_item_id: null,
  match_score: 0,
  item_description: '',
  date_missing: '',
  time_missing: '',
  last_location: '',
};

async function loadUserProfile() {
  try {
    const { data } = await supabaseClient.auth.getSession();
    const session = data?.session;
    if (!session?.user?.id) return;

    const profile = await getProfile(session.user.id);
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = profile.full_name || 'Student';

    if (studentNameInput) studentNameInput.value = profile.full_name || '';
    if (studentEmailInput) studentEmailInput.value = profile.email || '';
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

function setStatusMessage(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message;
  element.className = 'status-message';
  if (message) element.classList.add(`status-message--${type}`);
}

function renderSearchResult({ matched_item_id, match_score }) {
  searchResultContainer.innerHTML = '';
  const normalizedScore = Number(match_score) || 0;

  if (normalizedScore >= 70) {
    searchResultContainer.innerHTML = `
      <div class="search-card">
        <p>We found an item in our office that closely matches your description (Match Score: ${normalizedScore}%).</p>
        <button class="btn btn-primary" id="verifyReportBtn">Verify & File Report</button>
      </div>
    `;

    document.getElementById('verifyReportBtn')?.addEventListener('click', showReportForm);
  } else {
    searchResultContainer.innerHTML = `
      <div class="search-card">
        <p>No immediate match found, but you can still file a formal report so we can notify you once it's turned in.</p>
        <button class="btn btn-secondary" id="fileReportBtn">File a Formal Report</button>
      </div>
    `;

    document.getElementById('fileReportBtn')?.addEventListener('click', showReportForm);
  }
}

async function searchBlindMatch() {
  const item_description = itemDescriptionTextarea?.value.trim();
  const date_missing = dateMissingInput?.value || '';
  const time_missing = timeMissingInput?.value || '';
  const last_location = lastLocationInput?.value.trim() || '';

  if (!item_description) {
    setStatusMessage(searchStatus, 'Please describe the lost item before searching.', 'error');
    itemDescriptionTextarea.focus();
    return;
  }

  searchBtn.disabled = true;
  setStatusMessage(searchStatus, 'Searching for the best blind match...', 'info');

  try {
    const response = await fetch(`${API_URL}/blind-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_description, date_missing, time_missing, last_location }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Blind match search failed');
    }

    matchState.matched_item_id = result.matched_item_id || null;
    matchState.match_score = Number(result.match_score) || 0;
    matchState.item_description = item_description;
    matchState.date_missing = date_missing;
    matchState.time_missing = time_missing;
    matchState.last_location = last_location;

    matchedItemIdInput.value = matchState.matched_item_id || '';
    matchScoreInput.value = matchState.match_score;
    reportItemDescriptionTextarea.value = item_description;
    reportDateMissingInput.value = date_missing;
    reportTimeMissingInput.value = time_missing;
    reportLastLocationInput.value = last_location;

    renderSearchResult(result);
    setStatusMessage(searchStatus, 'Search completed.', 'success');
  } catch (error) {
    console.error('Blind search error:', error);
    renderSearchResult({ matched_item_id: null, match_score: 0 });
    setStatusMessage(searchStatus, error.message || 'Unable to perform blind match search.', 'error');
  } finally {
    searchBtn.disabled = false;
  }
}

function showReportForm() {
  if (!reportSection) return;
  reportSection.hidden = false;
  if (reportSuccessPanel) {
    reportSuccessPanel.hidden = true;
  }
  setStatusMessage(reportFormMessage, 'Complete the report form and submit it. Your match score has been preserved.', 'info');
  reportItemDescriptionTextarea.value = matchState.item_description;
  reportDateMissingInput.value = matchState.date_missing;
  reportTimeMissingInput.value = matchState.time_missing;
  reportLastLocationInput.value = matchState.last_location;
  matchedItemIdInput.value = matchState.matched_item_id || '';
  matchScoreInput.value = matchState.match_score;
  reportFormMessage.scrollIntoView({ behavior: 'smooth' });
}

function hideReportForm() {
  if (!reportSection) return;
  reportSection.hidden = true;
  if (reportSuccessPanel) reportSuccessPanel.hidden = true;
  setStatusMessage(reportFormMessage, '', 'info');
}

async function uploadReferencePhoto(file) {
  if (!file) return '';

  const fileExt = file.name.split('.').pop() || 'jpg';
  const fileName = `reference_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

  const { data, error } = await supabaseClient.storage
    .from('reference_photos')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) {
    throw error;
  }

  return `${window.SUPABASE_URL}/storage/v1/object/public/reference_photos/${encodeURIComponent(fileName)}`;
}

async function submitLostReport(event) {
  event.preventDefault();

  const student_name = studentNameInput?.value.trim();
  const contact_number = contactNumberInput?.value.trim();
  const student_email = studentEmailInput?.value.trim();
  const item_description = reportItemDescriptionTextarea?.value.trim();
  const date_missing = reportDateMissingInput?.value || '';
  const time_missing = reportTimeMissingInput?.value || '';
  const last_location = reportLastLocationInput?.value.trim() || '';
  const refPhotoFile1 = refPhotoFile1Input?.files?.[0] || null;
  const refPhotoFile2 = refPhotoFile2Input?.files?.[0] || null;
  const matched_item_id = matchedItemIdInput?.value || null;
  const match_score = Number(matchScoreInput?.value) || 0;

  if (!student_name || !student_email || !item_description) {
    setStatusMessage(reportFormMessage, 'Please complete your name, email, and item description.', 'error');
    return;
  }

  submitReportBtn.disabled = true;
  submitReportBtn.textContent = 'Submitting...';
  setStatusMessage(reportFormMessage, 'Submitting your report...', 'info');

  try {
    let ref_photo_url_1 = '';
    let ref_photo_url_2 = '';

    if (refPhotoFile1) {
      ref_photo_url_1 = await uploadReferencePhoto(refPhotoFile1);
    }
    if (refPhotoFile2) {
      ref_photo_url_2 = await uploadReferencePhoto(refPhotoFile2);
    }

    const response = await fetch(`${API_URL}/lost-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name,
        contact_number,
        student_email,
        item_description,
        date_missing,
        time_missing,
        last_location,
        ref_photo_url_1,
        ref_photo_url_2,
        matched_item_id,
        match_score,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to submit the report.');
    }

    reportForm.reset();
    reportSection.hidden = true;
    if (reportSuccessPanel) {
      reportSuccessPanel.hidden = false;
    }
    setStatusMessage(reportFormMessage, 'Report submitted successfully. We will notify you once the item is turned in.', 'success');
  } catch (error) {
    console.error('Report submission error:', error);
    setStatusMessage(reportFormMessage, error.message || 'Unable to submit report.', 'error');
  } finally {
    submitReportBtn.disabled = false;
    submitReportBtn.textContent = 'Submit Report';
  }
}

function openSidebar() {
  document.querySelector('.dashboard-container').classList.add('sidebar-open');
}

function closeSidebar() {
  document.querySelector('.dashboard-container').classList.remove('sidebar-open');
}

function toggleSidebar() {
  document.querySelector('.dashboard-container').classList.toggle('sidebar-open');
}

function initNavigation() {
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      switchSection(section);
      closeSidebar();
    });
  });

  if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
  if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });
}

function switchSection(sectionName) {
  document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
  document.querySelector(`[data-section="${sectionName}"]`)?.classList.add('active');
  document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
  document.getElementById(`${sectionName}-section`)?.classList.add('active');
  currentSection = sectionName;
}

function initPage() {
  if (searchBtn) searchBtn.addEventListener('click', searchBlindMatch);
  if (reportForm) reportForm.addEventListener('submit', submitLostReport);
  if (cancelReportBtn) cancelReportBtn.addEventListener('click', hideReportForm);
}

initNavigation();
checkAuthAndRedirect();
loadUserProfile();
initPage();
