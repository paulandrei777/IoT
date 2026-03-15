const API_ITEMS_URL = "http://localhost:5000/api/items";
const API_LOGS_URL = "http://localhost:5000/api/item-logs";

let allItems = [];
let allLogs = [];

// Initialize based on page
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('pendingContainer')) {
        // Dashboard page
        fetchItems();
        setupDashboardEventListeners();
    }
    if (document.getElementById('logs-tbody')) {
        // Audit Logs page
        fetchLogs();
    }
});

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

// Render all dashboard sections
function renderDashboard() {
    updateStatistics();
    renderPendingItems();
    renderApprovedItems();
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
}

// Render items by status
function renderPendingItems(filteredItems = null) {
    const items = filteredItems ? filteredItems.filter(i => i.status === 'pending') : allItems.filter(i => i.status === 'pending');
    const container = document.getElementById('pendingContainer');
    renderItems(container, items, true);
}

function renderApprovedItems(filteredItems = null) {
    const items = filteredItems ? filteredItems.filter(i => i.status === 'approved') : allItems.filter(i => i.status === 'approved');
    const container = document.getElementById('approvedContainer');
    renderApprovedItemsTable(container, items);
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
            <div class="actions" style="margin-top: 12px;">
                <button class="btn btn-primary" onclick="claimItem('${item.id}')">Claim</button>
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
            return 'badge-approved';
        case 'reject':
        case 'rejected':
            return 'badge-rejected';
        case 'claim':
        case 'claimed':
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