// ========== ADMIN DASHBOARD INITIALIZATION ==========
// DOM Elements
let logoutBtn;
let hamburgerBtn;
let sidebarOverlay;
let sidebar;
let sidebarClose;
let refreshBtn;
let verificationContainer;
let currentSection = 'dashboard';
const FALLBACK_ITEM_IMAGE = '/assets/images/domini.png';

// ========== SECTION SWITCHING ==========
let currentStatusFilter = 'all';

function showSection(sectionId) {
  try {
    console.log('Switching to section:', sectionId);
    
    // Hide all admin sections
    document.querySelectorAll('.admin-section').forEach(section => {
      section.style.display = 'none';
    });

    // Show the requested section
    const targetSection = document.getElementById(sectionId + 'Section');
    if (targetSection) {
      targetSection.style.display = 'block';
      console.log('Section displayed:', sectionId);
    } else {
      console.warn('Section not found:', sectionId);
    }

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    
    currentSection = sectionId;
    
    // Load data for the selected section
    if (sectionId === 'itemManagement') {
      loadItemsTable();
    } else if (sectionId === 'lostItems') {
      loadLostItemsTable();
    } else if (sectionId === 'claimRequests') {
      loadClaimRequestsTable();
    }
    
    // Close sidebar on mobile
    if (sidebar) {
      sidebar.classList.remove('active');
    }
    if (sidebarOverlay) {
      sidebarOverlay.classList.remove('active');
    }
  } catch (error) {
    console.error('Error switching section:', error);
  }
}

// ========== STATUS FILTER CONTROLS ==========
function addStatusFilterControls() {
  const section = document.getElementById('itemManagementSection');
  let filterContainer = document.getElementById('statusFilterContainer');
  
  // Only add filter once
  if (filterContainer) return;
  
  if (!section) return;
  
  filterContainer = document.createElement('div');
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
  
  // Insert after description
  const description = section.querySelector('.section-description');
  if (description) {
    description.parentNode.insertBefore(filterContainer, description.nextSibling);
  }
}

function changeStatusFilter(status) {
  currentStatusFilter = status;
  loadItemsTable();
}

// ========== ITEMS TABLE LOADING ==========
async function loadItemsTable() {
  try {
    if (!window.supabaseClient) {
      console.warn('Supabase client not available');
      return;
    }

    const itemsTableBody = document.getElementById('itemsTableBody');
    if (!itemsTableBody) {
      console.warn('itemsTableBody element not found');
      return;
    }

    console.log('Loading items table with status filter:', currentStatusFilter);
    itemsTableBody.innerHTML = '<tr><td colspan="5" class="no-data">Loading items...</td></tr>';

    // Add filter controls
    addStatusFilterControls();

    // Build query with optional status filter
    let query = window.supabaseClient
      .from('items')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply status filter if not 'all'
    if (currentStatusFilter !== 'all') {
      query = query.eq('status', currentStatusFilter);
    }

    const { data: items, error } = await query;

    if (error) throw error;

    if (!items || items.length === 0) {
      itemsTableBody.innerHTML = '<tr><td colspan="5" class="no-data">No items found.</td></tr>';
      return;
    }

    let html = '';
    for (const item of items) {
      // Build public URL if image_url exists
      const publicImageUrl = item.image_url ? getSupabasePublicUrl(item.image_url) : '';
      const imageHtml = publicImageUrl
        ? `<img src="${publicImageUrl}" alt="${item.display_name}" class="table-thumbnail" onclick="openLightbox('${publicImageUrl}')" style="cursor: pointer; max-height: 60px; max-width: 60px; border-radius: 4px;">`
        : '<span class="no-image">No image</span>';

      // Truncate AI description
      const truncatedDescription = item.ai_description 
        ? item.ai_description.substring(0, 50) + (item.ai_description.length > 50 ? '...' : '')
        : 'N/A';

      html += `
        <tr>
          <td>${imageHtml}</td>
          <td>${item.display_name || 'N/A'}</td>
          <td>${truncatedDescription}</td>
          <td><span class="status-badge status-${item.status || 'pending'}">${(item.status || 'pending').toUpperCase()}</span></td>
          <td>
            <button class="btn btn-small" data-item-id="${item.id}" data-image-url="${publicImageUrl}" data-item-name="${item.display_name || ''}" data-item-desc="${item.ai_description || ''}" data-item-status="${item.status || 'pending'}" onclick="handleViewClick(this)">View</button>
          </td>
        </tr>
      `;
    }

    itemsTableBody.innerHTML = html;
    console.log('Items table loaded with', items.length, 'items');
  } catch (error) {
    console.error('Error loading items table:', error);
    const itemsTableBody = document.getElementById('itemsTableBody');
    if (itemsTableBody) {
      itemsTableBody.innerHTML = '<tr><td colspan="5" class="error">Error loading items. Please refresh.</td></tr>';
    }
  }
}

