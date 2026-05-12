// ========== SUPABASE CLIENT SAFETY CHECK ==========
console.log("Checking Supabase connection...");
if (window.supabaseClient) {
  console.log("✅ Supabase is ready and connected to Admin Panel");
} else {
  console.error("❌ Supabase client NOT FOUND. Check your script loading order.");
}

// ========== CONSTANTS & STATE ==========
const FALLBACK_ITEM_IMAGE = '/assets/images/domini.png';
let currentSection = 'dashboard';
let currentStatusFilter = 'all';
let currentItemId = null;
let currentAdminName = 'Admin';
let currentManualMatchReport = null;
let currentManualMatchItem = null;
let manualMatchSearchTimer = null;
window.currentAdminName = currentAdminName;

function showAdminToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.right = '20px';
  toast.style.bottom = '20px';
  toast.style.zIndex = '2000';
  toast.style.padding = '12px 16px';
  toast.style.borderRadius = '10px';
  toast.style.color = '#fff';
  toast.style.fontWeight = '600';
  toast.style.boxShadow = '0 8px 22px rgba(0, 0, 0, 0.2)';
  toast.style.background = type === 'error' ? '#dc3545' : '#28a745';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(8px)';
  toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 220);
  }, 2400);
}

function setVerificationActionLoading(buttonEl, isLoading, loadingText = '') {
  if (!buttonEl) return;

  const actionContainer = buttonEl.closest('.verification-actions');
  const buttons = actionContainer ? actionContainer.querySelectorAll('button') : [buttonEl];

  buttons.forEach(btn => {
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
    btn.disabled = isLoading;
  });

  if (isLoading) {
    buttonEl.innerHTML = loadingText;
  } else {
    buttons.forEach(btn => {
      if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
    });
  }
}

// DOM element references (populated on DOMContentLoaded)
let logoutBtn, hamburgerBtn, sidebarOverlay, sidebar, sidebarClose, refreshBtn, verificationContainer;

const DASHBOARD_SECTIONS = [
  'verificationHubSection',
  'itemManagementSection',
  'lostReportsSection',
  'resolvedTransactionsSection',
];

// ========== SECTION SWITCHING ==========
function showSection(sectionId) {
  try {
    console.log('Switching to section:', sectionId);

    const targetSectionId = sectionId === 'verificationHub' ? 'verificationHubSection' : `${sectionId}Section`;

    document.querySelectorAll('.dashboard-section').forEach(section => {
      section.classList.add('hidden');
      section.style.display = 'none';
    });

    const targetSection = document.getElementById(targetSectionId);
    if (targetSection) {
      targetSection.classList.remove('hidden');
      targetSection.style.display = 'block';
    } else {
      console.warn('Section not found:', targetSectionId);
    }

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.dataset.section === sectionId) link.classList.add('active');
    });
    currentSection = sectionId;

    if (sectionId === 'verificationHub' && targetSection) {
      targetSection.classList.remove('hidden');
      targetSection.style.display = 'block';
    }

    if (sectionId === 'itemManagement') loadItemsTable();
    else if (sectionId === 'lostReports') loadLostReportsTable();
    else if (sectionId === 'resolvedTransactions') loadResolvedTransactionsTable();
    else if (sectionId === 'verificationHub') loadVerificationHub();

    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
  } catch (error) {
    console.error('Error switching section:', error);
  }
}
window.showSection = showSection;

// ========== STATUS FILTER ==========
function addStatusFilterControls() {
  const section = document.getElementById('itemManagementSection');
  if (!section || document.getElementById('statusFilterContainer')) return;

  const filterContainer = document.createElement('div');
  filterContainer.id = 'statusFilterContainer';
  filterContainer.className = 'filter-controls';
  filterContainer.innerHTML = `
    <label for="statusFilterDropdown">Filter by Status:</label>
    <select id="statusFilterDropdown" class="status-filter-select" onchange="changeStatusFilter(this.value)">
      <option value="all">All Items</option>
      <option value="pending">Initial Review</option>
      <option value="approved">Approved</option>
    </select>
  `;

  const description = section.querySelector('.section-description');
  if (description) description.parentNode.insertBefore(filterContainer, description.nextSibling);
}

function changeStatusFilter(status) {
  currentStatusFilter = status;
  loadItemsTable();
}

// ========== ITEMS TABLE ==========
async function loadItemsTable() {
  const tbody = document.getElementById('itemsTableBody');
  if (!tbody || !window.supabaseClient) return;

  tbody.innerHTML = '<tr><td colspan="5" class="no-data">Loading items...</td></tr>';
  addStatusFilterControls();

  try {
    let query = window.supabaseClient
      .from('items')
      .select('*')
      .neq('status', 'claimed')
      .neq('status', 'CLAIMED')
      .order('created_at', { ascending: false });

    if (currentStatusFilter !== 'all') query = query.eq('status', currentStatusFilter);

    const { data: items, error } = await query;
    if (error) throw error;

    console.log(`[loadItemsTable] Rows fetched: ${items?.length ?? 0}`);

    if (!items || items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No items found.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(item => {
      const publicImageUrl = item.image_url ? getSupabasePublicUrl(item.image_url) : '';
      const imageHtml = publicImageUrl
        ? `<img src="${publicImageUrl}" alt="${item.display_name || ''}" class="table-thumbnail"
             onclick="openLightbox('${publicImageUrl}')"
             style="cursor:pointer;max-height:60px;max-width:60px;border-radius:4px;">`
        : '<span class="no-image">No image</span>';

      const truncatedDesc = item.ai_description
        ? item.ai_description.substring(0, 50) + (item.ai_description.length > 50 ? '...' : '')
        : 'N/A';

      return `
        <tr>
          <td>${imageHtml}</td>
          <td>${item.display_name || 'N/A'}</td>
          <td>${truncatedDesc}</td>
          <td><span class="status-badge status-${item.status || 'pending'}">${(item.status || 'pending').toUpperCase()}</span></td>
          <td>
            <button class="btn btn-small"
              data-item-id="${item.id}"
              data-image-url="${publicImageUrl}"
              data-item-name="${item.display_name || ''}"
              data-item-desc="${item.ai_description || ''}"
              data-item-created-at="${item.created_at || ''}"
              data-item-status="${item.status || 'pending'}"
              onclick="handleViewClick(this)">View</button>
          </td>
        </tr>`;
    }).join('');
  } catch (error) {
    console.error('[loadItemsTable] Error:', error);
    tbody.innerHTML = '<tr><td colspan="5" class="error">Error loading items. Please refresh.</td></tr>';
  }
}

// ========== LOST REPORTS TABLE ==========
// FIX: Shows reports where matched_item_id IS NULL (no AI match) AND status is NOT 'resolved'
// This ensures rejected items (cleared matched_item_id, status back to 'pending') appear here
async function loadLostReportsTable() {
  const tbody = document.getElementById('lostReportsTableBody');
  if (!tbody || !window.supabaseClient) return;

  tbody.innerHTML = '<tr><td colspan="5" class="no-data">Loading reports...</td></tr>';

  try {
    const { data, error } = await window.supabaseClient
      .from('lost_reports')
      .select('id, student_name, item_description, last_location, status, created_at, ref_photo_url_1, matched_item_id, match_score')
      .or('matched_item_id.is.null,and(matched_item_id.not.is.null,match_score.lt.70)')
      .neq('status', 'resolved')
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`[loadLostReportsTable] Rows fetched: ${data?.length ?? 0}`);

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No pending lost item reports found.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(report => {
      const reportDate = new Date(report.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const reportPayload = encodeURIComponent(JSON.stringify({
        ...report,
        reportDate,
      }));

      return `
        <tr>
          <td>${report.student_name || 'N/A'}</td>
          <td>${report.item_description
            ? report.item_description.substring(0, 50) + (report.item_description.length > 50 ? '...' : '')
            : 'N/A'}</td>
          <td>${reportDate}</td>
          <td><span class="status-badge status-${report.status || 'pending'}">${(report.status || 'pending').toUpperCase()}</span></td>
          <td>
            <button class="btn btn-small" data-report='${reportPayload}' onclick="handleViewLostItem(this)">View</button>
          </td>
        </tr>`;
    }).join('');
  } catch (error) {
    console.error('[loadLostReportsTable] Error:', error);
    tbody.innerHTML = '<tr><td colspan="5" class="error">Error loading reports. Please refresh.</td></tr>';
  }
}

function getNotificationModalElements(modalKey) {
  const modalId = modalKey === 'claim' ? 'claimVerificationModal' : 'lostReportModal';
  return {
    modal: document.getElementById(modalId),
    panel: document.getElementById(`${modalKey}NotificationPanel`),
    textarea: document.getElementById(`${modalKey}NotificationMessage`),
    sendBtn: document.getElementById(`${modalKey}SendUpdateBtn`),
  };
}

function resetNotificationComposer(modalKey) {
  const { panel, textarea, sendBtn } = getNotificationModalElements(modalKey);

  if (panel) panel.hidden = true;
  if (textarea) {
    textarea.value = '';
    textarea.disabled = false;
  }
  if (sendBtn) {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Update';
  }
}

function toggleNotificationComposer(modalKey) {
  const { panel, textarea } = getNotificationModalElements(modalKey);
  if (!panel) return;

  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    textarea?.focus();
  }
}

