const API_URL = "http://localhost:5000/api/items";
const container = document.getElementById("itemsContainer");

// Fetch all items
async function fetchItems() {
  const res = await fetch(API_URL);
  const items = await res.json();

  container.innerHTML = "";

  items
    .filter(item => item.status === "pending")
    .forEach(item => {
      const div = document.createElement("div");
      div.innerHTML = `
        <h3>${item.name}</h3>
        <img src="${item.image_url}" width="200"/>
        <p>Status: ${item.status}</p>
        <button onclick="approveItem('${item.id}')">Approve</button>
        <button onclick="rejectItem('${item.id}')">Reject</button>
        <hr/>
      `;
      container.appendChild(div);
    });
}

// Approve
async function approveItem(id) {
  await fetch(`${API_URL}/${id}/approve`, {
    method: "PATCH"
  });

  fetchItems();
}

// Reject
async function rejectItem(id) {
  await fetch(`${API_URL}/${id}/reject`, {
    method: "PATCH"
  });

  fetchItems();
}

// Load on page open
fetchItems();