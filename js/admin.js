// API Configuration
const API_URL = "https://iot-production-17b1.up.railway.app/api/items";

// DOM Elements (will be initialized in DOMContentLoaded)
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

// App State
let currentSection = 'dashboard';

const matchState = {
  matched_item_id: null,
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
      console.warn('Supabase client not available for profile loading');
      return;
    }

    const { data } = await window.supabaseClient.auth.getSession();
    const session = data?.session;
    
    if (!session?.user?.id) {
      console.log('No active session for profile loading');
      return;
    }

    // Fetch profile using the getProfile function from auth.js
    if (typeof getProfile !== 'function') {
      console.warn('getProfile function not available');
      return;
    }

    const profile = await getProfile(session.user.id);
    
    // Update UI with profile data
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
      userNameEl.textContent = profile?.full_name || 'Student';
    } else {
      console.warn('userName element not found');
    }

    // Pre-fill form with user data
    if (studentNameInput && profile?.full_name) {
      studentNameInput.value = profile.full_name;
    }
    if (studentEmailInput && profile?.email) {
      studentEmailInput.value = profile.email;
    }

    console.log('Profile loaded successfully');
  } catch (error) {
    console.error('Error loading profile:', error);
    // Continue gracefully - loading is not critical
  }
}

// ========== STATUS MESSAGES ==========

function setStatusMessage(element, message, type = 'info') {
  if (!element) {
    console.warn('Status message element is null');
    return;
  }
  
  element.textContent = message;
  element.className = 'status-message';
  
  if (message) {
    element.classList.add(`status-message--${type}`);
  }
}

// ========== SEARCH RESULT RENDERING ==========

function renderSearchResult({ matched_item_id, match_score }) {
  if (!searchResultContainer) {
    console.warn('searchResultContainer element not found');
    return;
  }

  searchResultContainer.innerHTML = '';
  const normalizedScore = Number(match_score) || 0;

  if (normalizedScore >= 70) {
    // High match score - show success card
    searchResultContainer.innerHTML = `
      <div class="match-score-card">
        <h3>Match Found!</h3>
        <div class="match-score-percentage">${normalizedScore}</div>
        <p>We found an item in our office that closely matches your description.</p>
        <div class="match-actions">
          <button class="btn btn-success" id="verifyReportBtn">Verify & File Report</button>
        </div>
      </div>
    `;

    // Attach event listener to dynamically created button
    const verifyBtn = document.getElementById('verifyReportBtn');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', showReportForm);
    }
  } else {
    // No match - show no match message
    searchResultContainer.innerHTML = `
      <div class="no-match-message">
        <p>No immediate match found in our system.</p>
        <p>You can still file a formal report so we can notify you once your item is turned in.</p>
        <div class="match-actions">
          <button class="btn btn-secondary" id="fileReportBtn">File a Formal Report</button>
        </div>
      </div>
    `;

    // Attach event listener to dynamically created button
    const fileReportBtn = document.getElementById('fileReportBtn');
    if (fileReportBtn) {
      fileReportBtn.addEventListener('click', showReportForm);
    }
  }
}

// ========== BLIND SEARCH ==========

