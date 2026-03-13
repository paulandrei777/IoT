const API_URL = "http://localhost:5000/api/items";

let allItems = [];

// Fetch all items
async function fetchItems() {
  try {
    const res = await fetch(API_URL);
    allItems = await res.json();
    renderDashboard();
  } catch (error) {
    console.error('Error fetching items:', error);
  }
}

// Render the entire dashboard
function renderDashboard() {
  updateStatistics();
  renderPendingItems();
  renderApprovedItems();
  renderClaimedItems();
}

// Update statistics
function updateStatistics() {
  const total = allItems.length;
  const pending = allItems.filter(item => item.status === 'pending').length;
  const approved = allItems.filter(item => item.status === 'approved').length;
  const claimed = allItems.filter(item => item.status === 'claimed').length;

  document.getElementById('totalItems').textContent = total;
  document.getElementById('pendingItems').textContent = pending;
  document.getElementById('approvedItems').textContent = approved;
  document.getElementById('claimedItems').textContent = claimed;
}

// Render pending items
function renderPendingItems() {
  const container = document.getElementById('pendingContainer');
  const filteredItems = allItems.filter(item => item.status === 'pending');
  renderItems(container, filteredItems, true);
}

// Render approved items
function renderApprovedItems() {
  const container = document.getElementById('approvedContainer');
  const filteredItems = allItems.filter(item => item.status === 'approved');
  renderItems(container, filteredItems, false);
}

// Render claimed items
function renderClaimedItems() {
  const container = document.getElementById('claimedContainer');
  const filteredItems = allItems.filter(item => item.status === 'claimed');
  renderItems(container, filteredItems, false);
}

// Generic render function
function renderItems(container, items, showButtons = false) {
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p>No items available</p>';
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item-card';
    const date = new Date(item.created_at).toLocaleDateString();
    div.innerHTML = `
      <img src="${item.image_url}" alt="${item.name}">
      <h3>${item.name}</h3>
      <p>Date Detected: ${date}</p>
      <p class="status ${item.status}">${item.status.charAt(0).toUpperCase() + item.status.slice(1)}</p>
      ${showButtons ? `<button class="approve-btn" onclick="approveItem('${item.id}')">Approve</button>
                      <button class="reject-btn" onclick="rejectItem('${item.id}')">Reject</button>` : ''}
    `;
    container.appendChild(div);
  });
}

// Approve item
async function approveItem(id) {
  try {
    await fetch(`${API_URL}/${id}/approve`, { method: 'PATCH' });
    // Update local
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
    // Update local
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
  // For simplicity, render all sections with filtered items, but only if they match status
  // Actually, better to filter per section
  renderPendingItemsFiltered(filtered);
  renderApprovedItemsFiltered(filtered);
  renderClaimedItemsFiltered(filtered);
});

function renderPendingItemsFiltered(filtered) {
  const container = document.getElementById('pendingContainer');
  const items = filtered.filter(item => item.status === 'pending');
  renderItems(container, items, true);
}

function renderApprovedItemsFiltered(filtered) {
  const container = document.getElementById('approvedContainer');
  const items = filtered.filter(item => item.status === 'approved');
  renderItems(container, items, false);
}

function renderClaimedItemsFiltered(filtered) {
  const container = document.getElementById('claimedContainer');
  const items = filtered.filter(item => item.status === 'claimed');
  renderItems(container, items, false);
}

// Refresh button
document.getElementById('refreshBtn').addEventListener('click', fetchItems);

// Load on page open
fetchItems();