const API_ITEMS_URL = "http://localhost:5000/api/items";
const API_LOGS_URL = "http://localhost:5000/api/item-logs";

let allItems = [];
let allLogs = [];
let claimRequests = [];

// Initialize based on page
document.addEventListener('DOMContentLoaded', function() {
    // Initialize mobile menu on all admin pages
    setupMobileMenu();
    loadUserProfile();

    if (document.getElementById('pendingContainer')) {
        // Dashboard page
        setupTabSwitching(); // Initialize tab switching
        fetchItems();
        fetchClaimRequests();
        setupDashboardEventListeners();
        // Poll for updates every 30 seconds
        setInterval(() => {
            fetchItems();
            fetchClaimRequests();
        }, 30000);
    }
    if (document.getElementById('logs-tbody')) {
        // Audit Logs page
        fetchLogs();
    }
});

// Setup mobile hamburger menu
function setupMobileMenu() {
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebar = document.getElementById('sidebar');
    const navLinks = document.querySelectorAll('.nav-link');

    // Only setup if hamburger exists (mobile layout)
    if (hamburgerBtn && sidebar && sidebarOverlay) {
        // Open sidebar
        hamburgerBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('active');
        });

        // Close sidebar button
        if (sidebarClose) {
            sidebarClose.addEventListener('click', () => {
                closeMobileMenu();
            });
        }

        // Close on overlay click
        sidebarOverlay.addEventListener('click', () => {
            closeMobileMenu();
        });

        // Close on nav link click
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                closeMobileMenu();
            });
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMobileMenu();
            }
        });
    }
}

// Close mobile menu
function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
}

// Fetch all items from backend
async function fetchItems() {
    try {
        const res = await fetch(API_ITEMS_URL);
        if (!res.ok) throw new Error('Failed to fetch items');
        allItems = await res.json();
        renderDashboard();
    } catch (error) {
        console.error('Error fetching items:', error);
        showError('Failed to load items. Please try again.');
    }
}

// Fetch all logs from backend
async function fetchLogs() {
    try {
        const response = await fetch(API_LOGS_URL);
        if (!response.ok) throw new Error('Failed to fetch logs');
        allLogs = await response.json();

        // Sort by timestamp descending (newest first)
        allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        displayLogs(allLogs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        const tbody = document.getElementById('logs-tbody');
        tbody.innerHTML = '<tr><td colspan="5">Error loading logs. Please refresh the page.</td></tr>';
    }
}

// Load user profile
async function loadUserProfile() {
    try {
        const { data } = await supabaseClient.auth.getSession();
        const session = data?.session;
        if (!session?.user?.id) {
            window.location.href = loginPagePath();
            return;
        }

        const profile = await getProfile(session.user.id);

        // Role-based access control
        if (profile.role !== 'admin') {
            window.location.href = studentDashboardPath();
            return;
        }

        document.getElementById('userName').textContent = profile.full_name || 'Unknown';
        document.getElementById('userEmail').textContent = profile.email || 'No email';
        document.getElementById('userRole').textContent = profile.role || 'No role';

        // Attach logout handler
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await logout();
            });
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
        window.location.href = loginPagePath();
    }
}

// Fetch claim requests
async function fetchClaimRequests() {
    try {
        const response = await fetch(`${API_ITEMS_URL}/claim-requests`);
        if (!response.ok) throw new Error('Failed to fetch claim requests');
        claimRequests = await response.json();
        renderClaimRequests();
    } catch (error) {
        console.error('Error fetching claim requests:', error);
        const container = document.getElementById('claimRequestsContainer');
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--gray-600);">Error loading claim requests. Please refresh the page.</p>';
    }
}

// Render all dashboard sections
function renderDashboard() {
    clearAllContainers(); // Clear containers before rendering to prevent duplication
    updateStatistics();
    renderPendingItems();
    renderApprovedItems();
    renderClaimedItems();
}

