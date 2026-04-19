const API_URL = "http://localhost:5000/api/items";

let allItems = [];
let activeItems = [];
let claimedItems = [];

// Modal state
const claimModal = document.getElementById('claimModal');
const claimModalItemName = document.getElementById('claimModalItemName');
const studentEmailInput = document.getElementById('studentEmail');
const pickupNotesTextarea = document.getElementById('pickupNotes');
const claimModalMessage = document.getElementById('claimModalMessage');
const requestClaimBtn = document.getElementById('requestClaimBtn');
let activeItemId = null;

// Image Modal state
const imageModal = document.getElementById('imageModal');
const imageModalImg = document.getElementById('imageModalImg');

// Sidebar toggle state
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');

// Navigation state
let currentSection = 'dashboard';

// Fetch all items and categorize them
async function fetchItems() {
  try {
    const res = await fetch(API_URL);
    allItems = await res.json();

    // Categorize items
    activeItems = allItems.filter(item => item.status === 'approved');
    claimedItems = allItems.filter(item => item.status === 'claimed');

    renderActiveItems();
    renderClaimedItems();
  } catch (error) {
    console.error('Error fetching items:', error);
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
        if (profile.role !== 'student') {
            window.location.href = adminDashboardPath();
            return;
        }

        // Update dashboard welcome
        document.getElementById('userName').textContent = profile.full_name || 'Unknown';

        // Update settings profile info
        document.getElementById('settingsFullName').textContent = profile.full_name || 'Unknown';
        document.getElementById('settingsEmail').textContent = profile.email || 'No email';
        document.getElementById('settingsRole').textContent = profile.role || 'No role';

        // Attach logout handlers
        const logoutBtns = document.querySelectorAll('#logoutBtn, #settingsLogoutBtn');
        logoutBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                await logout();
            });
        });
    } catch (error) {
        console.error('Error loading user profile:', error);
        window.location.href = loginPagePath();
    }
}

// Render active items
function renderActiveItems(searchQuery = '') {
  const container = document.getElementById('activeItemsContainer');
  const filteredItems = activeItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  renderItems(container, filteredItems, 'active');
}

// Render claimed items
function renderClaimedItems(searchQuery = '') {
  const container = document.getElementById('claimedItemsContainer');
  const filteredItems = claimedItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  renderItems(container, filteredItems, 'claimed');
}

// Generic render function
function renderItems(container, items, type = 'active') {
  container.innerHTML = '';
  if (items.length === 0) {
    const message = type === 'active' ? 'No active items available' : 'No claimed items found';
    container.innerHTML = `<p style="text-align: center; padding: 40px; color: var(--gray-600); font-style: italic;">${message}</p>`;
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item-card';
    const date = new Date(item.created_at).toLocaleDateString();
    const isClaimed = item.status === 'claimed';
    const statusText = isClaimed ? 'Claimed' : 'Available';
    const statusClass = `status-${item.status}`;
    const buttonText = isClaimed ? 'Claimed' : 'Claim Item';
    const buttonDisabled = isClaimed ? 'disabled' : '';

    div.innerHTML = `
      <div class="item-card-head">
        <span class="item-status-badge ${item.status}">${statusText}</span>
      </div>
      <img src="${item.image_url}" alt="${item.name}" onclick="openImageModal('${item.image_url}', '${item.name}')">
      <h3>${item.name}</h3>
      <p>Date Detected: ${date}</p>
      <span class="status ${statusClass}">${statusText}</span>
      <button class="claim-btn" ${buttonDisabled} onclick="openClaimModal('${item.id}')">${buttonText}</button>
    `;
    container.appendChild(div);
  });
}

// Navigation functions
function switchSection(sectionName) {
  // Update navigation
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

  // Update content sections
  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(`${sectionName}-section`).classList.add('active');

  currentSection = sectionName;
}

// Initialize navigation
function openSidebar() {
  document.querySelector('.dashboard-container').classList.add('sidebar-open');
}