async function sendNotificationUpdate(modalKey) {
  const { modal, textarea, sendBtn } = getNotificationModalElements(modalKey);
  const reportId = modal?.dataset?.reportId;
  const studentEmail = modal?.dataset?.studentEmail;
  const studentName = modal?.dataset?.studentName || '';
  const customMessage = textarea?.value?.trim() || '';

  if (!reportId) {
    showAdminToast('Unable to send update: report context is missing.', 'error');
    return;
  }

  if (!studentEmail) {
    showAdminToast('Unable to send update: student email is missing.', 'error');
    return;
  }

  if (!customMessage) {
    showAdminToast('Please type a message before sending the update.', 'error');
    return;
  }

  try {
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }

    if (textarea) textarea.disabled = true;

    const response = await fetch(`/api/items/lost-reports/${reportId}/send-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentEmail,
        studentName,
        customMessage,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to send notification email');
    }

    showAdminToast(payload.message || 'Student update sent successfully.');
    resetNotificationComposer(modalKey);
  } catch (error) {
    console.error('[sendNotificationUpdate] Error:', error);
    showAdminToast('Error sending update: ' + error.message, 'error');
    if (textarea) textarea.disabled = false;
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Update';
    }
  }
}

function ensureLostReportModal() {
  let modal = document.getElementById('lostReportModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'lostReportModal';
  modal.className = 'modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="modal-content modal-box">
      <button class="modal-close" onclick="closeLostReportModal()">&times;</button>
      <div class="modal-header">
        <div>
          <h3 id="lostReportModalTitle">Lost Report Details</h3>
          <p class="modal-subtitle" id="lostReportModalSubtitle"></p>
        </div>
      </div>
      <div class="modal-body">
        <div class="modal-image-wrapper">
          <img id="lostReportModalImage" src="" alt="Reference photo">
        </div>
        <div class="modal-fields">
          <p><strong>Student Name:</strong> <span id="lostReportModalStudentName"></span></p>
          <p><strong>Student Email:</strong> <span id="lostReportModalStudentEmail"></span></p>
          <p><strong>Description:</strong> <span id="lostReportModalDescription"></span></p>
          <p><strong>Date:</strong> <span id="lostReportModalDate"></span></p>
          <p><strong>Location:</strong> <span id="lostReportModalLocation"></span></p>
          <p><strong>Status:</strong> <span id="lostReportModalStatus"></span></p>
          <p><strong>Matched Item ID:</strong> <span id="lostReportModalMatchedItemId"></span></p>
        </div>
      </div>
      <div class="manual-match-panel">
        <h4>Manual Match</h4>
        <p class="manual-match-help">Search a pending item and assign it to this report.</p>
        <div class="manual-match-search-wrap">
          <input
            type="text"
            id="manualMatchSearchInput"
            class="manual-match-search-input"
            placeholder="Type an item name to search..."
            autocomplete="off"
          >
          <div id="manualMatchResults" class="manual-match-results" hidden></div>
        </div>
        <div id="manualMatchSelection" class="manual-match-selection" hidden>
          <img id="manualMatchThumbnail" class="manual-match-thumbnail" src="" alt="Selected item thumbnail">
          <div class="manual-match-selection-text">
            <p><strong>ID:</strong> <span id="manualMatchSelectedId"></span></p>
            <p><strong>Name:</strong> <span id="manualMatchSelectedName"></span></p>
          </div>
        </div>
      </div>
      <div id="lostNotificationPanel" class="notification-panel" hidden>
        <div class="notification-panel-header">
          <h4>Send Email Update</h4>
          <p>Send a note to the student without changing the report status.</p>
        </div>
        <textarea id="lostNotificationMessage" class="modal-textarea notification-textarea" rows="5" placeholder="Type your message to the student here..."></textarea>
        <div class="notification-panel-actions">
          <button class="btn btn-secondary" type="button" onclick="toggleNotificationComposer('lost')">Cancel</button>
          <button class="btn btn-blue btn-notify" type="button" id="lostSendUpdateBtn" onclick="sendNotificationUpdate('lost')">Send Update</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeLostReportModal()">Close</button>
        <button class="btn btn-blue btn-notify" onclick="toggleNotificationComposer('lost')">Notify Student</button>
        <button class="btn btn-green" id="assignMatchBtn" onclick="assignManualMatch()" disabled>Assign Match</button>
      </div>
    </div>`;

  modal.addEventListener('click', event => {
    if (event.target === modal) closeLostReportModal();
  });

  document.body.appendChild(modal);
  bindManualMatchControls();
  return modal;
}

function bindManualMatchControls() {
  const input = document.getElementById('manualMatchSearchInput');
  if (input && input.dataset.bound !== 'true') {
    input.addEventListener('input', handleManualMatchSearchInput);
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') hideManualMatchResults();
    });
    input.dataset.bound = 'true';
  }
}