// ========== LOST ITEMS TABLE LOADING ==========
async function loadLostItemsTable() {
  try {
    if (!window.supabaseClient) {
      console.warn('Supabase client not available');
      return;
    }

    const lostItemsTableBody = document.getElementById('lostItemsTableBody');
    if (!lostItemsTableBody) {
      console.warn('lostItemsTableBody element not found');
      return;
    }

    console.log('Loading lost items table...');
    lostItemsTableBody.innerHTML = '<tr><td colspan="5" class="no-data">Loading reports...</td></tr>';

    // Fetch lost reports that have no matched_item_id
    const { data: reports, error } = await window.supabaseClient
      .from('lost_reports')
      .select('id, student_name, item_description, last_location, status, created_at, ref_photo_url_1, matched_item_id')
      .is('matched_item_id', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!reports || reports.length === 0) {
      lostItemsTableBody.innerHTML = '<tr><td colspan="5" class="no-data">No unmatched lost items.</td></tr>';
      return;
    }

    let html = '';
    for (const report of reports) {
      const reportDate = new Date(report.created_at).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });

      html += `
        <tr>
          <td>${report.student_name || 'N/A'}</td>
          <td>${report.item_description ? report.item_description.substring(0, 50) + (report.item_description.length > 50 ? '...' : '') : 'N/A'}</td>
          <td>${report.last_location || 'Not specified'}</td>
          <td><span class="status-badge status-${report.status || 'pending'}">${(report.status || 'pending').toUpperCase()}</span></td>
          <td>
            <button class="btn btn-small" data-report-id="${report.id}" onclick="handleViewLostItem(this)">View</button>
          </td>
        </tr>
      `;
    }

    lostItemsTableBody.innerHTML = html;
    console.log('Lost items table loaded with', reports.length, 'reports');
  } catch (error) {
    console.error('Error loading lost items table:', error);
    const lostItemsTableBody = document.getElementById('lostItemsTableBody');
    if (lostItemsTableBody) {
      lostItemsTableBody.innerHTML = '<tr><td colspan="5" class="error">Error loading reports. Please refresh.</td></tr>';
    }
  }
}

