const API_URL = "http://localhost:5000/api/items";

let allItems = [];

// Fetch all items
async function fetchItems() {
  try {
    const res = await fetch(API_URL);
    allItems = await res.json();
    renderApprovedItems();
  } catch (error) {
    console.error('Error fetching items:', error);
  }
}

// Render approved items
function renderApprovedItems() {
  const container = document.getElementById('approvedContainer');
  const filteredItems = allItems.filter(item => item.status === 'approved');
  renderItems(container, filteredItems);
}

// Generic render function
function renderItems(container, items) {
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
      <p class="status approved">Approved</p>
    `;
    container.appendChild(div);
  });
}

// Search functionality
document.getElementById('searchBar').addEventListener('input', function() {
  const query = this.value.toLowerCase();
  const filtered = allItems.filter(item => item.name.toLowerCase().includes(query) && item.status === 'approved');
  renderItems(document.getElementById('approvedContainer'), filtered);
});

// Refresh button
document.getElementById('refreshBtn').addEventListener('click', fetchItems);

// Load on page open
fetchItems();
