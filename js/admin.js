// ========== SUPABASE CLIENT SAFETY CHECK ==========
// NOTE: Never redeclare 'supabase' as a var — always use window.supabaseClient
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

// DOM element references (populated on DOMContentLoaded)
let logoutBtn, hamburgerBtn, sidebarOverlay, sidebar, sidebarClose, refreshBtn, verificationContainer;

// ========== SECTION SWITCHING ==========
function showSection(sectionId) {
  try {
    console.log('Switching to section:', sectionId);

    document.querySelectorAll('.admin-section').forEach(s => (s.style.display = 'none'));

    const targetSection = document.getElementById(sectionId + 'Section');
    if (targetSection) {
      targetSection.style.display = 'block';
    } else {
      console.warn('Section not found:', sectionId);
    }

    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    currentSection = sectionId;

    if (sectionId === 'itemManagement') loadItemsTable();
    else if (sectionId === 'lostItems') loadLostItemsTable();
    else if (sectionId === 'claimRequests') loadClaimRequestsTable();

    if (sidebar) sidebar.classList.remove('active');
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
      <option value="pending">Pending</option>
      <option value="approved">Approved</option>
      <option value="claimed">Claimed</option>
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
      .order('created_at', { ascending: false });

    if (currentStatusFilter !== 'all') query = query.eq('status', currentStatusFilter);

    const { data: items, error } = await query;
    if (error) throw error;

    console.log(`[loadItemsTable] Rows fetched: ${items?.length ?? 0}`);
    console.table(items);

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
              data-item-status="${item.status || 'pending'}"
              onclick="handleViewClick(this)">View</button>
          </td>
        </tr>`;
    }).join('');

    console.log('[loadItemsTable] Table rendered successfully.');
  } catch (error) {
    console.error('[loadItemsTable] Error:', error);
    tbody.innerHTML = '<tr><td colspan="5" class="error">Error loading items. Please refresh.</td></tr>';
  }
}

// ========== LOST ITEMS TABLE ==========
// Shows reports where matched_item_id IS NULL (no AI match yet)
// NOTE: matched_item_id is a UUID column — never compare it to "" (causes 400 Bad Request)
async function loadLostItemsTable() {
  const tbody = document.getElementById('lostItemsTableBody');
  if (!tbody || !window.supabaseClient) return;

  tbody.innerHTML = '<tr><td colspan="5" class="no-data">Loading reports...</td></tr>';

  try {
    const { data, error } = await window.supabaseClient
      .from('lost_reports')
      .select('id, student_name, item_description, last_location, status, created_at, ref_photo_url_1, matched_item_id')
      .is('matched_item_id', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`[loadLostItemsTable] Rows fetched: ${data?.length ?? 0}`);
    console.table(data);

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No unmatched lost item reports found.</td></tr>';
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

    console.log('[loadLostItemsTable] Table rendered successfully.');
  } catch (error) {
    console.error('[loadLostItemsTable] Error:', error);
    tbody.innerHTML = '<tr><td colspan="5" class="error">Error loading reports. Please refresh.</td></tr>';
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
    <div class="modal-content">
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
          <p><strong>Description:</strong> <span id="lostReportModalDescription"></span></p>
          <p><strong>Date:</strong> <span id="lostReportModalDate"></span></p>
          <p><strong>Location:</strong> <span id="lostReportModalLocation"></span></p>
          <p><strong>Status:</strong> <span id="lostReportModalStatus"></span></p>
          <p><strong>Matched Item ID:</strong> <span id="lostReportModalMatchedItemId"></span></p>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeLostReportModal()">Close</button>
      </div>
    </div>`;

  modal.addEventListener('click', event => {
    if (event.target === modal) closeLostReportModal();
  });

  document.body.appendChild(modal);
  return modal;
}

function openLostReportModal(report) {
  const modal = ensureLostReportModal();
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
  setText('lostReportModalDescription', report.item_description || 'N/A');
  setText('lostReportModalDate', reportDate);
  setText('lostReportModalLocation', report.last_location || 'Not specified');
  setText('lostReportModalStatus', (report.status || 'pending').toUpperCase());
  setText('lostReportModalMatchedItemId', report.matched_item_id || 'None');

  modal.style.display = 'flex';
}

function closeLostReportModal() {
  const modal = document.getElementById('lostReportModal');
  if (modal) modal.style.display = 'none';
}

// ========== CLAIM REQUESTS TABLE ==========
// FIX: Shows reports where matched_item_id IS NOT NULL (AI has found a match)
// FIX: Join with items table; added fallback if FK relationship isn't configured in Supabase
async function loadClaimRequestsTable() {
  const tbody = document.getElementById('claimRequestsTableBody');
  if (!tbody || !window.supabaseClient) return;

  tbody.innerHTML = '<tr><td colspan="5" class="no-data">Loading claim requests...</td></tr>';

  try {
    // --- STEP 1: Fetch pending reports that HAVE a matched_item_id ---
    // Using .not() with 'is' filter for SQL NOT NULL
    const { data: reports, error } = await window.supabaseClient
      .from('lost_reports')
      .select('*')
      .eq('status', 'pending')
      .not('matched_item_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log(`[loadClaimRequestsTable] Rows fetched: ${reports?.length ?? 0}`);
    console.log('[loadClaimRequestsTable] matched_item_id values:', reports?.map(report => report.matched_item_id));
    console.table(reports);

    if (!reports || reports.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No pending claim requests found.</td></tr>';
      return;
    }

    // --- STEP 3: For each report, fetch matched item separately (avoids FK dependency) ---
    const rows = await Promise.all(
      reports.map(async report => {
        let matchedItem = null;

        if (report.matched_item_id) {
          const { data: itemData, error: itemError } = await window.supabaseClient
            .from('items')
            .select('id, display_name, image_url')
            .eq('id', report.matched_item_id)
            .maybeSingle();

          if (itemError) {
            console.warn(`[loadClaimRequestsTable] Could not fetch item ${report.matched_item_id}:`, itemError.message);
          } else {
            matchedItem = itemData;
          }
        }

        console.log(`[loadClaimRequestsTable] Report ${report.id} → matched_item_id: ${report.matched_item_id}`, matchedItem);
        return { report, matchedItem };
      })
    );

    tbody.innerHTML = rows.map(({ report, matchedItem }) => {
      const itemPublicUrl = matchedItem?.image_url
        ? getSupabasePublicUrl(matchedItem.image_url)
        : FALLBACK_ITEM_IMAGE;

      const studentPublicUrl = report.ref_photo_url_1
        ? getSupabasePublicUrl(report.ref_photo_url_1)
        : '';

      const requestDate = new Date(report.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      const itemPhotoHtml = `
        <img src="${itemPublicUrl}" alt="Item" class="table-thumbnail"
          onclick="openLightbox('${itemPublicUrl}')"
          title="Item Photo"
          style="cursor:pointer;max-height:50px;max-width:50px;border-radius:4px;margin-right:5px;"
          onerror="this.onerror=null;this.src='${FALLBACK_ITEM_IMAGE}'">`;

      const studentPhotoHtml = studentPublicUrl
        ? `<img src="${studentPublicUrl}" alt="Reference" class="table-thumbnail"
             onclick="openLightbox('${studentPublicUrl}')"
             title="Student Photo"
             style="cursor:pointer;max-height:50px;max-width:50px;border-radius:4px;margin-right:5px;">`
        : '<span class="no-image">—</span>';

      return `
        <tr>
          <td>${matchedItem?.display_name || 'N/A'}</td>
          <td>${report.student_email || 'N/A'}</td>
          <td>${requestDate}</td>
          <td><span class="status-badge status-${report.status || 'pending'}">${(report.status || 'pending').toUpperCase()}</span></td>
          <td>
            <div style="display:flex;align-items:center;gap:8px;">
              ${itemPhotoHtml}
              ${studentPhotoHtml}
              <span class="match-score" title="AI Match Score" style="font-weight:bold;color:#D32F2F;">${report.match_score ?? 0}%</span>
              <button class="btn btn-small"
                data-report-id="${report.id}"
                data-item-id="${matchedItem?.id || ''}"
                data-item-image-url="${itemPublicUrl}"
                data-student-image-url="${studentPublicUrl}"
                data-match-score="${report.match_score ?? 0}"
                data-student-email="${report.student_email || ''}"
                onclick="handleVerifyClaim(this)">Verify</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    console.log('[loadClaimRequestsTable] Table rendered successfully.');
  } catch (error) {
    console.error('[loadClaimRequestsTable] Error:', error);
    tbody.innerHTML = '<tr><td colspan="6" class="error">Error loading requests. Please refresh.</td></tr>';
  }
}

// ========== DASHBOARD STATS ==========
async function fetchDashboardStats() {
  if (!window.supabaseClient) return;

  try {
    const [
      { count: totalItems },
      { count: pendingReports },
      { count: matchedReports },
    ] = await Promise.all([
      window.supabaseClient.from('items').select('*', { count: 'exact', head: true }),
      window.supabaseClient.from('lost_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      window.supabaseClient.from('lost_reports').select('*', { count: 'exact', head: true }).eq('status', 'matched'),
    ]);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? 0; };
    set('totalItems', totalItems);
    set('pendingReports', pendingReports);
    set('matchedReports', matchedReports);

    console.log('[fetchDashboardStats]', { totalItems, pendingReports, matchedReports });
  } catch (error) {
    console.error('[fetchDashboardStats] Error:', error);
  }
}

// ========== VERIFICATION HUB ==========
async function loadVerificationHub() {
  if (!window.supabaseClient || !verificationContainer) return;

  try {
    const { data: reports, error } = await window.supabaseClient
      .from('lost_reports')
      .select('*')
      .eq('status', 'pending')
      .not('matched_item_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    console.log(`[loadVerificationHub] Rows fetched: ${reports?.length ?? 0}`);
    console.log('[loadVerificationHub] matched_item_id values:', reports?.map(report => report.matched_item_id));

    if (!reports || reports.length === 0) {
      verificationContainer.innerHTML = '<p class="no-data">No reports to verify.</p>';
      return;
    }

    const cards = await Promise.all(
      reports.map(async report => {
        let matchedItem = null;
        if (report.matched_item_id) {
          const { data } = await window.supabaseClient
            .from('items').select('*').eq('id', report.matched_item_id).single();
          matchedItem = data;
        }

        const itemImgUrl = matchedItem?.image_url ? getSupabasePublicUrl(matchedItem.image_url) : '';
        const refImgUrl = report.ref_photo_url_1 ? getSupabasePublicUrl(report.ref_photo_url_1) : '';

        return `
          <div class="verification-card">
            <div class="verification-header">
              <h3>${report.student_name || 'Unknown'}</h3>
              <span class="status-badge status-${report.status}">${report.status.toUpperCase()}</span>
            </div>
            <div class="verification-body">
              <div class="verification-images">
                <div class="image-section">
                  <h4>Student Reference Photo</h4>
                  ${refImgUrl ? `<img src="${refImgUrl}" alt="Reference" onclick="openLightbox('${refImgUrl}')">` : '<p class="no-image">No image provided</p>'}
                </div>
                <div class="verification-vs-badge" aria-hidden="true">VS</div>
                <div class="image-section">
                  <h4>Office Item Image</h4>
                  ${itemImgUrl ? `<img src="${itemImgUrl}" alt="Item" onclick="openLightbox('${itemImgUrl}')">` : '<p class="no-image">No matched item</p>'}
                </div>
              </div>
              <div class="verification-details">
                <p><strong>Description:</strong> ${report.item_description || 'N/A'}</p>
                <p><strong>Location:</strong> ${report.last_location || 'Not specified'}</p>
                <p><strong>Match Score:</strong> <span class="match-score">${report.match_score ?? 0}%</span></p>
                ${matchedItem ? `<p><strong>Matched Item:</strong> ${matchedItem.display_name || matchedItem.name || 'N/A'}</p>` : ''}
              </div>
            </div>
            <div class="verification-actions">
              <button class="btn btn-success" onclick="approveMatch('${report.id}', '${report.matched_item_id || ''}')">Approve Match</button>
              <button class="btn btn-danger" onclick="rejectMatch('${report.id}')">Reject Match</button>
            </div>
          </div>`;
      })
    );

    verificationContainer.innerHTML = cards.join('');
  } catch (error) {
    console.error('[loadVerificationHub] Error:', error);
    verificationContainer.innerHTML = '<p class="error">Error loading reports. Please refresh.</p>';
  }
}

// ========== MATCH APPROVAL / REJECTION ==========
async function approveMatch(reportId, itemId) {
  if (!window.supabaseClient) return;
  try {
    await commitApprovedMatch(reportId, itemId);
    alert('Match approved successfully!');
    await refreshMatchViews();
  } catch (error) {
    console.error('[approveMatch] Error:', error);
    alert('Error approving match: ' + error.message);
  }
}

async function rejectMatch(reportId) {
  if (!window.supabaseClient) return;
  try {
    await commitRejectedMatch(reportId);
    alert('Match rejected successfully!');
    await refreshMatchViews();
  } catch (error) {
    console.error('[rejectMatch] Error:', error);
    alert('Error rejecting match: ' + error.message);
  }
}

// ========== APPROVE / REJECT CLAIM ==========
async function approveClaim(reportId, itemId) {
  try {
    await commitApprovedMatch(reportId, itemId);
    alert('✅ Claim approved! Item marked as CLAIMED.');
    closeClaimVerificationModal();
    await refreshMatchViews();
  } catch (error) {
    console.error('[approveClaim] Error:', error);
    alert('Failed to approve claim: ' + error.message);
  }
}

async function rejectClaim(reportId) {
  try {
    await commitRejectedMatch(reportId);

    alert('❌ Claim rejected! Report moved back to Lost Items.');
    closeClaimVerificationModal();
    await refreshMatchViews();
  } catch (error) {
    console.error('[rejectClaim] Error:', error);
    alert('Failed to reject claim: ' + error.message);
  }
}

async function commitApprovedMatch(reportId, itemId) {
  const resolvedItemId = itemId || await resolveMatchedItemId(reportId);
  const { error: reportError } = await window.supabaseClient
    .from('lost_reports').update({ status: 'matched' }).eq('id', reportId);

  if (reportError) throw reportError;

  if (resolvedItemId) {
    const { error: itemError } = await window.supabaseClient
      .from('items').update({ status: 'claimed' }).eq('id', resolvedItemId);
    if (itemError) throw itemError;
  }
}

async function commitRejectedMatch(reportId) {
  const { error } = await window.supabaseClient
    .from('lost_reports').update({ matched_item_id: null, status: 'pending' }).eq('id', reportId);

  if (error) throw error;
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
    loadLostItemsTable(),
    loadClaimRequestsTable(),
    loadVerificationHub(),
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
    button.dataset.itemStatus
  );
}

function openItemActionModal(itemId, imageUrl, itemName, aiDescription, currentStatus) {
  currentItemId = itemId;
  const modal = document.getElementById('itemActionModal');
  if (!modal) return;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el[id === 'modalItemImage' ? 'src' : 'value'] = val || ''; };
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };

  setText('modalTitle', 'Review Item: ' + itemName);
  setText('modalItemStatus', 'Status: ' + (currentStatus || 'pending').toUpperCase());
  document.getElementById('modalItemImage').src = imageUrl || '';
  set('modalItemName', itemName);
  set('modalItemDescription', aiDescription);

  const dropdown = document.getElementById('itemStatusDropdown');
  if (dropdown) dropdown.value = currentStatus || 'pending';

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

  try {
    const { error } = await window.supabaseClient
      .from('items').update({ status: newStatus }).eq('id', currentItemId);
    if (error) throw error;

    alert('Item status updated to ' + newStatus.toUpperCase());
    await loadItemsTable();
    closeItemActionModal();
  } catch (error) {
    console.error('[updateItemStatus] Error:', error);
    alert('Error updating item: ' + error.message);
  }
}

// ========== CLAIM VERIFICATION MODAL ==========
function openClaimVerificationModal(reportId, itemId, matchScore, studentEmail, itemImageUrl = '', studentImageUrl = '') {
  const modal = document.getElementById('claimVerificationModal');
  if (!modal) return;

  modal.dataset.reportId = reportId;
  modal.dataset.itemId = itemId;

  const title = document.getElementById('claimVerificationTitle');
  if (title) title.textContent = `Verify Claim — Match Score: ${matchScore}%`;

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

  modal.style.display = 'flex';
}

function closeClaimVerificationModal() {
  const modal = document.getElementById('claimVerificationModal');
  if (modal) modal.style.display = 'none';
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

// ========== PROFILE LOADING ==========
async function loadUserProfile() {
  if (!window.supabaseClient) return;

  try {
    const { data } = await window.supabaseClient.auth.getSession();
    const session = data?.session;
    if (!session?.user?.id) return;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || ''; };
    set('userName', session.user.user_metadata?.full_name || session.user.email || 'Admin');
    set('userEmail', session.user.email || '');
    set('userRole', 'Administrator');

    if (typeof getProfile === 'function') {
      const profile = await getProfile(session.user.id);
      if (profile) {
        set('userName', profile.full_name || session.user.email || 'Admin');
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
  sidebar?.classList.toggle('active');
  sidebarOverlay?.classList.toggle('active');
}

function closeSidebar() {
  sidebar?.classList.remove('active');
  sidebarOverlay?.classList.remove('active');
}

// ========== PAGE INIT ==========
function initPage() {
  logoutBtn?.addEventListener('click', handleLogout);
  hamburgerBtn?.addEventListener('click', toggleSidebar);
  sidebarClose?.addEventListener('click', closeSidebar);
  sidebarOverlay?.addEventListener('click', closeSidebar);
  refreshBtn?.addEventListener('click', async () => {
    await fetchDashboardStats();
    await loadVerificationHub();
  });

  const lightbox = document.getElementById('lightbox');
  lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
}

// ========== DOM CONTENT LOADED ==========
document.addEventListener('DOMContentLoaded', async () => {
  console.log('=== Admin Dashboard DOMContentLoaded ===');

  try {
    logoutBtn           = document.getElementById('logoutBtn');
    hamburgerBtn        = document.getElementById('hamburgerBtn');
    sidebarOverlay      = document.getElementById('sidebarOverlay');
    sidebar             = document.getElementById('sidebar');
    sidebarClose        = document.getElementById('sidebarClose');
    refreshBtn          = document.getElementById('refreshBtn');
    verificationContainer = document.getElementById('verificationContainer');

    if (typeof checkAuthAndRedirect === 'function') await checkAuthAndRedirect();
    await loadUserProfile();
    initPage();
    await fetchDashboardStats();
    await loadVerificationHub();

    console.log('=== Admin Dashboard Initialization Complete ===');
  } catch (error) {
    console.error('[DOMContentLoaded] Fatal error:', error);
  }
});

// ========== LOST ITEM VIEW (placeholder) ==========
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
    button.dataset.studentImageUrl
  );
}