// ========== CLAIM REQUESTS TABLE LOADING ==========
async function loadClaimRequestsTable() {
  try {
    if (!window.supabaseClient) {
      console.warn('Supabase client not available');
      return;
    }

    const claimRequestsTableBody = document.getElementById('claimRequestsTableBody');
    if (!claimRequestsTableBody) {
      console.warn('claimRequestsTableBody element not found');
      return;
    }

    console.log('Loading claim requests table...');
    claimRequestsTableBody.innerHTML = '<tr><td colspan="5" class="no-data">Loading claim requests...</td></tr>';

    // Fetch pending matched reports, then resolve the matched item explicitly for reliability.
    const { data: reports, error } = await window.supabaseClient
      .from('lost_reports')
      .select('id, student_name, student_email, match_score, status, created_at, ref_photo_url_1, matched_item_id')
      .eq('status', 'pending')
      .not('matched_item_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!reports || reports.length === 0) {
      claimRequestsTableBody.innerHTML = '<tr><td colspan="5" class="no-data">No claim requests.</td></tr>';
      return;
    }

    let html = '';
    for (const report of reports) {
      const { data: matchedItem, error: itemError } = await window.supabaseClient
        .from('items')
        .select('id, display_name, image_url')
        .eq('id', report.matched_item_id)
        .maybeSingle();

      if (itemError) {
        console.warn('Failed to fetch matched item for claim request:', report.matched_item_id, itemError);
      }

      const itemPublicUrl = matchedItem?.image_url ? getSupabasePublicUrl(matchedItem.image_url) : FALLBACK_ITEM_IMAGE;
      const studentPublicUrl = report.ref_photo_url_1 ? getSupabasePublicUrl(report.ref_photo_url_1) : '';

      const itemPhotoHtml = `<img src="${itemPublicUrl}" alt="Item" class="table-thumbnail" onclick="openLightbox('${itemPublicUrl}')" title="Item Photo" style="cursor: pointer; max-height: 50px; max-width: 50px; border-radius: 4px; margin-right: 5px;" onerror="this.onerror=null;this.src='${FALLBACK_ITEM_IMAGE}'">`;

      const studentPhotoHtml = studentPublicUrl
        ? `<img src="${studentPublicUrl}" alt="Reference" class="table-thumbnail" onclick="openLightbox('${studentPublicUrl}')" title="Student Photo" style="cursor: pointer; max-height: 50px; max-width: 50px; border-radius: 4px; margin-right: 5px;">`
        : '<span class="no-image">-</span>';

      const requestDate = new Date(report.created_at).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });

      html += `
        <tr>
          <td>${matchedItem?.display_name || 'N/A'}</td>
          <td>${report.student_email || 'N/A'}</td>
          <td>${requestDate}</td>
          <td><span class="status-badge status-${report.status || 'pending'}">${(report.status || 'pending').toUpperCase()}</span></td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${itemPhotoHtml}
              ${studentPhotoHtml}
              <span class="match-score" title="AI Match Score" style="font-weight: bold; color: #D32F2F;">${report.match_score || 0}%</span>
              <button class="btn btn-small" data-report-id="${report.id}" data-item-id="${matchedItem?.id || ''}" data-item-image-url="${itemPublicUrl}" data-student-image-url="${studentPublicUrl || ''}" data-match-score="${report.match_score}" data-student-email="${report.student_email}" onclick="handleVerifyClaim(this)">Verify</button>
            </div>
          </td>
        </tr>
      `;
    }

    claimRequestsTableBody.innerHTML = html;
    console.log('Claim requests table loaded with', reports.length, 'requests');
    console.log('Claim data:', reports);
  } catch (error) {
    console.error('Error loading claim requests table:', error);
    const claimRequestsTableBody = document.getElementById('claimRequestsTableBody');
    if (claimRequestsTableBody) {
      claimRequestsTableBody.innerHTML = '<tr><td colspan="6" class="error">Error loading requests. Please refresh.</td></tr>';
    }
  }
}

