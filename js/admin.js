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

// ========== SECTION SWITCHING ==========
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

// ========== MODAL FUNCTIONS ==========
function closeItemActionModal() {
  const modal = document.getElementById('itemActionModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function autoDescribeItem() {
  alert('AI auto-description feature coming soon');
}

function approveModalItem() {
  alert('Item approved');
  closeItemActionModal();
}

function rejectModalItem() {
  alert('Item rejected');
  closeItemActionModal();
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

    console.log('=== Admin Dashboard Initialization complete ===');

  } catch (error) {
    console.error('Fatal error during DOMContentLoaded:', error);
  }
});