// Clear all item containers to prevent content stacking/duplication
function clearAllContainers() {
    const pendingContainer = document.getElementById('pendingContainer');
    const approvedContainer = document.getElementById('approvedContainer');
    const claimedContainer = document.getElementById('claimedContainer');

    if (pendingContainer) pendingContainer.innerHTML = '';
    if (approvedContainer) approvedContainer.innerHTML = '';
    if (claimedContainer) claimedContainer.innerHTML = '';
}

// Update dashboard statistics
function updateStatistics() {
    const total = allItems.length;
    const pending = allItems.filter(i => i.status === 'pending').length;
    const approved = allItems.filter(i => i.status === 'approved').length;
    const claimed = allItems.filter(i => i.status === 'claimed').length;

    document.getElementById('totalItems').textContent = total;
    document.getElementById('pendingItems').textContent = pending;
    document.getElementById('approvedItems').textContent = approved;
    document.getElementById('claimedItems').textContent = claimed;

    // Update tab counts
    document.getElementById('pending-count').textContent = pending;
    document.getElementById('approved-count').textContent = approved;
    document.getElementById('claimed-count').textContent = claimed;
}

// Setup tab switching functionality
function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            // Remove active class from all buttons and panes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // Add active class to clicked button and corresponding pane
            button.classList.add('active');
            const activePane = document.getElementById(`${tabName}-tab`);
            if (activePane) {
                activePane.classList.add('active');
                
                // Clear and render the tab content
                clearAndRenderTab(tabName);
            }
            
            // Close mobile menu if open
            closeMobileMenu();
        });
    });
}

// Clear container and render tab content based on status
function clearAndRenderTab(status) {
    let container;
    
    if (status === 'pending') {
        container = document.getElementById('pendingContainer');
        if (container) {
            container.innerHTML = '';
            renderPendingItems();
        }
    } else if (status === 'approved') {
        container = document.getElementById('approvedContainer');
        if (container) {
            container.innerHTML = '';
            renderApprovedItems();
        }
    } else if (status === 'claimed') {
        container = document.getElementById('claimedContainer');
        if (container) {
            container.innerHTML = '';
            renderClaimedItems();
        }
    }
}

// Show empty state message for a container
function showEmptyState(container, icon, title, message) {
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas ${icon}"></i>
            <h3>${title}</h3>
            <p>${message}</p>
        </div>
    `;
}

// Render items by status
function renderPendingItems(filteredItems = null) {
    const items = filteredItems ? filteredItems.filter(i => i.status === 'pending') : allItems.filter(i => i.status === 'pending');
    const container = document.getElementById('pendingContainer');
    
    if (!items || items.length === 0) {
        showEmptyState(container, 'fa-inbox', 'No Pending Items', 'No items waiting for approval at the moment.');
        return;
    }
    
    renderItems(container, items, true);
}

function renderApprovedItems(filteredItems = null) {
    const items = filteredItems ? filteredItems.filter(i => i.status === 'approved') : allItems.filter(i => i.status === 'approved');
    const container = document.getElementById('approvedContainer');
    
    if (!items || items.length === 0) {
        showEmptyState(container, 'fa-check', 'No Approved Items', 'No items have been approved yet.');
        return;
    }
    
    renderApprovedItemsTable(container, items);
}

// Render claimed items
function renderClaimedItems() {
    const items = allItems.filter(i => i.status === 'claimed');
    const container = document.getElementById('claimedContainer');
    
    if (!items || items.length === 0) {
        showEmptyState(container, 'fa-check-double', 'No Claimed Items', 'No items have been claimed yet.');
        return;
    }
    
    renderClaimedItemsTable(container, items);
}

// Render claim requests
function renderClaimRequests() {
    const container = document.getElementById('claimRequestsContainer');
    container.innerHTML = '';

    if (!claimRequests.length) {
        showEmptyState(container, 'fa-list-check', 'No Pending Requests', 'All claim requests have been processed.');
        return;
    }

    const table = document.createElement('table');
    table.className = 'admin-table claim-requests-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>Request ID</th>
            <th>Item Name</th>
            <th>Student Email</th>
            <th>Pickup Notes</th>
            <th>Date / Time</th>
            <th>Actions</th>
        </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    claimRequests.forEach(request => {
        const row = document.createElement('tr');
        const date = new Date(request.timestamp).toLocaleString();

        row.innerHTML = `
            <td>${request.id}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${getItemImage(request.item_id)}" alt="${request.item_name}" class="table-thumbnail" onclick="openLightbox('${getItemImage(request.item_id)}', '${request.item_name}')" onerror="this.src='../uploads/default.png'">
                    ${request.item_name}
                </div>
            </td>
            <td>${request.student_email}</td>
            <td>${request.pickup_notes || 'None'}</td>
            <td>${date}</td>
            <td>
                <div class="actions">
                    <button class="btn btn-success" onclick="approveClaim('${request.item_id}')">Approve</button>
                    <button class="btn btn-danger" onclick="rejectClaim('${request.item_id}')">Reject</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
    table.appendChild(tbody);

    container.appendChild(table);
}