// ========== DASHBOARD STATS FETCHING ==========
async function fetchDashboardStats() {
  try {
    if (!window.supabaseClient) {
      console.warn('Supabase client not available');
      return;
    }

    console.log('Fetching dashboard statistics...');

    // Fetch total items
    const { count: totalItems } = await window.supabaseClient
      .from('items')
      .select('*', { count: 'exact', head: true });

    // Fetch pending reports
    const { count: pendingReports } = await window.supabaseClient
      .from('lost_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Fetch matched reports
    const { count: matchedReports } = await window.supabaseClient
      .from('lost_reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'matched');

    // Update UI
    const totalItemsEl = document.getElementById('totalItems');
    const pendingReportsEl = document.getElementById('pendingReports');
    const matchedReportsEl = document.getElementById('matchedReports');

    if (totalItemsEl) totalItemsEl.textContent = totalItems || 0;
    if (pendingReportsEl) pendingReportsEl.textContent = pendingReports || 0;
    if (matchedReportsEl) matchedReportsEl.textContent = matchedReports || 0;

    console.log('Stats updated:', { totalItems, pendingReports, matchedReports });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    // Set defaults on error
    const totalItemsEl = document.getElementById('totalItems');
    const pendingReportsEl = document.getElementById('pendingReports');
    const matchedReportsEl = document.getElementById('matchedReports');
    if (totalItemsEl) totalItemsEl.textContent = '0';
    if (pendingReportsEl) pendingReportsEl.textContent = '0';
    if (matchedReportsEl) matchedReportsEl.textContent = '0';
  }
}

// ========== VERIFICATION HUB ==========
async function loadVerificationHub() {
  try {
    if (!window.supabaseClient) {
      console.warn('Supabase client not available for verification hub');
      return;
    }

    if (!verificationContainer) {
      console.warn('verificationContainer element not found');
      return;
    }

    console.log('Loading verification hub...');

    // Fetch all pending and matched lost reports with their data
    const { data: reports, error } = await window.supabaseClient
      .from('lost_reports')
      .select('*')
      .in('status', ['pending', 'matched'])
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!reports || reports.length === 0) {
      verificationContainer.innerHTML = '<p class="no-data">No reports to verify.</p>';
      return;
    }

    let html = '';
    
    for (const report of reports) {
      // Fetch the matched item if it exists
      let matchedItem = null;
      if (report.matched_item_id) {
        const { data: item } = await window.supabaseClient
          .from('items')
          .select('*')
          .eq('id', report.matched_item_id)
          .single();
        matchedItem = item;
      }

      html += `
        <div class="verification-card">
          <div class="verification-header">
            <h3>${report.student_name}</h3>
            <span class="status-badge status-${report.status}">${report.status.toUpperCase()}</span>
          </div>
          <div class="verification-body">
            <div class="verification-images">
              <div class="image-section">
                <h4>Student Reference Photo</h4>
                ${report.ref_photo_url_1 ? `<img src="${report.ref_photo_url_1}" alt="Reference" onclick="openLightbox('${report.ref_photo_url_1}')">` : '<p class="no-image">No image provided</p>'}
              </div>
              <div class="image-section">
                <h4>Office Item Image</h4>
                ${matchedItem?.image_url ? `<img src="${matchedItem.image_url}" alt="Item" onclick="openLightbox('${matchedItem.image_url}')">` : '<p class="no-image">No matched item</p>'}
              </div>
            </div>
            <div class="verification-details">
              <p><strong>Item Description:</strong> ${report.item_description}</p>
              <p><strong>Location:</strong> ${report.last_location || 'Not specified'}</p>
              <p><strong>Match Score:</strong> <span class="match-score">${report.match_score || 0}%</span></p>
              ${matchedItem ? `<p><strong>Matched Item:</strong> ${matchedItem.name}</p>` : ''}
            </div>
          </div>
          <div class="verification-actions">
            <button class="btn btn-success" onclick="approveMatch(${report.id}, ${report.matched_item_id || 'null'})">Approve Match</button>
            <button class="btn btn-danger" onclick="rejectMatch(${report.id})">Reject Match</button>
          </div>
        </div>
      `;
    }

    verificationContainer.innerHTML = html;
    console.log('Verification hub loaded with', reports.length, 'reports');
  } catch (error) {
    console.error('Error loading verification hub:', error);
    if (verificationContainer) {
      verificationContainer.innerHTML = '<p class="error">Error loading reports. Please refresh the page.</p>';
    }
  }
}

// ========== MATCH APPROVAL/REJECTION ==========
async function approveMatch(reportId, itemId) {
  try {
    if (!window.supabaseClient) {
      console.error('Supabase client not available');
      return;
    }

    console.log('Approving match:', reportId);

    // Update lost report status to matched
    const { error: reportError } = await window.supabaseClient
      .from('lost_reports')
      .update({ status: 'approved' })
      .eq('id', reportId);

    if (reportError) throw reportError;

    // Update item status if it exists
    if (itemId) {
      const { error: itemError } = await window.supabaseClient
        .from('items')
        .update({ status: 'matched' })
        .eq('id', itemId);

      if (itemError) throw itemError;
    }

    console.log('Match approved successfully');
    alert('Match approved successfully!');
    
    // Reload verification hub
    await loadVerificationHub();
    await fetchDashboardStats();
  } catch (error) {
    console.error('Error approving match:', error);
    alert('Error approving match: ' + error.message);
  }
}

async function rejectMatch(reportId) {
  try {
    if (!window.supabaseClient) {
      console.error('Supabase client not available');
      return;
    }

    console.log('Rejecting match:', reportId);

    // Update lost report status to rejected
    const { error } = await window.supabaseClient
      .from('lost_reports')
      .update({ status: 'rejected' })
      .eq('id', reportId);

    if (error) throw error;

    console.log('Match rejected successfully');
    alert('Match rejected successfully!');
    
    // Reload verification hub
    await loadVerificationHub();
    await fetchDashboardStats();
  } catch (error) {
    console.error('Error rejecting match:', error);
    alert('Error rejecting match: ' + error.message);
  }
}

// ========== SUPABASE URL HELPER ==========
function getSupabasePublicUrl(imagePath) {
  if (!imagePath) return '';
  
  // If it's already a full URL, return as-is
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // Extract project ID from SUPABASE_URL
  // Format: https://[PROJECT_ID].supabase.co
  const supabaseUrl = window.SUPABASE_URL || '';
  const match = supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/);
  const projectId = match ? match[1] : 'unknown-project';
  
  // Build public URL for items bucket
  return `https://${projectId}.supabase.co/storage/v1/object/public/items/${imagePath}`;
}