function closeSidebar() {
  document.querySelector('.dashboard-container').classList.remove('sidebar-open');
}

function toggleSidebar() {
  document.querySelector('.dashboard-container').classList.toggle('sidebar-open');
}

function initNavigation() {
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      switchSection(section);
      closeSidebar();
    });
  });

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeSidebar);
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeSidebar();
    }
  });
}

// Open claim request modal
function openClaimModal(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  activeItemId = id;
  claimModalItemName.textContent = item.name;
  studentEmailInput.value = localStorage.getItem('studentEmail') || '';
  pickupNotesTextarea.value = '';
  setModalMessage('');

  claimModal.classList.add('open');
  claimModal.setAttribute('aria-hidden', 'false');

  // Focus the email input when modal opens
  setTimeout(() => studentEmailInput.focus(), 0);
}

function closeClaimModal() {
  activeItemId = null;
  claimModal.classList.remove('open');
  claimModal.setAttribute('aria-hidden', 'true');
  setModalMessage('');
}

function setModalMessage(message, type = 'info') {
  claimModalMessage.textContent = message;
  claimModalMessage.className = 'modal-message';
  if (message) claimModalMessage.classList.add(`modal-message--${type}`);
}

async function requestClaim() {
  if (!activeItemId) return;

  const studentEmail = studentEmailInput.value.trim();
  const pickupNotes = pickupNotesTextarea.value.trim();

  // Validate required email
  if (!studentEmail) {
    setModalMessage('Please enter your email to request claiming the item.', 'error');
    studentEmailInput.focus();
    return;
  }

  requestClaimBtn.disabled = true;
  requestClaimBtn.textContent = 'Submitting...';
  setModalMessage('', 'info');

  try {
    const res = await fetch(`${API_URL}/${activeItemId}/claim-request`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentEmail, pickupNotes }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(errorText || 'Failed to submit claim request');
    }

    // Store email for future use
    localStorage.setItem('studentEmail', studentEmail);

    // Show success message
    setModalMessage('Claim request submitted. Admin will review it.', 'success');

    // Close modal after 1-2 seconds
    setTimeout(() => {
      closeClaimModal();
    }, 1500);
  } catch (error) {
    console.error('Error submitting claim request:', error);
    setModalMessage('Unable to submit claim request. Please try again.', 'error');
  } finally {
    requestClaimBtn.disabled = false;
    requestClaimBtn.textContent = 'Request Claim';
  }
}

// Image Modal Functions
function openImageModal(imageUrl, altText) {
  imageModalImg.src = imageUrl;
  imageModalImg.alt = altText;
  imageModalImg.classList.remove('zoomed');
  imageModal.classList.add('open');
  imageModal.setAttribute('aria-hidden', 'false');
}

function closeImageModal() {
  imageModal.classList.remove('open');
  imageModal.setAttribute('aria-hidden', 'true');
}

function toggleZoom() {
  imageModalImg.classList.toggle('zoomed');
}

// Search functionality for active items
document.getElementById('searchBar').addEventListener('input', function() {
  const query = this.value;
  renderActiveItems(query);
});

// Search functionality for claimed items
document.getElementById('claimedSearchBar').addEventListener('input', function() {
  const query = this.value;
  renderClaimedItems(query);
});

// Modal close & confirm
[...document.querySelectorAll('[data-close-modal]')].forEach(el => el.addEventListener('click', closeClaimModal));
claimModal.addEventListener('keydown', e => { if (e.key === 'Escape') closeClaimModal(); });
requestClaimBtn.addEventListener('click', requestClaim);

// Refresh button
document.getElementById('refreshBtn').addEventListener('click', fetchItems);

// Image Modal Events
[...document.querySelectorAll('[data-close-image-modal]')].forEach(el => el.addEventListener('click', closeImageModal));
imageModal.addEventListener('keydown', e => { if (e.key === 'Escape') closeImageModal(); });
imageModalImg.addEventListener('click', toggleZoom);

// Initialize app
initNavigation();
loadUserProfile();
fetchItems();