function resetManualMatchState() {
  currentManualMatchItem = null;
  const resultsEl = document.getElementById('manualMatchResults');
  const selectionEl = document.getElementById('manualMatchSelection');
  const assignBtn = document.getElementById('assignMatchBtn');
  const input = document.getElementById('manualMatchSearchInput');
  const selectedIdEl = document.getElementById('manualMatchSelectedId');
  const selectedNameEl = document.getElementById('manualMatchSelectedName');
  const thumbnailEl = document.getElementById('manualMatchThumbnail');

  if (input) input.value = '';
  if (resultsEl) {
    resultsEl.innerHTML = '';
    resultsEl.hidden = true;
  }
  if (selectionEl) selectionEl.hidden = true;
  if (assignBtn) assignBtn.disabled = true;
  if (selectedIdEl) selectedIdEl.textContent = '';
  if (selectedNameEl) selectedNameEl.textContent = '';
  if (thumbnailEl) {
    thumbnailEl.src = FALLBACK_ITEM_IMAGE;
    thumbnailEl.alt = 'Selected item thumbnail';
  }
}

function hideManualMatchResults() {
  const resultsEl = document.getElementById('manualMatchResults');
  if (resultsEl) resultsEl.hidden = true;
}

async function handleManualMatchSearchInput(event) {
  const query = (event.target.value || '').trim();
  currentManualMatchItem = null;

  const assignBtn = document.getElementById('assignMatchBtn');
  const selectionEl = document.getElementById('manualMatchSelection');
  const selectedIdEl = document.getElementById('manualMatchSelectedId');
  const selectedNameEl = document.getElementById('manualMatchSelectedName');

  if (assignBtn) assignBtn.disabled = true;
  if (selectionEl) selectionEl.hidden = true;
  if (selectedIdEl) selectedIdEl.textContent = '';
  if (selectedNameEl) selectedNameEl.textContent = '';

  clearTimeout(manualMatchSearchTimer);

  if (query.length < 2) {
    hideManualMatchResults();
    const resultsEl = document.getElementById('manualMatchResults');
    if (resultsEl) resultsEl.innerHTML = '';
    return;
  }

  manualMatchSearchTimer = setTimeout(async () => {
    await searchManualMatchItems(query);
  }, 250);
}