// ========== ITEM ACTION MODAL ==========
let currentItemId = null;

function handleViewClick(button) {
  const itemId = button.dataset.itemId;
  const imageUrl = button.dataset.imageUrl;
  const itemName = button.dataset.itemName;
  const aiDesc = button.dataset.itemDesc;
  const status = button.dataset.itemStatus;
  openItemActionModal(itemId, imageUrl, itemName, aiDesc, status);
}

function openItemActionModal(itemId, imageUrl, itemName, aiDescription, currentStatus) {
  try {
    currentItemId = itemId;
    const modal = document.getElementById('itemActionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalItemStatus = document.getElementById('modalItemStatus');
    const modalItemImage = document.getElementById('modalItemImage');
    const modalItemName = document.getElementById('modalItemName');
    const modalItemDescription = document.getElementById('modalItemDescription');
    const statusDropdown = document.getElementById('itemStatusDropdown');

    if (!modal) {
      console.warn('itemActionModal element not found');
      return;
    }

    // Populate modal fields
    if (modalTitle) modalTitle.textContent = 'Review Item: ' + itemName;
    if (modalItemStatus) modalItemStatus.textContent = 'Status: ' + (currentStatus || 'pending').toUpperCase();
    if (modalItemImage) modalItemImage.src = imageUrl || '';
    if (modalItemName) modalItemName.value = itemName || '';
    if (modalItemDescription) modalItemDescription.value = aiDescription || '';
    
    // Set current status in dropdown
    if (statusDropdown) {
      statusDropdown.value = currentStatus || 'pending';
    }

    // Show modal
    modal.style.display = 'flex';
    console.log('Item action modal opened for item ID:', itemId);
  } catch (error) {
    console.error('Error opening item action modal:', error);
  }
}

function closeItemActionModal() {
  const modal = document.getElementById('itemActionModal');
  if (modal) {
    modal.style.display = 'none';
  }
  currentItemId = null;
}

async function updateItemStatus() {
  try {
    if (!currentItemId) {
      alert('No item selected');
      return;
    }

    if (!window.supabaseClient) {
      console.error('Supabase client not available');
      return;
    }

    const statusDropdown = document.getElementById('itemStatusDropdown');
    const newStatus = statusDropdown?.value || 'pending';

    console.log('Updating item', currentItemId, 'to status:', newStatus);

    const { error } = await window.supabaseClient
      .from('items')
      .update({ status: newStatus })
      .eq('id', currentItemId);

    if (error) throw error;

    console.log('Item status updated successfully');
    alert('Item status updated to ' + newStatus.toUpperCase());
    
    // Refresh the items table
    await loadItemsTable();
    closeItemActionModal();
  } catch (error) {
    console.error('Error updating item status:', error);
    alert('Error updating item: ' + error.message);
  }
}

// ========== LIGHTBOX ==========
function openLightbox(imageSrc) {
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  if (lightbox && lightboxImg) {
    lightboxImg.src = imageSrc;
    lightbox.style.display = 'flex';
  }
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.style.display = 'none';
  }
}

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
    const userEmailEl = document.getElementById('userEmail');
    const userRoleEl = document.getElementById('userRole');

    if (userNameEl) {
      userNameEl.textContent = profile?.full_name || 'Admin';
    }
    if (userEmailEl) {
      userEmailEl.textContent = profile?.email || '';
    }
    if (userRoleEl) {
      userRoleEl.textContent = 'Administrator';
    }

    console.log('Admin profile loaded successfully');
  } catch (error) {
    console.error('Error loading profile:', error);
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
      window.location.href = '/login.html';
    }
  } catch (error) {
    console.error('Error during logout:', error);
    window.location.href = '/login.html';
  }
}