// Helper function to get item image
function getItemImage(itemId) {
    const item = allItems.find(i => i.id === itemId);
    return item ? item.image_url : '../uploads/default.png';
}

// Generic render function for pending items
function renderItems(container, items, showButtons = false) {
    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--gray-600);">No items available</p>';
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'item-card';
        const date = new Date(item.created_at).toLocaleString();
        div.innerHTML = `
            <img src="${item.image_url}" alt="${item.name}" onerror="this.src='../uploads/default.png'">
            <h3>${item.name}</h3>
            <p>Date Detected: ${date}</p>
            <span class="status status-${item.status}">${capitalize(item.status)}</span>
            ${showButtons ? `
                <div class="actions">
                    <button class="btn btn-success" onclick="approveItem('${item.id}')">Approve</button>
                    <button class="btn btn-danger" onclick="rejectItem('${item.id}')">Reject</button>
                </div>
            ` : ''}
        `;
        container.appendChild(div);
    });
}

// Render approved items in table format
function renderApprovedItemsTable(container, items) {
    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--gray-600);">No approved items available</p>';
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'approved-item';
        const date = new Date(item.created_at).toLocaleDateString();
        div.innerHTML = `
            <img src="${item.image_url}" alt="${item.name}" onclick="openLightbox('${item.image_url}', '${item.name}')" onerror="this.src='../uploads/default.png'">
            <h4>${item.name}</h4>
            <p>Approved: ${date}</p>
            <span class="status status-approved">Approved</span>
        `;
        container.appendChild(div);
    });
}

// Render claimed items in card format
function renderClaimedItemsTable(container, items) {
    container.innerHTML = '';
    if (!items.length) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--gray-600);">No claimed items available</p>';
        return;
    }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'claimed-item';
        const claimedBy = item.claimed_by || 'Unknown';
        const dateClaimed = item.claimed_date ? new Date(item.claimed_date).toLocaleDateString() : new Date(item.created_at).toLocaleDateString();
        div.innerHTML = `
            <img src="${item.image_url}" alt="${item.name}" onclick="openLightbox('${item.image_url}', '${item.name}')" onerror="this.src='../uploads/default.png'">
            <div>
                <h4>${item.name}</h4>
                <p>Claimed by: ${claimedBy}</p>
                <p>Date: ${dateClaimed}</p>
                <span class="status status-claimed">Claimed</span>
            </div>
        `;
        container.appendChild(div);
    });
}

// Action handlers
async function approveItem(id) {
    await performAction(id, 'approve', 'approved');
}

async function rejectItem(id) {
    await performAction(id, 'reject', 'rejected');
}

async function claimItem(id) {
    await performAction(id, 'claim', 'claimed');
}

