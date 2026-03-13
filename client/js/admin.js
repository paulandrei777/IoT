const API_URL = "http://localhost:5000/api/items";

let allItems = [];

// Fetch all items from backend
async function fetchItems() {
  try {
    const res = await fetch(API_URL);
    allItems = await res.json();
    renderDashboard();
  } catch (error) {
    console.error('Error fetching items:', error);
  }
}

// Render all sections
function renderDashboard() {
  updateStatistics();
  renderPendingItems();
  renderApprovedItems();
  renderClaimedItems();
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
function renderPendingItems() {
  const container = document.getElementById('pendingContainer');
  const items = allItems.filter(i => i.status === 'pending');
  renderItems(container, items, true);
}

function renderApprovedItems() {
  const container = document.getElementById('approvedContainer');
  const items = allItems.filter(i => i.status === 'approved');
  renderItems(container, items, false);
}

function renderClaimedItems() {
  const container = document.getElementById('claimedContainer');
  const items = allItems.filter(i => i.status === 'claimed');
  renderItems(container, items, false);
}

// Generic render function
function renderItems(container, items, showButtons = false) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<p>No items available</p>';
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item-card';
    const date = new Date(item.created_at).toLocaleString();
    div.innerHTML = `
      <img src="${item.image_url}" alt="${item.name}" width="120">
      <h3>${item.name}</h3>
      <p>Date Detected: ${date}</p>
      <p class="status ${item.status}">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</p>
      ${showButtons ? `
        <button onclick="approveItem('${item.id}')">Approve</button>
        <button onclick="rejectItem('${item.id}')">Reject</button>
      ` : ''}
    `;
    container.appendChild(div);
  });
}

// Approve item
async function approveItem(id) {
  try {
    await fetch(`${API_URL}/${id}/approve`, { method: 'PATCH' });
    const item = allItems.find(i => i.id === id);
    if (item) item.status = 'approved';
    renderDashboard();
  } catch (error) {
    console.error('Error approving item:', error);
  }
}

// Reject item
async function rejectItem(id) {
  try {
    await fetch(`${API_URL}/${id}/reject`, { method: 'PATCH' });
    const item = allItems.find(i => i.id === id);
    if (item) item.status = 'rejected';
    renderDashboard();
  } catch (error) {
    console.error('Error rejecting item:', error);
  }
}

// Search functionality
document.getElementById('searchBar').addEventListener('input', function() {
  const query = this.value.toLowerCase();
  const filtered = allItems.filter(item => item.name.toLowerCase().includes(query));
  renderPendingItemsFiltered(filtered);
  renderApprovedItemsFiltered(filtered);
  renderClaimedItemsFiltered(filtered);
});

function renderPendingItemsFiltered(filtered) {
  const container = document.getElementById('pendingContainer');
  renderItems(container, filtered.filter(i => i.status === 'pending'), true);
}

function renderApprovedItemsFiltered(filtered) {
  const container = document.getElementById('approvedContainer');
  renderItems(container, filtered.filter(i => i.status === 'approved'), false);
}

function renderClaimedItemsFiltered(filtered) {
  const container = document.getElementById('claimedContainer');
  renderItems(container, filtered.filter(i => i.status === 'claimed'), false);
}

// Refresh button
document.getElementById('refreshBtn').addEventListener('click', fetchItems);

// Load items on page load
fetchItems();