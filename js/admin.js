const API_ITEMS_URL = "https://iot-production-17b1.up.railway.app/api/items";
const API_LOST_REPORTS_URL = "https://iot-production-17b1.up.railway.app/api/items/lost-reports";
const API_LOGS_URL = "https://iot-production-17b1.up.railway.app/api/item-logs";

let allItems = [];
let lostReports = [];
let DEFAULT_IMAGE_URL = null;

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

async function fetchItems() {
    try {
        const res = await fetch(API_ITEMS_URL);
        if (!res.ok) throw new Error('Failed to fetch items');
        allItems = await res.json();
        renderAdminDashboard();
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
        renderAdminDashboard();
    } catch (error) {
        console.error('Error fetching lost reports:', error);
        showError('Failed to load reports. Please try again.');
    }
}

async function fetchLogs() {
    try {
        const response = await fetch(API_LOGS_URL);
        if (!response.ok) throw new Error('Failed to fetch logs');
        const logs = await response.json();
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        displayLogs(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        const tbody = document.getElementById('logs-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="5">Error loading logs. Please refresh the page.</td></tr>';
    }
}

function renderAdminDashboard() {
    updateStatistics();
    renderVerificationHub();
}

function updateStatistics() {
    const totalItems = allItems.length;
    const pendingReports = lostReports.filter(report => report.status === 'pending').length;
    const matchedReports = lostReports.filter(report => report.status === 'matched').length;

    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('pendingReports').textContent = pendingReports;
    document.getElementById('matchedReports').textContent = matchedReports;
}

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

        await fetchItems();
        await fetchLostReports();
        showSuccess('Match approved and item claimed successfully.');
    } catch (error) {
        console.error('Error approving match:', error);
        showError(error.message || 'Failed to approve match.');
    }
}

async function rejectMatch(reportId) {
    try {
        const response = await fetch(`${API_LOST_REPORTS_URL}/${reportId}/reject-match`, { method: 'PATCH' });
        if (!response.ok) throw new Error('Failed to reject match');

        await fetchLostReports();
        showSuccess('Match rejected and report reset to searching.');
    } catch (error) {
        console.error('Error rejecting match:', error);
        showError(error.message || 'Failed to reject match.');
    }
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[tag]));
}

function showError(message) {
    alert(message);
}

function showSuccess(message) {
    alert(message);
}

function setupDashboardEventListeners() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchItems();
            fetchLostReports();
        });
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

async function loadUserProfile() {
    try {
        const { data } = await supabaseClient.auth.getSession();
        const session = data?.session;
        if (!session?.user?.id) return;

        const profile = await getProfile(session.user.id);
        document.getElementById('userName').textContent = profile.full_name || 'Unknown';
        document.getElementById('userEmail').textContent = profile.email || 'No email';
        document.getElementById('userRole').textContent = profile.role || 'No role';

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => await logout());
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        window.location.href = loginPagePath();
    }
}

function displayLogs(logs) {
    const tbody = document.getElementById('logs-tbody');
    const noLogs = document.getElementById('no-logs');

    if (!tbody) return;
    if (!logs || !logs.length) {
        tbody.innerHTML = '';
        if (noLogs) noLogs.style.display = 'block';
        return;
    }

    if (noLogs) noLogs.style.display = 'none';
    tbody.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp);
        const formattedDate = date.toLocaleString();
        const badgeClass = getBadgeClass(log.action);

        return `
            <tr>
                <td>${escapeHtml(log.id)}</td>
                <td>${escapeHtml(log.item_id)}</td>
                <td><span class="badge ${badgeClass}">${escapeHtml(capitalize(log.action))}</span></td>
                <td>${escapeHtml(log.performed_by)}</td>
                <td class="timestamp">${formattedDate}</td>
            </tr>
        `;
    }).join('');
}

function getBadgeClass(action) {
    switch ((action || '').toLowerCase()) {
        case 'approve':
        case 'approved':
        case 'claim_approved':
            return 'badge-approved';
        case 'reject':
        case 'rejected':
        case 'claim_rejected':
            return 'badge-rejected';
        case 'claim':
        case 'claimed':
        case 'claim_requested':
            return 'badge-claimed';
        default:
            return '';
    }
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
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

document.addEventListener('DOMContentLoaded', async function() {
    setupMobileMenu();
    await checkAuthAndRedirect();
    await loadUserProfile();
    await loadStorageConfig();

    if (document.getElementById('verificationContainer')) {
        setupDashboardEventListeners();
        await fetchItems();
        await fetchLostReports();
    }

    if (document.getElementById('logs-tbody')) {
        await fetchLogs();
    }
});