async function performAction(id, action, newStatus) {
    try {
        const res = await fetch(`${API_ITEMS_URL}/${id}/${action}`, { method: 'PATCH' });
        if (!res.ok) throw new Error(`Failed to ${action} item`);

        // Update local item status
        const item = allItems.find(i => i.id === id);
        if (item) item.status = newStatus;

        // Log the action
        await logAction(id, action);

        // Re-render dashboard
        renderDashboard();

        // If on audit logs page, refresh logs
        if (document.getElementById('logs-tbody')) {
            fetchLogs();
        }

    } catch (error) {
        console.error(`Error ${action}ing item:`, error);
        showError(`Failed to ${action} item. Please try again.`);
    }
}

// Approve claim request
async function approveClaim(id) {
    await performClaimAction(id, 'approve-claim', 'Claim approved successfully');
}

// Reject claim request
async function rejectClaim(id) {
    await performClaimAction(id, 'reject-claim', 'Claim rejected successfully');
}

async function performClaimAction(id, action, successMessage) {
    try {
        const res = await fetch(`${API_ITEMS_URL}/${id}/${action}`, { method: 'PATCH' });
        if (!res.ok) throw new Error(`Failed to ${action.replace('-', ' ')} claim`);

        // Refresh items and claim requests
        await fetchItems();
        await fetchClaimRequests();

        // If on audit logs page, refresh logs
        if (document.getElementById('logs-tbody')) {
            fetchLogs();
        }

        showSuccess(successMessage);

    } catch (error) {
        console.error(`Error ${action}ing claim:`, error);
        showError(`Failed to ${action.replace('-', ' ')} claim. Please try again.`);
    }
}

// Log action to audit logs
async function logAction(itemId, action) {
    try {
        const logData = {
            item_id: itemId,
            action: action,
            performed_by: 'Admin', // TODO: Get from authentication
            timestamp: new Date().toISOString()
        };

        const res = await fetch(API_LOGS_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(logData)
        });

        if (!res.ok) throw new Error('Failed to log action');

    } catch (error) {
        console.error('Error logging action:', error);
        // Don't show error to user for logging failure, just log to console
    }
}

// Display logs
function displayLogs(logs) {
    const tbody = document.getElementById('logs-tbody');
    const noLogs = document.getElementById('no-logs');

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '';
        noLogs.style.display = 'block';
        return;
    }

    noLogs.style.display = 'none';

    tbody.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp);
        const formattedDate = date.toLocaleString();
        const badgeClass = getBadgeClass(log.action);

        return `
            <tr>
                <td>${log.id}</td>
                <td>${log.item_id}</td>
                <td><span class="badge ${badgeClass}">${capitalize(log.action)}</span></td>
                <td>${log.performed_by}</td>
                <td class="timestamp">${formattedDate}</td>
            </tr>
        `;
    }).join('');
}

// Setup dashboard event listeners
function setupDashboardEventListeners() {
    // Global search functionality
    const searchBar = document.getElementById('searchBar');
    if (searchBar) {
        searchBar.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            const filtered = allItems.filter(item =>
                item.name.toLowerCase().includes(query) &&
                (item.status === 'pending' || item.status === 'approved')
            );
            renderPendingItems(filtered);
            renderApprovedItems(filtered);
        });
    }

    // Approved items specific search
    const approvedSearchBar = document.getElementById('approvedSearchBar');
    if (approvedSearchBar) {
        approvedSearchBar.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            const filtered = allItems.filter(item =>
                item.name.toLowerCase().includes(query) &&
                item.status === 'approved'
            );
            renderApprovedItems(filtered);
        });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', fetchItems);
    }
}

// Lightbox functions
function openLightbox(src, alt) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = src;
    lightboxImg.alt = alt;
    lightbox.classList.add('active');
}

function closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('active');
}

// Close lightbox on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeLightbox();
    }
});

// Utility functions
function getBadgeClass(action) {
    switch (action.toLowerCase()) {
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
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showError(message) {
    // Simple error display - could be enhanced with a toast notification
    alert(message);
}

function showSuccess(message) {
    // Simple success display - could be enhanced with a toast notification
    alert(message);
}