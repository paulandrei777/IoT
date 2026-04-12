const API_URL = "http://localhost:5000/api/items";

let allItems = [];

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

// Render approved/claimed items
function renderApprovedItems() {
  const container = document.getElementById('approvedContainer');
  const filteredItems = allItems.filter(item => ['approved', 'claimed'].includes(item.status));
  renderItems(container, filteredItems);
}

// Generic render function
function renderItems(container, items) {
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 20px; color: var(--gray-600);">No items available</p>';
    return;
  }
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item-card';
    const date = new Date(item.created_at).toLocaleDateString();
    const isClaimed = item.status === 'claimed';
    const statusText = isClaimed ? 'Claimed' : 'Approved';
    const statusClass = `status-${item.status}`;
    const buttonText = isClaimed ? 'Claimed' : 'Claim Item';
    const buttonDisabled = isClaimed ? 'disabled' : '';

    div.innerHTML = `
      <img src="${item.image_url}" alt="${item.name}" onclick="openImageModal('${item.image_url}', '${item.name}')">
      <h3>${item.name}</h3>
      <p>Date Detected: ${date}</p>
      <span class="status ${statusClass}">${statusText}</span>
      <button class="claim-btn" ${buttonDisabled} onclick="openClaimModal('${item.id}')">${buttonText}</button>
    `;
    container.appendChild(div);
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

// Search functionality
document.getElementById('searchBar').addEventListener('input', function() {
  const query = this.value.toLowerCase();
  const filtered = allItems.filter(item => item.name.toLowerCase().includes(query) && ['approved', 'claimed'].includes(item.status));
  renderItems(document.getElementById('approvedContainer'), filtered);
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

// Load on page open
loadUserProfile();
fetchItems();