async function searchBlindMatch() {
  try {
    if (!itemDescriptionTextarea) {
      console.error('itemDescriptionTextarea element not found');
      return;
    }

    const item_description = itemDescriptionTextarea.value.trim();
    const date_missing = dateMissingInput?.value || '';
    const time_missing = timeMissingInput?.value || '';
    const last_location = lastLocationInput?.value.trim() || '';

    if (!item_description) {
      setStatusMessage(searchStatus, 'Please describe the lost item before searching.', 'error');
      itemDescriptionTextarea.focus();
      return;
    }

    if (searchBtn) searchBtn.disabled = true;
    setStatusMessage(searchStatus, 'Searching for the best blind match...', 'info');

    const response = await fetch(`${API_URL}/blind-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_description, date_missing, time_missing, last_location }),
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || 'Blind match search failed');
    }

    // Save match state for later use
    matchState.matched_item_id = result.matched_item_id || null;
    matchState.match_score = Number(result.match_score) || 0;
    matchState.item_description = item_description;
    matchState.date_missing = date_missing;
    matchState.time_missing = time_missing;
    matchState.last_location = last_location;

    // Pre-fill hidden report form fields
    if (matchedItemIdInput) matchedItemIdInput.value = matchState.matched_item_id || '';
    if (matchScoreInput) matchScoreInput.value = matchState.match_score;
    if (reportItemDescriptionTextarea) reportItemDescriptionTextarea.value = item_description;
    if (reportDateMissingInput) reportDateMissingInput.value = date_missing;
    if (reportTimeMissingInput) reportTimeMissingInput.value = time_missing;
    if (reportLastLocationInput) reportLastLocationInput.value = last_location;

    // Render result
    renderSearchResult(result);
    setStatusMessage(searchStatus, 'Search completed.', 'success');
    
  } catch (error) {
    console.error('Blind search error:', error);
    renderSearchResult({ matched_item_id: null, match_score: 0 });
    setStatusMessage(searchStatus, error.message || 'Unable to perform blind match search.', 'error');
  } finally {
    if (searchBtn) searchBtn.disabled = false;
  }
}

// ========== REPORT FORM DISPLAY ==========

function showReportForm() {
  try {
    if (!reportSection) {
      console.warn('reportSection element not found');
      return;
    }

    // Show report section
    reportSection.hidden = false;
    
    // Hide success panel if it exists
    if (reportSuccessPanel) {
      reportSuccessPanel.hidden = true;
    }

    // Show info message
    setStatusMessage(
      reportFormMessage,
      'Complete the report form and submit it. Your match score has been preserved.',
      'info'
    );

    // Pre-fill with saved match state
    if (reportItemDescriptionTextarea) reportItemDescriptionTextarea.value = matchState.item_description;
    if (reportDateMissingInput) reportDateMissingInput.value = matchState.date_missing;
    if (reportTimeMissingInput) reportTimeMissingInput.value = matchState.time_missing;
    if (reportLastLocationInput) reportLastLocationInput.value = matchState.last_location;
    if (matchedItemIdInput) matchedItemIdInput.value = matchState.matched_item_id || '';
    if (matchScoreInput) matchScoreInput.value = matchState.match_score;

    // Scroll to form
    if (reportFormMessage) {
      reportFormMessage.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (error) {
    console.error('Error showing report form:', error);
  }
}

// ========== REPORT FORM HIDE ==========

function hideReportForm() {
  try {
    if (reportSection) {
      reportSection.hidden = true;
    }
    if (reportSuccessPanel) {
      reportSuccessPanel.hidden = true;
    }
    setStatusMessage(reportFormMessage, '', 'info');
  } catch (error) {
    console.error('Error hiding report form:', error);
  }
}

// ========== PHOTO UPLOAD ==========

async function uploadReferencePhoto(file) {
  if (!file) return '';

  try {
    if (!window.supabaseClient) {
      throw new Error('Supabase client not available');
    }

    const fileExt = file.name.split('.').pop() || 'jpg';
    const fileName = `reference_${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { data, error } = await window.supabaseClient.storage
      .from('reference_photos')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if (error) {
      throw error;
    }

    return `${window.SUPABASE_URL}/storage/v1/object/public/reference_photos/${encodeURIComponent(fileName)}`;
  } catch (error) {
    console.error('Photo upload error:', error);
    throw new Error('Failed to upload reference photo: ' + error.message);
  }
}

// ========== REPORT SUBMISSION ==========

async function submitLostReport(event) {
  event.preventDefault();

  try {
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

    // Validation
    if (!student_name || !student_email || !item_description) {
      setStatusMessage(
        reportFormMessage,
        'Please complete your name, email, and item description.',
        'error'
      );
      return;
    }

    // Disable submit button
    if (submitReportBtn) {
      submitReportBtn.disabled = true;
      submitReportBtn.textContent = 'Submitting...';
    }

    setStatusMessage(reportFormMessage, 'Submitting your report...', 'info');

    // Upload photos if provided
    let ref_photo_url_1 = '';
    let ref_photo_url_2 = '';

    if (refPhotoFile1) {
      ref_photo_url_1 = await uploadReferencePhoto(refPhotoFile1);
    }
    if (refPhotoFile2) {
      ref_photo_url_2 = await uploadReferencePhoto(refPhotoFile2);
    }

    // Submit report
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

    // Success - reset form and show success panel
    if (reportForm) reportForm.reset();
    if (reportSection) reportSection.hidden = true;
    if (reportSuccessPanel) reportSuccessPanel.hidden = false;
    
    setStatusMessage(
      reportFormMessage,
      'Report submitted successfully. We will notify you once the item is turned in.',
      'success'
    );

  } catch (error) {
    console.error('Report submission error:', error);
    setStatusMessage(
      reportFormMessage,
      error.message || 'Unable to submit report.',
      'error'
    );
  } finally {
    if (submitReportBtn) {
      submitReportBtn.disabled = false;
      submitReportBtn.textContent = 'Submit Report';
    }
  }
}

// ========== SIDEBAR NAVIGATION ==========

function openSidebar() {
  const container = document.querySelector('.dashboard-container');
  if (container) {
    container.classList.add('sidebar-open');
  }
}

function closeSidebar() {
  const container = document.querySelector('.dashboard-container');
  if (container) {
    container.classList.remove('sidebar-open');
  }
}

function toggleSidebar() {
  const container = document.querySelector('.dashboard-container');
  if (container) {
    container.classList.toggle('sidebar-open');
  }
}

// ========== NAVIGATION INITIALIZATION ==========

function initNavigation() {
  try {
    // Initialize menu items
    document.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const section = item.dataset.section;
        if (section) {
          switchSection(section);
          closeSidebar();
        }
      });
    });

    // Initialize sidebar toggle
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', toggleSidebar);
    }

    if (sidebarBackdrop) {
      sidebarBackdrop.addEventListener('click', closeSidebar);
    }

    // Close sidebar on Escape key
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeSidebar();
      }
    });

    console.log('Navigation initialized successfully');
  } catch (error) {
    console.error('Error initializing navigation:', error);
  }
}

