const API_BASE_URL = 'https://iot-production-17b1.up.railway.app/api';
const API_ITEMS_URL = `${API_BASE_URL}/items`;
const API_LOST_REPORTS_URL = `${API_BASE_URL}/items/lost-reports`;
const API_LOGS_URL = `${API_BASE_URL}/item-logs`;

let allItems = [];
let lostReports = [];
let currentUser = null;
let DEFAULT_IMAGE_URL = null;

console.log('🚀 Admin dashboard script loaded');

// ==================== STORAGE CONFIG ====================
async function loadStorageConfig() {
    try {
        const response = await fetch('/api/config/storage');
        const data = await response.json();
        DEFAULT_IMAGE_URL = data.defaultImageUrl;
        console.log('✓ [ADMIN] Default image URL loaded:', DEFAULT_IMAGE_URL);
    } catch (error) {
        console.error('❌ [ADMIN] Failed to load storage config:', error);
        DEFAULT_IMAGE_URL = `${window.SUPABASE_URL}/storage/v1/object/public/items/default.png`;
    }
}

// ==================== FETCH DATA ====================
async function fetchItems() {
    try {
        const res = await fetch(API_ITEMS_URL);
        if (!res.ok) throw new Error('Failed to fetch items');
        allItems = await res.json();
        console.log('✓ Items fetched:', allItems.length);
        updateStatistics();
        renderItemsTable();
        renderVerificationHub();
    } catch (error) {
        console.error('Error fetching items:', error);
        showError('Failed to load items. Please try again.');
    }
}

async function fetchLostReports() {
    try {
        const res = await fetch(API_LOST_REPORTS_URL);
        if (!res.ok) throw new Error('Failed to fetch lost reports');
        lostReports = await res.json();
        console.log('✓ Lost reports fetched:', lostReports.length);
        updateStatistics();
        renderLostItemsTable();
        renderVerificationHub();
    } catch (error) {
        console.error('Error fetching lost reports:', error);
        showError('Failed to load reports. Please try again.');
    }
}

// ==================== STATISTICS ====================
function updateStatistics() {
    const totalItems = allItems.length;
    const pendingItems = allItems.filter(item => item.status === 'pending').length;
    const approvedItems = allItems.filter(item => item.status === 'approved').length;
    const claimedItems = allItems.filter(item => item.status === 'claimed').length;
    const pendingReports = lostReports.filter(report => report.status === 'pending').length;
    const matchedReports = lostReports.filter(report => report.status === 'matched').length;

    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('pendingReports').textContent = pendingReports;
    document.getElementById('matchedReports').textContent = matchedReports;

    console.log('📊 Dashboard Stats Updated:', { totalItems, pendingItems, approvedItems, claimedItems, pendingReports, matchedReports });
}

// ==================== VERIFICATION HUB ====================
function renderVerificationHub() {
    const container = document.getElementById('verificationContainer');
    if (!container) return;

    const pendingMatches = lostReports.filter(report => report.matched_item_id && report.status === 'pending');
    container.innerHTML = '';

    if (!pendingMatches.length) {
        container.innerHTML = `
            <div class="empty-state">
              <i class="fas fa-search"></i>
              <h3>No AI matches pending verification</h3>
              <p>Reports with matched items will appear here for admin verification.</p>
            </div>
        `;
        return;
    }

    pendingMatches.forEach(report => {
        container.appendChild(createVerificationCard(report));
    });
}

function createVerificationCard(report) {
    const item = allItems.find(i => i.id === report.matched_item_id) || {};
    const card = document.createElement('div');
    card.className = 'verification-card';

    const itemImage = item.image_url || DEFAULT_IMAGE_URL;
    const itemName = item.display_name || item.name || 'Matched Item';
    const itemDescription = item.ai_description || 'No AI description available.';
    const studentPhotos = [report.ref_photo_url_1, report.ref_photo_url_2].filter(Boolean);

    card.innerHTML = `
      <div class="verification-side verification-side--left">
        <h3>Matched Office Item</h3>
        <img src="${itemImage}" alt="${itemName}" onerror="this.src='${DEFAULT_IMAGE_URL}'">
        <p class="verification-label">AI Description</p>
        <p class="verification-text">${escapeHtml(itemDescription)}</p>
      </div>
      <div class="verification-side verification-side--center">
        <div class="match-score">AI Confidence: ${Number(report.match_score) || 0}%</div>
        <button class="btn btn-success" onclick="approveMatch('${report.id}')">Approve Match</button>
        <button class="btn btn-danger" onclick="rejectMatch('${report.id}')">Reject Match</button>
      </div>
      <div class="verification-side verification-side--right">
        <h3>Student Report</h3>
        <p><strong>${escapeHtml(report.student_name)}</strong></p>
        <p><strong>Email:</strong> ${escapeHtml(report.student_email)}</p>
        <p><strong>Location:</strong> ${escapeHtml(report.last_location || 'Unknown')}</p>
        <p class="verification-label">Student Description</p>
        <p class="verification-text">${escapeHtml(report.item_description)}</p>
        <div class="student-photos">
          ${studentPhotos.length ? studentPhotos.map(url => `<img src="${url}" alt="Student reference photo" onerror="this.src='${DEFAULT_IMAGE_URL}'">`).join('') : '<p>No reference photos provided.</p>'}
        </div>
      </div>
    `;

    return card;
}