async function searchManualMatchItems(query) {
  if (!window.supabaseClient) return;

  const resultsEl = document.getElementById('manualMatchResults');
  if (!resultsEl) return;

  resultsEl.hidden = false;
  resultsEl.innerHTML = '<div class="manual-match-empty">Searching items...</div>';

  try {
    const { data, error } = await window.supabaseClient
      .from('items')
      .select('id, display_name, image_url, status')
      .eq('status', 'approved')
      .ilike('display_name', `%${query}%`)
      .order('created_at', { ascending: false })
      .limit(6);

    if (error) throw error;

    if (!data || data.length === 0) {
      resultsEl.innerHTML = '<div class="manual-match-empty">No pending items found.</div>';
      return;
    }

    resultsEl.innerHTML = data.map(item => {
      const itemImageUrl = item.image_url ? getSupabasePublicUrl(item.image_url) : FALLBACK_ITEM_IMAGE;
      const safeItemName = String(item.display_name || 'Unknown Item').replace(/'/g, "\\'");
      const safeImageUrl = String(itemImageUrl).replace(/'/g, "\\'");
      const safeDescription = String(item.ai_description || 'No AI description available').replace(/'/g, "\\'");

      return `
        <button type="button" class="manual-match-result" onclick="selectManualMatchItem('${item.id}', '${safeItemName}', '${safeImageUrl}', '${safeDescription}')">
          <img src="${itemImageUrl}" alt="${item.display_name || 'Item'}" class="manual-match-result-thumb">
          <div class="manual-match-result-text">
            <strong>${item.display_name || 'Unknown Item'}</strong>
            <span>${item.ai_description || 'No AI description available'}</span>
            <span>ID: ${item.id}</span>
          </div>
        </button>`;
    }).join('');
  } catch (error) {
    console.error('[searchManualMatchItems] Error:', error);
    resultsEl.innerHTML = '<div class="manual-match-empty">Error searching items.</div>';
  }
}

function selectManualMatchItem(itemId, itemName, imageUrl, itemDescription) {
  currentManualMatchItem = { id: itemId, name: itemName, imageUrl, itemDescription };

  const resultsEl = document.getElementById('manualMatchResults');
  const selectionEl = document.getElementById('manualMatchSelection');
  const selectedIdEl = document.getElementById('manualMatchSelectedId');
  const selectedNameEl = document.getElementById('manualMatchSelectedName');
  const thumbnailEl = document.getElementById('manualMatchThumbnail');
  const assignBtn = document.getElementById('assignMatchBtn');
  const input = document.getElementById('manualMatchSearchInput');

  if (selectedIdEl) selectedIdEl.textContent = itemId || 'N/A';
  if (selectedNameEl) selectedNameEl.textContent = itemName || 'Unknown Item';
  if (thumbnailEl) {
    thumbnailEl.src = imageUrl || FALLBACK_ITEM_IMAGE;
    thumbnailEl.alt = itemName || 'Selected item';
    thumbnailEl.style.cursor = 'zoom-in';
    thumbnailEl.onclick = () => openImageModal(imageUrl || FALLBACK_ITEM_IMAGE, itemName || 'Selected item');
  }
  if (selectionEl) selectionEl.hidden = false;
  if (assignBtn) assignBtn.disabled = false;
  if (resultsEl) resultsEl.hidden = true;
  if (input) input.value = itemName || '';
}

async function assignManualMatch() {
  if (!window.supabaseClient || !currentManualMatchReport || !currentManualMatchItem) return;

  const assignBtn = document.getElementById('assignMatchBtn');

  try {
    if (assignBtn) {
      assignBtn.disabled = true;
      assignBtn.textContent = 'Linking...';
    }

    const [reportUpdate, itemUpdate] = await Promise.all([
      window.supabaseClient
        .from('lost_reports')
        .update({
          matched_item_id: currentManualMatchItem.id,
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          released_by: currentAdminName,
        })
        .eq('id', currentManualMatchReport.id),
      window.supabaseClient
        .from('items')
        .update({ status: 'claimed' })
        .eq('id', currentManualMatchItem.id),
    ]);

    if (reportUpdate.error) throw reportUpdate.error;
    if (itemUpdate.error) throw itemUpdate.error;

    showAdminToast('Link & Resolve completed successfully.');
    await updateDashboardStats();
    await loadResolvedTransactionsTable();
    await loadLostReportsTable();
    await loadItemsTable();
    closeLostReportModal();
  } catch (error) {
    console.error('[assignManualMatch] Error:', error);
    showAdminToast('Error assigning manual match: ' + error.message, 'error');
  } finally {
    if (assignBtn) assignBtn.textContent = 'Link & Resolve';
  }
}

async function openLostReportModal(report) {
  const modal = ensureLostReportModal();
  // If report is minimal, fetch full record (including student_email) by id
  if (report && report.id && window.supabaseClient) {
    try {
      const { data: fresh, error: fetchErr } = await window.supabaseClient
        .from('lost_reports')
        .select('student_email, student_name')
        .eq('id', report.id)
        .single();

      if (!fetchErr && fresh) {
        report.student_email = fresh.student_email;
        report.student_name = fresh.student_name || report.student_name;
      } else if (fetchErr) {
        console.warn('[openLostReportModal] Could not fetch fresh report data:', fetchErr.message || fetchErr);
      }
    } catch (err) {
      console.warn('[openLostReportModal] Exception fetching report:', err);
    }
  }

  const reportDate = report.reportDate || new Date(report.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const title = document.getElementById('lostReportModalTitle');
  const subtitle = document.getElementById('lostReportModalSubtitle');
  const image = document.getElementById('lostReportModalImage');

  if (title) title.textContent = report.student_name || 'Lost Report';
  if (subtitle) subtitle.textContent = `Submitted on ${reportDate}`;
  if (image) {
    const refImageUrl = report.ref_photo_url_1 ? getSupabasePublicUrl(report.ref_photo_url_1) : '';
    image.src = refImageUrl || FALLBACK_ITEM_IMAGE;
    image.alt = `${report.student_name || 'Student'} reference photo`;
    image.onerror = () => {
      image.onerror = null;
      image.src = FALLBACK_ITEM_IMAGE;
    };
  }

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value || 'N/A';
  };

  setText('lostReportModalStudentName', report.student_name);
  setText('lostReportModalStudentEmail', report.student_email || 'N/A');
  setText('lostReportModalDescription', report.item_description || 'N/A');
  setText('lostReportModalDate', reportDate);
  setText('lostReportModalLocation', report.last_location || 'Not specified');
  setText('lostReportModalStatus', (report.status || 'pending').toUpperCase());
  setText('lostReportModalMatchedItemId', report.matched_item_id || 'None');

  // store for Send Update flow
  modal.dataset.reportId = report.id || '';
  modal.dataset.studentEmail = report.student_email || '';
  modal.dataset.studentName = report.student_name || '';
  // also expose globally for quick inspection
  window.currentReportEmail = report.student_email || '';
  console.log('Current Report Email:', window.currentReportEmail);

  currentManualMatchReport = report;
  resetManualMatchState();
  resetNotificationComposer('lost');
  bindManualMatchControls();

  modal.style.display = 'flex';
}

function closeLostReportModal() {
  const modal = document.getElementById('lostReportModal');
  if (modal) modal.style.display = 'none';
  resetNotificationComposer('lost');
  currentManualMatchReport = null;
  currentManualMatchItem = null;
}

// ========== DASHBOARD STATS ==========
async function updateDashboardStats() {
  if (!window.supabaseClient) return;

  try {
    const [
      { count: totalItems },
      { count: pendingReports },
      { count: resolvedReports },
    ] = await Promise.all([
      window.supabaseClient
        .from('items')
        .select('*', { count: 'exact', head: true }),
      window.supabaseClient
        .from('lost_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      window.supabaseClient
        .from('lost_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'resolved'),
    ]);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
    set('totalItems', totalItems);
    set('pendingReports', pendingReports);
    set('matchedReports', resolvedReports);

    console.log('[updateDashboardStats]', { totalItems, pendingReports, resolvedReports });
  } catch (error) {
    console.error('[updateDashboardStats] Error:', error);
  }
}

async function fetchDashboardStats() {
  return updateDashboardStats();
}

// ========== RESOLVED TRANSACTIONS TABLE ==========
async function loadResolvedTransactionsTable() {
  const tbody = document.getElementById('resolvedTransactionsTableBody');
  if (!tbody || !window.supabaseClient) return;

  tbody.innerHTML = '<tr><td colspan="6" class="no-data">Loading resolved transactions...</td></tr>';

  try {
    const { data: reports, error: reportsError } = await window.supabaseClient
      .from('lost_reports')
      .select('id, student_name, created_at, resolved_at, released_by, matched_item_id')
      .eq('status', 'resolved')
      .order('resolved_at', { ascending: false });

    if (reportsError) throw reportsError;

    if (!reports || reports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="no-data">No resolved transactions found.</td></tr>';
      return;
    }

    const itemIds = [...new Set(reports.map(r => r.matched_item_id).filter(Boolean))];

    let itemsMap = {};
    if (itemIds.length > 0) {
      const { data: itemsData, error: itemsError } = await window.supabaseClient
        .from('items')
        .select('id, display_name, image_url')
        .in('id', itemIds);

      if (itemsError) throw itemsError;

      itemsData?.forEach(item => {
        itemsMap[item.id] = item;
      });
    }

    const rows = reports.map(report => {
      const matchedItem = report.matched_item_id ? itemsMap[report.matched_item_id] : null;

      const rawUrl = matchedItem?.image_url;
      const itemImageUrl = rawUrl ? getSupabasePublicUrl(rawUrl) : FALLBACK_ITEM_IMAGE;
      const safeItemImageUrl = String(itemImageUrl).replace(/'/g, "\\'");
      const safeItemName = String(matchedItem?.display_name || 'Unknown Item').replace(/'/g, "\\'");

      const dateReported = report.created_at
        ? new Date(report.created_at).toLocaleDateString()
        : 'N/A';
      const dateClaimed = report.resolved_at
        ? new Date(report.resolved_at).toLocaleDateString()
        : 'N/A';

      return `
        <tr>
          <td><strong>${report.student_name || 'N/A'}</strong></td>
          <td>${matchedItem?.display_name || 'Unknown Item'}</td>
          <td>
            <button type="button" class="resolved-image-btn" onclick="openImageModal('${safeItemImageUrl}', '${safeItemName}')" style="cursor:pointer; border:none; background:none;">
              <img src="${itemImageUrl}" alt="Item" class="resolved-item-thumbnail" style="width:50px; height:50px; object-fit:cover; border-radius:5px;">
            </button>
          </td>
          <td>${dateReported}</td>
          <td>${dateClaimed}</td>
          <td>${report.released_by || 'N/A'}</td>
        </tr>`;
    });

    tbody.innerHTML = rows.join('');
    console.log(`[loadResolvedTransactionsTable] Success: ${rows.length} rows rendered.`);
  } catch (err) {
    console.error('[loadResolvedTransactionsTable] Error:', err);
    tbody.innerHTML = '<tr><td colspan="6" class="error">Error loading data. Check console.</td></tr>';
  }
}

// ========== VERIFICATION HUB ==========
async function loadVerificationHub() {
  if (!window.supabaseClient || !verificationContainer) return;

  try {
    // Select only EXISTING columns from lost_reports
    // Remove time_captured and date_proximity - they don't exist in this table
    const { data: reports, error } = await window.supabaseClient
      .from('lost_reports')
      .select('id, student_name, student_email, item_description, last_location, status, created_at, matched_item_id, match_score, ref_photo_url_1')
      .eq('status', 'pending')
      .not('matched_item_id', 'is', null)
      .gte('match_score', 70)
      .order('match_score', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`[loadVerificationHub] Rows fetched: ${reports?.length ?? 0}`);

    if (!reports || reports.length === 0) {
      verificationContainer.innerHTML = '<p class="no-data">No reports to verify.</p>';
      return;
    }

    // Collect item IDs and fetch them in one query to get items.created_at (time_captured)
    const itemIds = [...new Set(reports.map(r => r.matched_item_id).filter(Boolean))];
    let itemsMap = {};

    if (itemIds.length > 0) {
      const { data: itemsData, error: itemsError } = await window.supabaseClient
        .from('items')
        .select('id, display_name, name, image_url, status, created_at')
        .in('id', itemIds);

      if (itemsError) throw itemsError;
      itemsData?.forEach(item => { itemsMap[item.id] = item; });
    }

    // Helper function to calculate date proximity
    // Compares when item was found (items.created_at) vs when student reported it lost (lost_reports.created_at)
    const calculateDateProximity = (itemCreatedAt, reportCreatedAt) => {
      if (!itemCreatedAt || !reportCreatedAt) return null;

      const itemTime = new Date(itemCreatedAt).getTime();
      const reportTime = new Date(reportCreatedAt).getTime();
      const diffMs = itemTime - reportTime;
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffMs < 0) {
        // Item found BEFORE report
        const absDiffHours = Math.abs(diffHours);
        const absDiffDays = Math.abs(diffDays);
        if (absDiffHours < 1) {
          return 'Found before reported loss (within 1 hour)';
        } else if (absDiffHours < 24) {
          return `Found ${absDiffHours} hour(s) before reported loss`;
        } else {
          return `Found ${absDiffDays} day(s) before reported loss`;
        }
      } else {
        // Item found AFTER or SAME TIME as report
        if (diffHours < 1) {
          return 'Found within 1 hour of reported loss';
        } else if (diffHours < 24) {
          return `Found ${diffHours} hour(s) after reported loss`;
        } else {
          return `Found ${diffDays} day(s) after reported loss`;
        }
      }
    };

    const cards = reports.map(report => {
      const matchedItem = report.matched_item_id ? itemsMap[report.matched_item_id] : null;

      // Only show cards where the matched item is approved (ready to be claimed)
      if (matchedItem && matchedItem.status && matchedItem.status !== 'approved') return null;

      // Validate email presence
      if (!report.student_email) {
        console.warn(`[loadVerificationHub] Report ${report.id} missing student_email. Skipping card.`);
        showAdminToast(`Report ${report.student_name || 'Unknown'} missing email. Cannot send notifications.`, 'error');
        return null;
      }

      const itemImgUrl = matchedItem?.image_url ? getSupabasePublicUrl(matchedItem.image_url) : '';
      const refImgUrl = report.ref_photo_url_1 ? getSupabasePublicUrl(report.ref_photo_url_1) : '';
      
      // Use matchedItem.created_at as time_captured (when the item was found/added to system)
      const timeCapturedValue = matchedItem?.created_at || new Date().toISOString();
      const timeCaptured = new Date(timeCapturedValue).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      // Calculate date_proximity: compare when item was found vs when loss was reported
      const dateProximity = calculateDateProximity(matchedItem?.created_at, report.created_at);

      return `
        <div class="verification-card card clean-light-card" data-report-id="${report.id}" data-student-email="${report.student_email}" data-student-name="${(report.student_name || '').replace(/"/g, '&quot;')}">
          <div class="verification-header">
            <div class="header-info">
              <h3>${report.student_name || 'Unknown'}</h3>
              <span class="status-badge status-${report.status}">${report.status.toUpperCase()}</span>
            </div>
            <div class="match-score-badge">
              <span class="match-score-value">${report.match_score ?? 0}%</span>
              <span class="match-score-label">Match</span>
            </div>
          </div>
          
          <div class="verification-body">
            <div class="verification-images">
              <div class="image-section">
                <h4>Student Reference Photo</h4>
                ${refImgUrl ? `<img src="${refImgUrl}" alt="Reference" onclick="openLightbox('${refImgUrl}')" class="verification-image">` : '<p class="no-image">No image provided</p>'}
              </div>
              <div class="verification-vs-badge" aria-hidden="true">VS</div>
              <div class="image-section">
                <h4>Office Item Image</h4>
                ${itemImgUrl ? `<img src="${itemImgUrl}" alt="Item" onclick="openLightbox('${itemImgUrl}')" class="verification-image">` : '<p class="no-image">No matched item</p>'}
              </div>
            </div>
            
            <div class="verification-details">
              <p><strong>Student Email:</strong> <span class="student-email">${report.student_email}</span></p>
              <p><strong>Item Description:</strong> ${report.item_description || 'N/A'}</p>
              <p><strong>Location Lost:</strong> ${report.last_location || 'Not specified'}</p>
              
              <div class="temporal-info-section">
                <div class="temporal-info-row">
                  <strong>📅 Time Captured:</strong> 
                  <span class="temporal-value">${timeCaptured}</span>
                </div>
                ${dateProximity ? `<div class="temporal-info-row">
                  <strong>⏱️ Date Proximity:</strong> 
                  <span class="temporal-value date-proximity">${dateProximity}</span>
                </div>` : ''}
              </div>
              
              ${matchedItem ? `<p><strong>Matched Item:</strong> ${matchedItem.display_name || matchedItem.name || 'N/A'}</p>` : ''}
            </div>
          </div>
          
          <div class="verification-notification-panel" hidden>
            <div class="notification-panel-header">
              <h4>Send Email Update</h4>
              <p>Send a message to the student without changing the match status.</p>
            </div>
            <textarea class="modal-textarea notification-textarea verification-notification-message" rows="5" placeholder="Type your message to the student here..."></textarea>
            <div class="notification-panel-actions">
              <button class="btn btn-secondary" type="button" onclick="toggleVerificationNotificationPanel(this)">Cancel</button>
              <button class="btn btn-blue btn-notify" type="button" onclick="sendVerificationNotification(this)">Send Update</button>
            </div>
          </div>
          
          <div class="verification-actions">
            <button class="btn btn-green" onclick="approveMatch('${report.id}', '${report.matched_item_id || ''}', this)">✓ Approve Match</button>
            <button class="btn btn-blue btn-notify" onclick="toggleVerificationNotificationPanel(this)">📧 Notify Student</button>
            <button class="btn btn-red" onclick="rejectMatch('${report.id}', this)">✗ Reject Match</button>
          </div>
        </div>`;
    });

    const filteredCards = cards.filter(c => c !== null);
    verificationContainer.innerHTML = filteredCards.length > 0
      ? filteredCards.join('')
      : '<p class="no-data">No reports to verify.</p>';
  } catch (error) {
    console.error('[loadVerificationHub] Error:', error);
    verificationContainer.innerHTML = '<p class="error">Error loading reports. Please refresh.</p>';
  }
}

// ========== VERIFICATION NOTIFICATION HANDLERS ==========
function toggleVerificationNotificationPanel(triggerBtn) {
  const card = triggerBtn.closest('.verification-card');
  if (!card) return;

  const panel = card.querySelector('.verification-notification-panel');
  const textarea = card.querySelector('.verification-notification-message');

  if (!panel) return;

  panel.hidden = !panel.hidden;
  if (!panel.hidden && textarea) {
    textarea.focus();
  }
}

async function sendVerificationNotification(sendBtn) {
  const card = sendBtn.closest('.verification-card');
  if (!card) return;

  const reportId = card.dataset.reportId;
  const studentEmail = card.dataset.studentEmail;
  const studentName = card.dataset.studentName || '';
  const textarea = card.querySelector('.verification-notification-message');
  const customMessage = textarea?.value?.trim() || '';

  if (!reportId || !studentEmail) {
    showAdminToast('Unable to send: missing report or email data.', 'error');
    return;
  }

  if (!customMessage) {
    showAdminToast('Please type a message before sending the update.', 'error');
    return;
  }

  try {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    if (textarea) textarea.disabled = true;

    const response = await fetch(`/api/items/lost-reports/${reportId}/send-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentEmail, studentName, customMessage }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to send notification email');
    }

    showAdminToast(payload.message || 'Student update sent successfully.');
    const panel = card.querySelector('.verification-notification-panel');
    if (panel) {
      panel.hidden = true;
      if (textarea) textarea.value = '';
    }
  } catch (error) {
    console.error('[sendVerificationNotification] Error:', error);
    showAdminToast('Error sending update: ' + error.message, 'error');
    if (textarea) textarea.disabled = false;
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Update';
  }
}

// ========== MATCH APPROVAL ==========
// FIX: Sets lost_reports.status = 'resolved' (not 'matched') and items.status = 'claimed'
//      resolved_at timestamp is set so Resolved Transactions table shows the claimed date
async function approveMatch(reportId, itemId, triggerButton = null) {
  if (!window.supabaseClient) return;

  const resolvedItemId = itemId || await resolveMatchedItemId(reportId);
  if (!resolvedItemId) {
    showAdminToast('Unable to approve: matched item not found.', 'error');
    return;
  }

  try {
    setVerificationActionLoading(triggerButton, true, 'Approving...');

    // Step 1: Mark the lost_report as 'resolved' with a timestamp
    const { error: reportError } = await window.supabaseClient
      .from('lost_reports')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        released_by: currentAdminName,
      })
      .eq('id', reportId);

    if (reportError) throw reportError;

    // Step 2: Mark the matched item as 'claimed'
    const { error: itemError } = await window.supabaseClient
      .from('items')
      .update({ status: 'claimed' })
      .eq('id', resolvedItemId);

    if (itemError) throw itemError;

    // Step 3: Refresh all views
    await updateDashboardStats();
    await loadVerificationHub();
    await loadResolvedTransactionsTable();
    await loadLostReportsTable();

    showAdminToast('Match Approved! Item marked as claimed.');
  } catch (error) {
    console.error('[approveMatch] Error:', error);
    showAdminToast('Error approving match: ' + error.message, 'error');
  } finally {
    setVerificationActionLoading(triggerButton, false);
  }
}

// ========== MATCH REJECTION ==========
// FIX: Clears matched_item_id and match_score, sets status back to 'pending'
//      This causes the report to reappear in Lost Reports (matched_item_id IS NULL + not resolved)
async function rejectMatch(reportId, triggerButton = null) {
  if (!window.supabaseClient) return;

  try {
    setVerificationActionLoading(triggerButton, true, 'Rejecting...');

    const { error } = await window.supabaseClient
      .from('lost_reports')
      .update({
        matched_item_id: null,
        match_score: 0,
        status: 'pending',
      })
      .eq('id', reportId);

    if (error) throw error;

    // Refresh all views
    await updateDashboardStats();
    await loadVerificationHub();
    await loadResolvedTransactionsTable();
    await loadLostReportsTable();

    showAdminToast('Match rejected. Report returned to Lost Items.');
  } catch (error) {
    console.error('[rejectMatch] Error:', error);
    showAdminToast('Error rejecting match: ' + error.message, 'error');
  } finally {
    setVerificationActionLoading(triggerButton, false);
  }
}

// ========== LEGACY CLAIM HANDLERS (kept for compatibility) ==========
async function approveClaim(reportId, itemId) {
  try {
    await approveMatch(reportId, itemId);
    closeClaimVerificationModal();
  } catch (error) {
    console.error('[approveClaim] Error:', error);
    alert('Failed to approve claim: ' + error.message);
  }
}

async function rejectClaim(reportId) {
  try {
    await rejectMatch(reportId);
    closeClaimVerificationModal();
  } catch (error) {
    console.error('[rejectClaim] Error:', error);
    alert('Failed to reject claim: ' + error.message);
  }
}

async function resolveMatchedItemId(reportId) {
  const { data, error } = await window.supabaseClient
    .from('lost_reports')
    .select('matched_item_id')
    .eq('id', reportId)
    .single();

  if (error) throw error;
  return data?.matched_item_id || null;
}

async function refreshMatchViews() {
  await Promise.all([
    loadItemsTable(),
    loadLostReportsTable(),
    loadVerificationHub(),
    loadResolvedTransactionsTable(),
    fetchDashboardStats(),
  ]);
}

// ========== SUPABASE URL HELPER ==========
function getSupabasePublicUrl(imagePath) {
  if (!imagePath) return '';
  if (imagePath.startsWith('http')) return imagePath;

  const supabaseUrl = window.SUPABASE_URL || '';
  const match = supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/);
  const projectId = match ? match[1] : 'unknown-project';

  return `https://${projectId}.supabase.co/storage/v1/object/public/items/${imagePath}`;
}

// ========== ITEM ACTION MODAL ==========
function handleViewClick(button) {
  openItemActionModal(
    button.dataset.itemId,
    button.dataset.imageUrl,
    button.dataset.itemName,
    button.dataset.itemDesc,
    button.dataset.itemStatus,
    button.dataset.itemCreatedAt
  );
}

function formatCaptureTimestamp(createdAt) {
  if (!createdAt) return '';

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  const datePart = date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${datePart} - ${timePart}`;
}

function openItemActionModal(itemId, imageUrl, itemName, aiDescription, currentStatus, createdAt) {
  currentItemId = itemId;
  const modal = document.getElementById('itemActionModal');
  if (!modal) return;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };

  setText('modalTitle', 'Review Item: ' + itemName);
  setText('modalItemStatus', 'Status: ' + (currentStatus || 'pending').toUpperCase());
  setText('modalCaptureTime', formatCaptureTimestamp(createdAt));
  document.getElementById('modalItemImage').src = imageUrl || '';

  const nameEl = document.getElementById('modalItemName');
  if (nameEl) {
    nameEl.value = itemName || '';
    nameEl.disabled = false;
    nameEl.readOnly = false;
  }

  const descEl = document.getElementById('modalItemDescription');
  if (descEl) {
    descEl.value = aiDescription || '';
    descEl.disabled = false;
    descEl.readOnly = false;
  }

  const dropdown = document.getElementById('itemStatusDropdown');
  if (dropdown) dropdown.value = currentStatus || 'pending';

  const deleteBtn = document.getElementById('modalDeleteBtn');
  if (deleteBtn) {
    deleteBtn.disabled = false;
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Item';
  }

  modal.style.display = 'flex';
}

function closeItemActionModal() {
  const modal = document.getElementById('itemActionModal');
  if (modal) modal.style.display = 'none';
  currentItemId = null;
}

async function updateItemStatus() {
  if (!currentItemId || !window.supabaseClient) return;

  const dropdown = document.getElementById('itemStatusDropdown');
  const newStatus = dropdown?.value || 'pending';
  const nameEl = document.getElementById('modalItemName');
  const descEl = document.getElementById('modalItemDescription');

  const updatedDisplayName = (nameEl?.value || '').trim();
  const updatedDescription = descEl?.value || '';

  try {
    const { error } = await window.supabaseClient
      .from('items')
      .update({
        status: newStatus,
        display_name: updatedDisplayName,
        ai_description: updatedDescription,
      })
      .eq('id', currentItemId);

    if (error) throw error;

    showAdminToast('Item changes saved successfully.');
    await loadItemsTable();
    closeItemActionModal();
  } catch (error) {
    console.error('[updateItemStatus] Error:', error);
    showAdminToast('Error updating item: ' + error.message, 'error');
  }
}

async function deleteItem() {
  if (!currentItemId || !window.supabaseClient) return;

  const confirmed = confirm('Are you sure you want to permanently delete this item?');
  if (!confirmed) return;

  const deleteBtn = document.getElementById('modalDeleteBtn');
  const itemIdToDelete = currentItemId;

  try {
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Deleting...';
    }

    const { error } = await window.supabaseClient
      .from('items').delete().eq('id', itemIdToDelete);
    if (error) throw error;

    showAdminToast('Item deleted successfully!');
    currentItemId = null;
    await loadItemsTable();
    closeItemActionModal();
  } catch (error) {
    console.error('[deleteItem] Error:', error);
    showAdminToast('Error deleting item: ' + error.message, 'error');
  } finally {
    if (deleteBtn) {
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Delete Item';
    }
  }
}

// ========== CLAIM VERIFICATION MODAL ==========
function openClaimVerificationModal(reportId, itemId, matchScore, studentEmail, itemImageUrl = '', studentImageUrl = '', studentName = '') {
  const modal = document.getElementById('claimVerificationModal');
  if (!modal) return;

  modal.dataset.reportId = reportId;
  modal.dataset.itemId = itemId;
  modal.dataset.studentEmail = studentEmail || '';
  modal.dataset.studentName = studentName || '';

  const title = document.getElementById('claimVerificationTitle');
  if (title) title.textContent = `Verify Claim — Match Score: ${matchScore}%`;

  const nameDisplay = document.getElementById('claimStudentName');
  if (nameDisplay) nameDisplay.textContent = studentName || 'N/A';

  const emailDisplay = document.getElementById('claimStudentEmail');
  if (emailDisplay) emailDisplay.textContent = studentEmail || 'N/A';

  const itemImageEl = document.getElementById('claimItemImage');
  if (itemImageEl) {
    itemImageEl.src = itemImageUrl || FALLBACK_ITEM_IMAGE;
    itemImageEl.onerror = () => { itemImageEl.onerror = null; itemImageEl.src = FALLBACK_ITEM_IMAGE; };
  }

  const studentImageEl = document.getElementById('claimStudentImage');
  if (studentImageEl) {
    studentImageEl.src = studentImageUrl || FALLBACK_ITEM_IMAGE;
    studentImageEl.onerror = () => { studentImageEl.onerror = null; studentImageEl.src = FALLBACK_ITEM_IMAGE; };
  }

  resetNotificationComposer('claim');

  modal.style.display = 'flex';
}

function closeClaimVerificationModal() {
  const modal = document.getElementById('claimVerificationModal');
  if (modal) modal.style.display = 'none';
  resetNotificationComposer('claim');
}

// ========== LIGHTBOX ==========
function openLightbox(imageSrc) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  if (lightbox && img) { img.src = imageSrc; lightbox.style.display = 'flex'; }
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) lightbox.style.display = 'none';
}

function openImageModal(imageSrc, altText = 'Image preview') {
  const modal = document.getElementById('imageModal');
  const image = document.getElementById('img01');
  if (!modal || !image) return;

  image.src = imageSrc || FALLBACK_ITEM_IMAGE;
  image.alt = altText;
  modal.style.display = 'flex';
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  if (modal) modal.style.display = 'none';
}

// ========== PROFILE LOADING ==========
async function loadUserProfile() {
  if (!window.supabaseClient) return;

  try {
    const { data } = await window.supabaseClient.auth.getSession();
    const session = data?.session;
    if (!session?.user?.id) return;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
    currentAdminName = session.user.user_metadata?.full_name || session.user.email || 'Admin';
    window.currentAdminName = currentAdminName;
    set('userName', currentAdminName);
    set('userEmail', session.user.email || '');
    set('userRole', 'Administrator');

    if (typeof getProfile === 'function') {
      const profile = await getProfile(session.user.id);
      if (profile) {
        currentAdminName = profile.full_name || session.user.user_metadata?.full_name || session.user.email || 'Admin';
        window.currentAdminName = currentAdminName;
        set('userName', currentAdminName);
        set('userEmail', profile.email || session.user.email || '');
      }
    }
  } catch (error) {
    console.error('[loadUserProfile] Error:', error);
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

// ========== SIDEBAR ==========
function toggleSidebar() {
  if (window.innerWidth > 768) {
    closeSidebar();
    return;
  }

  sidebar?.classList.toggle('open');
  sidebarOverlay?.classList.toggle('active');
}

function closeSidebar() {
  sidebar?.classList.remove('open');
  sidebarOverlay?.classList.remove('active');
}

function syncSidebarOverlayState() {
  if (window.innerWidth > 768) {
    sidebarOverlay?.classList.remove('active');
    sidebar?.classList.remove('open');
  }
}

function bindSidebarNavigation() {
  document.querySelectorAll('.sidebar-nav .nav-link[data-section]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const sectionId = link.dataset.section;
      if (sectionId) showSection(sectionId);
    });
  });
}

// ========== PAGE INIT ==========
function initPage() {
  logoutBtn?.addEventListener('click', handleLogout);
  hamburgerBtn?.addEventListener('click', toggleSidebar);
  sidebarClose?.addEventListener('click', closeSidebar);
  sidebarOverlay?.addEventListener('click', closeSidebar);
  refreshBtn?.addEventListener('click', async () => {
    await updateDashboardStats();
    await loadVerificationHub();
  });

  bindSidebarNavigation();
  syncSidebarOverlayState();
  window.addEventListener('resize', syncSidebarOverlayState, { passive: true });

  const lightbox = document.getElementById('lightbox');
  lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

  const imageModal = document.getElementById('imageModal');
  imageModal?.addEventListener('click', e => {
    if (e.target === imageModal) closeImageModal();
  });
}

// ========== DOM CONTENT LOADED ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('=== Admin Dashboard DOMContentLoaded ===');

  try {
    logoutBtn             = document.getElementById('logoutBtn');
    hamburgerBtn          = document.getElementById('hamburgerBtn');
    sidebarOverlay        = document.getElementById('sidebarOverlay');
    sidebar               = document.getElementById('sidebar');
    sidebarClose          = document.getElementById('sidebarClose');
    refreshBtn            = document.getElementById('refreshBtn');
    verificationContainer = document.getElementById('verificationContainer');

    if (typeof checkAuthAndRedirect === 'function') await checkAuthAndRedirect();
    await loadUserProfile();
    initPage();
    showSection('verificationHub');
    await updateDashboardStats();   // single unified stats call
    await loadVerificationHub();
    await loadSettings();

    console.log('=== Admin Dashboard Initialization Complete ===');
  } catch (error) {
    console.error('[DOMContentLoaded] Fatal error:', error);
  }
});

// ========== SETTINGS & PROFILE ==========

async function loadSettings() {
  try {
    const { data: authData } = await window.supabaseClient.auth.getUser();
    const userId = authData?.user?.id;

    if (!userId) {
      console.warn('[loadSettings] No authenticated user');
      return;
    }

    // Fetch admin profile from profiles table (RLS-protected)
    const { data: profile, error } = await window.supabaseClient
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[loadSettings] Error fetching profile:', error);
      return;
    }

    console.log('[loadSettings] Profile loaded:', { full_name: profile?.full_name, email: profile?.email, role: profile?.role });

    // Populate form fields
    const fullNameInput = document.getElementById('settingsFullName');
    const emailInput = document.getElementById('settingsEmail');
    const roleInput = document.getElementById('settingsRole');

    if (fullNameInput) fullNameInput.value = profile?.full_name || '';
    if (emailInput) emailInput.value = profile?.email || '';
    if (roleInput) roleInput.value = profile?.role ? (String(profile.role).charAt(0).toUpperCase() + String(profile.role).slice(1)) : 'Administrator';

    // Store original profile for reset
    window.originalProfile = {
      full_name: profile?.full_name || '',
      email: profile?.email || '',
      role: profile?.role || 'admin',
    };

  } catch (error) {
    console.error('[loadSettings] Error:', error);
  }
}

async function updateProfile() {
  try {
    const fullNameInput = document.getElementById('settingsFullName');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const profileMessage = document.getElementById('profileMessage');
    const securityMessage = document.getElementById('securityMessage');

    const fullName = fullNameInput?.value?.trim() || '';
    const currentPassword = currentPasswordInput?.value || '';
    const newPassword = newPasswordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    // Validate inputs
    if (!fullName) {
      showSettingsMessage(profileMessage, 'Full name is required', 'error');
      return;
    }

    if (!currentPassword) {
      showSettingsMessage(securityMessage, 'Current password is required for verification', 'error');
      return;
    }

    // Verify current password by attempting re-authentication
    const { data: authData } = await window.supabaseClient.auth.getUser();
    const userEmail = authData?.user?.email;

    if (!userEmail) {
      showSettingsMessage(securityMessage, 'Unable to verify identity', 'error');
      return;
    }

    console.log('[updateProfile] Verifying current password...');
    const { error: signInError } = await window.supabaseClient.auth.signInWithPassword({
      email: userEmail,
      password: currentPassword,
    });

    if (signInError) {
      console.error('[updateProfile] Password verification failed:', signInError);
      showSettingsMessage(securityMessage, 'Current password is incorrect', 'error');
      return;
    }

    console.log('[updateProfile] Password verified successfully');

    // Update full_name in profiles table
    const { error: updateProfileError } = await window.supabaseClient
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', authData.user.id);

    if (updateProfileError) {
      console.error('[updateProfile] Error updating profile:', updateProfileError);
      showSettingsMessage(profileMessage, 'Failed to update profile', 'error');
      return;
    }

    console.log('[updateProfile] Profile updated successfully');
    showSettingsMessage(profileMessage, 'Profile updated successfully', 'success');

    // Handle password change if provided
    if (newPassword || confirmPassword) {
      if (!newPassword || !confirmPassword) {
        showSettingsMessage(securityMessage, 'Both new password fields must be filled', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showSettingsMessage(securityMessage, 'New passwords do not match', 'error');
        return;
      }

      if (newPassword.length < 8) {
        showSettingsMessage(securityMessage, 'New password must be at least 8 characters', 'error');
        return;
      }

      console.log('[updateProfile] Updating password...');
      const { error: passwordError } = await window.supabaseClient.auth.updateUser({
        password: newPassword,
      });

      if (passwordError) {
        console.error('[updateProfile] Password update failed:', passwordError);
        showSettingsMessage(securityMessage, 'Failed to update password: ' + passwordError.message, 'error');
        return;
      }

      console.log('[updateProfile] Password updated successfully');
      showSettingsMessage(securityMessage, 'Password changed successfully', 'success');
      
      // Clear password fields
      if (currentPasswordInput) currentPasswordInput.value = '';
      if (newPasswordInput) newPasswordInput.value = '';
      if (confirmPasswordInput) confirmPasswordInput.value = '';
    }

    // Update original profile for reset
    window.originalProfile.full_name = fullName;

    // Reload sidebar with updated name
    await loadUserProfile();

  } catch (error) {
    console.error('[updateProfile] Error:', error);
    const profileMessage = document.getElementById('profileMessage');
    showSettingsMessage(profileMessage, 'An error occurred: ' + error.message, 'error');
  }
}

function resetSettingsForm() {
  try {
    const fullNameInput = document.getElementById('settingsFullName');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const profileMessage = document.getElementById('profileMessage');
    const securityMessage = document.getElementById('securityMessage');

    // Reset to original values
    if (fullNameInput && window.originalProfile) {
      fullNameInput.value = window.originalProfile.full_name || '';
    }

    // Clear password fields
    if (currentPasswordInput) currentPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';

    // Clear messages
    profileMessage?.classList.remove('success', 'error');
    securityMessage?.classList.remove('success', 'error');

    console.log('[resetSettingsForm] Form reset to original values');
  } catch (error) {
    console.error('[resetSettingsForm] Error:', error);
  }
}

function showSettingsMessage(element, message, type = 'info') {
  if (!element) return;

  element.textContent = message;
  element.className = 'status-message';
  
  if (message) {
    element.classList.add(`status-message--${type}`);
    element.style.display = 'block';
  } else {
    element.style.display = 'none';
  }
}

// ========== LOST ITEM VIEW ==========
function handleViewLostItem(button) {
  try {
    const reportPayload = button?.dataset?.report;
    if (!reportPayload) {
      console.warn('[handleViewLostItem] Missing report payload');
      return;
    }

    const report = JSON.parse(decodeURIComponent(reportPayload));
    console.log('[handleViewLostItem] Opening report:', report.id, 'matched_item_id:', report.matched_item_id);
    openLostReportModal(report);
  } catch (error) {
    console.error('[handleViewLostItem] Error:', error);
    alert('Unable to open report details.');
  }
}

// ========== CLAIM VERIFY HANDLER ==========
function handleVerifyClaim(button) {
  openClaimVerificationModal(
    button.dataset.reportId,
    button.dataset.itemId,
    button.dataset.matchScore,
    button.dataset.studentEmail,
    button.dataset.itemImageUrl,
    button.dataset.studentImageUrl,
    button.dataset.studentName
  );
}