// ========== SIDEBAR NAVIGATION ==========
function toggleSidebar() {
  if (sidebar) {
    sidebar.classList.toggle('active');
  }
  if (sidebarOverlay) {
    sidebarOverlay.classList.toggle('active');
  }
}

function closeSidebar() {
  if (sidebar) {
    sidebar.classList.remove('active');
  }
  if (sidebarOverlay) {
    sidebarOverlay.classList.remove('active');
  }
}

// ========== PAGE INITIALIZATION ==========
function initPage() {
  try {
    // Logout button
    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
      console.log('Logout button listener attached');
    } else {
      console.warn('logoutBtn element not found');
    }

    // Hamburger menu
    if (hamburgerBtn) {
      hamburgerBtn.addEventListener('click', toggleSidebar);
    }

    // Sidebar close button
    if (sidebarClose) {
      sidebarClose.addEventListener('click', closeSidebar);
    }

    // Sidebar overlay
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', closeSidebar);
    }

    // Refresh button
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await fetchDashboardStats();
        await loadVerificationHub();
      });
    } else {
      console.warn('refreshBtn element not found');
    }

    // Close lightbox on click
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) {
          closeLightbox();
        }
      });
    }

    console.log('Page initialization completed');
  } catch (error) {
    console.error('Error during page initialization:', error);
  }
}

// ========== DOM CONTENT LOADED ==========
document.addEventListener('DOMContentLoaded', async function() {
  console.log('=== Admin Dashboard DOMContentLoaded triggered ===');

  try {
    // Initialize all DOM element references
    logoutBtn = document.getElementById('logoutBtn');
    hamburgerBtn = document.getElementById('hamburgerBtn');
    sidebarOverlay = document.getElementById('sidebarOverlay');
    sidebar = document.getElementById('sidebar');
    sidebarClose = document.getElementById('sidebarClose');
    refreshBtn = document.getElementById('refreshBtn');
    verificationContainer = document.getElementById('verificationContainer');

    console.log('DOM elements initialized');

    // Initialize authentication and navigation
    if (typeof checkAuthAndRedirect === 'function') {
      await checkAuthAndRedirect();
    } else {
      console.warn('checkAuthAndRedirect function not available from auth.js');
    }

    // Load user profile
    await loadUserProfile();

    // Initialize page listeners and event handlers
    initPage();

    // Load initial dashboard stats
    await fetchDashboardStats();

    // Load verification hub
    await loadVerificationHub();

    // Load Item Management table by default
    await loadItemsTable();

    console.log('=== Admin Dashboard Initialization complete ===');

  } catch (error) {
    console.error('Fatal error during DOMContentLoaded:', error);
  }
});

// ========== HANDLE LOST ITEM VIEW ==========
function handleViewLostItem(button) {
  const reportId = button.dataset.reportId;
  console.log('Viewing lost item report:', reportId);
  alert("Report ID: " + reportId + ". Full report details coming soon.");
}