async function approveMatch(reportId) {
    try {
        const response = await fetch(`${API_LOST_REPORTS_URL}/${reportId}/approve-match`, { method: 'PATCH' });
        if (!response.ok) throw new Error('Failed to approve match');

        showSuccess('Match approved successfully!');
        await fetchLostReports();
    } catch (error) {
        console.error('Error approving match:', error);
        showError(error.message || 'Failed to approve match.');
    }
}

async function rejectMatch(reportId) {
    try {
        const response = await fetch(`${API_LOST_REPORTS_URL}/${reportId}/reject-match`, { method: 'PATCH' });
        if (!response.ok) throw new Error('Failed to reject match');

        showSuccess('Match rejected. Report reset to searching.');
        await fetchLostReports();
    } catch (error) {
        console.error('Error rejecting match:', error);
        showError(error.message || 'Failed to reject match.');
    }
}

// ==================== AUTHENTICATION ====================
async function loadUserProfile() {
    try {
        console.log('📋 Loading user profile...');
        const client = await getSupabaseClient();
        if (!client) {
            console.error('❌ Supabase client not available');
            document.getElementById('userName').textContent = 'Not Available';
            document.getElementById('userEmail').textContent = 'Error';
            document.getElementById('userRole').textContent = 'Error';
            return;
        }

        const { data } = await client.auth.getSession();
        const session = data?.session;
        
        if (!session?.user?.id) {
            console.warn('⚠️ No active session found');
            document.getElementById('userName').textContent = 'Not Logged In';
            document.getElementById('userEmail').textContent = '';
            document.getElementById('userRole').textContent = '';
            return;
        }

        currentUser = session.user;
        console.log('✓ Session found for user:', currentUser.id);

        const profile = await getProfile(session.user.id);
        console.log('✓ Profile loaded:', profile);

        // Update UI with profile data
        const userNameEl = document.getElementById('userName');
        const userEmailEl = document.getElementById('userEmail');
        const userRoleEl = document.getElementById('userRole');

        if (userNameEl) userNameEl.textContent = profile.full_name || 'Unknown';
        if (userEmailEl) userEmailEl.textContent = profile.email || 'No email';
        if (userRoleEl) userRoleEl.textContent = profile.role || 'No role';

        console.log('✅ Profile UI updated successfully');
        
    } catch (error) {
        console.error('❌ Error loading user profile:', error);
        document.getElementById('userName').textContent = 'Error Loading';
        document.getElementById('userEmail').textContent = error.message;
        document.getElementById('userRole').textContent = 'Profile Error';
    }
}

async function handleLogout() {
    console.log('🔐 Logout initiated');
    try {
        const client = await getSupabaseClient();
        if (!client) {
            console.warn('Supabase client not available, redirecting to login');
            window.location.href = '/login.html';
            return;
        }

        await client.auth.signOut();
        console.log('✓ Sign out successful');
        showSuccess('Logged out successfully');
        
        // Redirect to login page after a brief delay
        setTimeout(() => {
            window.location.href = '/login.html';
        }, 500);
    } catch (error) {
        console.error('❌ Logout error:', error);
        // Force redirect even on error
        window.location.href = '/login.html';
    }
}

// ==================== ITEM MANAGEMENT ====================
function renderItemsTable() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;

    if (!allItems || allItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">No items found in system.</td></tr>';
        return;
    }

    tbody.innerHTML = allItems.map(item => {
        const imageUrl = item.image_url || DEFAULT_IMAGE_URL;
        const name = item.display_name || item.name || 'Unknown';
        const description = (item.ai_description || '').substring(0, 50) + (item.ai_description?.length > 50 ? '...' : '');
        const statusBadge = `<span class="badge badge-${item.status}">${item.status.toUpperCase()}</span>`;
        
        return `
          <tr>
            <td><img src="${imageUrl}" alt="${name}" class="item-thumb" onerror="this.src='${DEFAULT_IMAGE_URL}'"></td>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(description)}</td>
            <td>${statusBadge}</td>
            <td>
              ${item.status === 'pending' ? `
                <button class="btn btn-sm btn-success" onclick="approveItemAction('${item.id}')">Approve</button>
                <button class="btn btn-sm btn-danger" onclick="rejectItemAction('${item.id}')">Reject</button>
              ` : `<span class="badge">${item.status}</span>`}
            </td>
          </tr>
        `;
    }).join('');
}