// ========== SECTION SWITCHING ==========

function switchSection(sectionName) {
  try {
    // Update active menu item
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.remove('active');
    });
    const activeMenuItem = document.querySelector(`[data-section="${sectionName}"]`);
    if (activeMenuItem) {
      activeMenuItem.classList.add('active');
    }

    // Update active content section
    document.querySelectorAll('.content-section').forEach(section => {
      section.classList.remove('active');
    });
    const activeSection = document.getElementById(`${sectionName}-section`);
    if (activeSection) {
      activeSection.classList.add('active');
    }

    currentSection = sectionName;
    console.log('Switched to section:', sectionName);
  } catch (error) {
    console.error('Error switching section:', error);
  }
}

// ========== LOGOUT HANDLER ==========

function handleLogout() {
  try {
    console.log('Logout button clicked');
    
    // Call the logout function from auth.js
    if (typeof logout === 'function') {
      logout();
    } else if (typeof window.logout === 'function') {
      window.logout();
    } else {
      console.error('Logout function not available');
      // Fallback: redirect to login
      window.location.href = '/login.html';
    }
  } catch (error) {
    console.error('Error during logout:', error);
    // Fallback: redirect to login
    window.location.href = '/login.html';
  }
}

// ========== PAGE INITIALIZATION ==========

function initPage() {
  try {
    // Search button
    if (searchBtn) {
      searchBtn.addEventListener('click', searchBlindMatch);
    } else {
      console.warn('searchBtn element not found');
    }

    // Report form submission
    if (reportForm) {
      reportForm.addEventListener('submit', submitLostReport);
    } else {
      console.warn('reportForm element not found');
    }

    // Cancel report button
    if (cancelReportBtn) {
      cancelReportBtn.addEventListener('click', hideReportForm);
    } else {
      console.warn('cancelReportBtn element not found');
    }

    // LOGOUT BUTTON - Critical fix!
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
      console.log('Logout button listener attached successfully');
    } else {
      console.warn('logoutBtn element not found');
    }

    console.log('Page initialization completed');
  } catch (error) {
    console.error('Error during page initialization:', error);
  }
}

// ========== DOM CONTENT LOADED ==========

document.addEventListener('DOMContentLoaded', async function() {
  console.log('=== DOMContentLoaded triggered ===');

  try {
    // Initialize all DOM element references
    itemDescriptionTextarea = document.getElementById('itemDescription');
    dateMissingInput = document.getElementById('dateMissing');
    timeMissingInput = document.getElementById('timeMissing');
    lastLocationInput = document.getElementById('lastLocation');
    searchBtn = document.getElementById('searchBtn');
    searchStatus = document.getElementById('searchStatus');
    searchResultContainer = document.getElementById('searchResultContainer');
    reportSection = document.getElementById('reportSection');
    reportForm = document.getElementById('reportForm');
    studentNameInput = document.getElementById('studentName');
    contactNumberInput = document.getElementById('contactNumber');
    studentEmailInput = document.getElementById('studentEmail');
    reportItemDescriptionTextarea = document.getElementById('reportItemDescription');
    reportDateMissingInput = document.getElementById('reportDateMissing');
    reportTimeMissingInput = document.getElementById('reportTimeMissing');
    reportLastLocationInput = document.getElementById('reportLastLocation');
    refPhotoFile1Input = document.getElementById('refPhotoFile1');
    refPhotoFile2Input = document.getElementById('refPhotoFile2');
    matchedItemIdInput = document.getElementById('matchedItemId');
    matchScoreInput = document.getElementById('matchScore');
    submitReportBtn = document.getElementById('submitReportBtn');
    cancelReportBtn = document.getElementById('cancelReportBtn');
    reportFormMessage = document.getElementById('reportFormMessage');
    reportSuccessPanel = document.getElementById('reportSuccessPanel');
    sidebarToggle = document.getElementById('sidebarToggle');
    sidebarBackdrop = document.getElementById('sidebarBackdrop');
    logoutBtn = document.getElementById('logoutBtn');  // Critical: Get logout button

    console.log('DOM elements initialized. Logout button status:', !!logoutBtn);

    // Initialize authentication and navigation
    if (typeof checkAuthAndRedirect === 'function') {
      await checkAuthAndRedirect();
    } else {
      console.warn('checkAuthAndRedirect function not available from auth.js');
    }

    // Load user profile
    await loadUserProfile();

    // Initialize navigation
    initNavigation();

    // Initialize page listeners
    initPage();

    console.log('=== Initialization complete ===');

  } catch (error) {
    console.error('Fatal error during DOMContentLoaded:', error);
  }
});