// ========== HANDLE CLAIM VERIFICATION ==========
function handleVerifyClaim(button) {
  const reportId = button.dataset.reportId;
  const itemId = button.dataset.itemId;
  const matchScore = button.dataset.matchScore;
  const studentEmail = button.dataset.studentEmail;
  const itemImageUrl = button.dataset.itemImageUrl;
  const studentImageUrl = button.dataset.studentImageUrl;
  
  console.log('Verifying claim:', { reportId, itemId, matchScore, studentEmail, itemImageUrl, studentImageUrl });
  
  // Open claim verification modal
  openClaimVerificationModal(reportId, itemId, matchScore, studentEmail, itemImageUrl, studentImageUrl);
}

// ========== APPROVE CLAIM ==========
async function approveClaim(reportId, itemId) {
  try {
    if (!window.supabaseClient) throw new Error('Supabase client not available');
    
    // Update lost_reports status to 'matched'
    const { error: reportError } = await window.supabaseClient
      .from('lost_reports')
      .update({ status: 'matched' })
      .eq('id', reportId);
    
    if (reportError) throw reportError;
    
    // Update items status to 'claimed'
    const { error: itemError } = await window.supabaseClient
      .from('items')
      .update({ status: 'claimed' })
      .eq('id', itemId);
    
    if (itemError) throw itemError;
    
    console.log('Claim approved successfully');
    alert('? Claim approved! Item marked as CLAIMED.');
    closeClaimVerificationModal();
    loadItemsTable();
    loadClaimRequestsTable();
  } catch (error) {
    console.error('Error approving claim:', error);
    alert('Failed to approve claim: ' + error.message);
  }
}

// ========== REJECT CLAIM ==========
async function rejectClaim(reportId) {
  try {
    if (!window.supabaseClient) throw new Error('Supabase client not available');
    
    // Clear matched_item_id and set status to 'pending'
    const { error } = await window.supabaseClient
      .from('lost_reports')
      .update({ matched_item_id: null, status: 'pending' })
      .eq('id', reportId);
    
    if (error) throw error;
    
    console.log('Claim rejected successfully');
    alert('? Claim rejected! Report moved back to Lost Items.');
    closeClaimVerificationModal();
    loadClaimRequestsTable();
    loadLostItemsTable();
  } catch (error) {
    console.error('Error rejecting claim:', error);
    alert('Failed to reject claim: ' + error.message);
  }
}

// ========== CLAIM VERIFICATION MODAL ==========
function openClaimVerificationModal(reportId, itemId, matchScore, studentEmail, itemImageUrl = '', studentImageUrl = '') {
  const modal = document.getElementById('claimVerificationModal');
  if (!modal) {
    console.warn('claimVerificationModal element not found');
    return;
  }
  
  // Store data for approval/rejection
  modal.dataset.reportId = reportId;
  modal.dataset.itemId = itemId;
  
  // Update modal title
  const title = document.getElementById('claimVerificationTitle');
  if (title) {
    title.textContent = "Verify Claim - Match Score: " + matchScore + "%";
  }
  
  // Update student email
  const emailDisplay = document.getElementById('claimStudentEmail');
  if (emailDisplay) {
    emailDisplay.textContent = studentEmail || 'N/A';
  }

  const itemImageEl = document.getElementById('claimItemImage');
  if (itemImageEl) {
    itemImageEl.src = itemImageUrl || FALLBACK_ITEM_IMAGE;
    itemImageEl.onerror = () => {
      itemImageEl.onerror = null;
      itemImageEl.src = FALLBACK_ITEM_IMAGE;
    };
  }

  const studentImageEl = document.getElementById('claimStudentImage');
  if (studentImageEl) {
    studentImageEl.src = studentImageUrl || FALLBACK_ITEM_IMAGE;
    studentImageEl.onerror = () => {
      studentImageEl.onerror = null;
      studentImageEl.src = FALLBACK_ITEM_IMAGE;
    };
  }
  
  // Show modal
  modal.style.display = 'flex';
}

function closeClaimVerificationModal() {
  const modal = document.getElementById('claimVerificationModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