function renderLostItemsTable() {
    const tbody = document.getElementById('lostItemsTableBody');
    if (!tbody) return;

    const pendingReports = lostReports.filter(r => r.status !== 'matched');
    
    if (!pendingReports || pendingReports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">No lost item reports yet.</td></tr>';
        return;
    }

    tbody.innerHTML = pendingReports.map(report => {
        return `
          <tr>
            <td>${escapeHtml(report.student_name || 'Unknown')}</td>
            <td>${escapeHtml((report.item_description || '').substring(0, 50))}${report.item_description?.length > 50 ? '...' : ''}</td>
            <td>${escapeHtml(report.last_location || 'Not specified')}</td>
            <td><span class="badge badge-${report.status}">${report.status.toUpperCase()}</span></td>
            <td>
              <button class="btn btn-sm btn-info" onclick="viewReportDetails('${report.id}')">View</button>
            </td>
          </tr>
        `;
    }).join('');
}

function renderClaimRequestsTable() {
    const tbody = document.getElementById('claimRequestsTableBody');
    if (!tbody) return;

    // For now, show empty message - claim requests are tracked via item_logs
    tbody.innerHTML = '<tr><td colspan="5" class="no-data">No pending claim requests at this time.</td></tr>';
}

async function approveItemAction(itemId) {
    try {
        console.log('Approving item:', itemId);
        const res = await fetch(`${API_ITEMS_URL}/${itemId}/approve`, { 
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to approve item');
        
        showSuccess('Item approved successfully');
        await fetchItems();
    } catch (error) {
        console.error('Error approving item:', error);
        showError('Failed to approve item: ' + error.message);
    }
}

async function rejectItemAction(itemId) {
    try {
        console.log('Rejecting item:', itemId);
        const res = await fetch(`${API_ITEMS_URL}/${itemId}/reject`, { 
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error('Failed to reject item');
        
        showSuccess('Item rejected successfully');
        await fetchItems();
    } catch (error) {
        console.error('Error rejecting item:', error);
        showError('Failed to reject item: ' + error.message);
    }
}

function viewReportDetails(reportId) {
    const report = lostReports.find(r => r.id === reportId);
    if (!report) return;
    
    console.log('Viewing report:', report);
    alert(`Report from: ${report.student_name}\nEmail: ${report.student_email}\nDescription: ${report.item_description}`);
}

// ==================== SECTION NAVIGATION ====================
function showSection(sectionName) {
    console.log('Switching to section:', sectionName);
    
    // Hide all sections
    document.getElementById('itemManagementSection')?.style.setProperty('display', 'none', 'important');
    document.getElementById('lostItemsSection')?.style.setProperty('display', 'none', 'important');
    document.getElementById('claimRequestsSection')?.style.setProperty('display', 'none', 'important');
    
    // Show selected section
    switch(sectionName) {
        case 'itemManagement':
            document.getElementById('itemManagementSection')?.style.setProperty('display', 'block', 'important');
            break;
        case 'lostItems':
            document.getElementById('lostItemsSection')?.style.setProperty('display', 'block', 'important');
            break;
        case 'claimRequests':
            document.getElementById('claimRequestsSection')?.style.setProperty('display', 'block', 'important');
            break;
    }
}

function setupMobileMenu() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');
    const navLinks = document.querySelectorAll('.nav-link');

    if (!hamburgerBtn || !sidebar || !sidebarOverlay) return;

    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        sidebarOverlay.classList.add('active');
    });

    if (sidebarClose) {
        sidebarClose.addEventListener('click', closeMobileMenu);
    }

    sidebarOverlay.addEventListener('click', closeMobileMenu);
    navLinks.forEach(link => link.addEventListener('click', closeMobileMenu));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMobileMenu();
    });
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
}

// ==================== UTILITIES ====================
function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[tag]));
}

function showError(message) {
    console.error('❌ Error:', message);
    alert(message);
}

function showSuccess(message) {
    console.log('✓ Success:', message);
    alert(message);
}

function openLightbox(src, alt) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightboxImg.alt = alt;
    lightbox.classList.add('active');
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) lightbox.classList.remove('active');
}

// ==================== EVENT LISTENERS ====================
function setupDashboardEventListeners() {
    console.log('⚙️ Setting up dashboard event listeners...');
    
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            console.log('🔄 Refreshing dashboard...');
            await fetchItems();
            await fetchLostReports();
        });
        console.log('✓ Refresh button listener attached');
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        console.log('✓ Found logout button, attaching listener');
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🔐 Logout button clicked');
            handleLogout();
        });
        console.log('✓ Logout button listener attached');
    } else {
        console.warn('⚠️ Logout button not found in DOM');
    }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🔄 Admin Dashboard initializing...');
    
    setupMobileMenu();
    await checkAuthAndRedirect();
    await loadStorageConfig();
    await loadUserProfile();
    setupDashboardEventListeners();
    
    console.log('📂 Loading dashboard data...');
    await fetchItems();
    await fetchLostReports();
    
    console.log('✅ Admin Dashboard ready');
});
