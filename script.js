// script.js - Fridgie.com frontend logic (separate file)

const leftovers = [];
const packaged = [];
const veggies = [];
const fruits = [];

const mockBarcodeDB = {
  "8901234567890": { name: "butter", shelf_life_days: 60 },
  "8909876543210": { name: "cheddar cheese", shelf_life_days: 40 },
  "0123456789012": { name: "milk pack", shelf_life_days: 7 },
  "1112223334445": { name: "instant noodles", shelf_life_days: 365 }
};

const recipes = [
  { name: "Veg Fried Rice", ingredients: ["rice","carrot","peas","onion"], img: "https://cdn-icons-png.flaticon.com/512/590/590836.png", difficulty:"Easy" },
  { name: "Chapati Rolls", ingredients: ["chapati","paneer","onion"], img: "https://cdn-icons-png.flaticon.com/512/706/706195.png", difficulty:"Moderate" },
  { name: "Paneer Curry", ingredients: ["paneer","tomato","onion"], img: "https://cdn-icons-png.flaticon.com/512/859/859270.png", difficulty:"Moderate" },
  { name: "Dal Fry", ingredients: ["dal","onion","tomato"], img: "https://cdn-icons-png.flaticon.com/512/706/706164.png", difficulty:"Easy" },
  { name: "Veg Soup", ingredients: ["carrot","peas","corn"], img: "https://cdn-icons-png.flaticon.com/512/706/706172.png", difficulty:"Easy" },
  { name: "Mixed Veg Curry", ingredients: ["carrot","potato","peas","onion"], img: "https://cdn-icons-png.flaticon.com/512/3075/3075977.png", difficulty:"Hard" }
];

// --- Login ---
function login() {
  const user = document.getElementById("username").value.trim();
  const pass = document.getElementById("password").value.trim();
  const status = document.getElementById("loginStatus");
  if (user && pass) {
    document.getElementById("loginPage").style.display = "none";
    document.getElementById("mainPage").style.display = "block";
    updateRecipes();
  } else {
    status.textContent = "Please enter username and password.";
  }
}

// --- Table utilities ---
function updateTable(tableId, arr, keys) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = "";
  arr.forEach((item, index) => {
    const tr = document.createElement("tr");
    keys.forEach(k => {
      let val = item[k];
      if (val instanceof Date) val = val.toDateString();
      // if expiry stored as ISO string, try to format
      if (typeof val === "string" && k === "expiry") {
        const d = new Date(val);
        if (!isNaN(d)) val = d.toDateString();
      }
      tr.innerHTML += `<td>${val ?? ""}</td>`;
    });
    const actions = document.createElement("td");
    actions.innerHTML = `
      <button class="edit-btn" onclick="editItem('${tableId}', ${index})">Edit</button>
      <button class="delete-btn" onclick="deleteItem('${tableId}', ${index})">Delete</button>`;
    tr.appendChild(actions);
    tbody.appendChild(tr);
  });
  updateRecipes();
}

function editItem(tableId, index) {
  let arr = getArray(tableId);
  const item = arr[index];
  const keys = Object.keys(item);
  keys.forEach(k => {
    let current = item[k];
    // Show readable current value for dates
    if (current instanceof Date) current = current.toISOString().slice(0,10);
    const val = prompt(`Edit ${k}:`, current);
    if (val !== null) {
      // cast numeric fields
      if (k === "days") {
        const n = parseInt(val);
        item[k] = isNaN(n) ? val : n;
      } else if (k === "expiry") {
        // try parse date
        const d = new Date(val);
        item[k] = isNaN(d) ? val : d;
      } else {
        item[k] = val;
      }
    }
  });
  // determine keys to show in table
  const keysForTable = tableId.includes("package") ? ["name","qty","expiry"] : ["name","qty","days"];
  updateTable(tableId, arr, keysForTable);
}

function deleteItem(tableId, index) {
  let arr = getArray(tableId);
  arr.splice(index, 1);
  const keys = tableId.includes("package") ? ["name","qty","expiry"] : ["name","qty","days"];
  updateTable(tableId, arr, keys);
}

function getArray(tableId) {
  if (tableId.includes("leftover")) return leftovers;
  if (tableId.includes("package")) return packaged;
  if (tableId.includes("veggie")) return veggies;
  if (tableId.includes("fruit")) return fruits;
  return [];
}

// --- Recipe suggestion logic ---
function updateRecipes() {
  const allRecipeList = document.getElementById("allRecipeList");
  const expiringRecipeList = document.getElementById("expiringRecipeList");
  allRecipeList.innerHTML = "";
  expiringRecipeList.innerHTML = "";

  const today = new Date();

  const soonExpiring = [
    ...leftovers.filter(i => (typeof i.days === "number" ? i.days <= 1 : Number(i.days) <= 1)).map(i => i.name.toLowerCase()),
    ...veggies.filter(i => (typeof i.days === "number" ? i.days <= 2 : Number(i.days) <= 2)).map(i => i.name.toLowerCase()),
    ...fruits.filter(i => (typeof i.days === "number" ? i.days <= 1 : Number(i.days) <= 1)).map(i => i.name.toLowerCase()),
    ...packaged.filter(p => {
      // handle expiry as Date or string
      const expDate = p.expiry instanceof Date ? p.expiry : new Date(p.expiry);
      if (isNaN(expDate)) return false;
      const diff = (expDate - today) / (1000*60*60*24);
      return diff <= 30;
    }).map(p => p.name.toLowerCase())
  ];

  const allItems = [
    ...leftovers.map(i => i.name.toLowerCase()),
    ...veggies.map(i => i.name.toLowerCase()),
    ...fruits.map(i => i.name.toLowerCase()),
    ...packaged.map(i => i.name.toLowerCase())
  ];

  let allMatches = [];
  recipes.forEach(r => {
    const haveCount = r.ingredients.filter(ing => allItems.some(i => i.includes(ing))).length;
    const matchPercent = Math.round((haveCount / r.ingredients.length) * 100);
    if (matchPercent > 0) allMatches.push({ ...r, haveCount, matchPercent });
  });

  allMatches.sort((a,b)=>b.matchPercent - a.matchPercent);

  if (allMatches.length) {
    allMatches.forEach(r=>{
      const card=document.createElement("div");
      card.className="recipe-card";
      card.innerHTML=`
        <img src="${r.img}" alt="${r.name}">
        <h4>${r.name}</h4>
        <p>Match: ${r.matchPercent}% (${r.haveCount}/${r.ingredients.length})</p>
        <p>Difficulty: ${r.difficulty}</p>`;
      allRecipeList.appendChild(card);
    });
  } else {
    allRecipeList.innerHTML="<p class='small'>No recipes found. Try adding more ingredients!</p>";
  }

  const expiringMatches = allMatches.filter(r =>
    r.ingredients.some(ing => soonExpiring.includes(ing))
  );

  if (expiringMatches.length) {
    expiringMatches.forEach(r=>{
      const card=document.createElement("div");
      card.className="recipe-card";
      card.innerHTML=`
        <img src="${r.img}" alt="${r.name}">
        <h4>${r.name}</h4>
        <p>Uses soon-to-expire item(s)</p>
        <p>Match: ${r.matchPercent}%</p>`;
      expiringRecipeList.appendChild(card);
    });
  } else {
    expiringRecipeList.innerHTML="<p class='small'>No soon-to-expire items currently linked to recipes.</p>";
  }
}

// --- Form listeners ---
document.getElementById("leftoverForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("leftoverName").value.trim().toLowerCase();
  const qty = document.getElementById("leftoverQty").value.trim();
  const days = parseInt(document.getElementById("leftoverDays").value);
  leftovers.push({ name, qty, days });
  updateTable("leftoverTable", leftovers, ["name","qty","days"]);
  e.target.reset();
});

document.getElementById("packagedForm").addEventListener("submit", e => {
  e.preventDefault();
  const barcode = document.getElementById("packageBarcode").value.trim();
  let name = document.getElementById("packageName").value.trim().toLowerCase();
  const qty = document.getElementById("packageQty").value.trim();
  const expiryVal = document.getElementById("packageExpiry").value;

  if (barcode && mockBarcodeDB[barcode]) {
    const info = mockBarcodeDB[barcode];
    name = info.name;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + info.shelf_life_days);
    packaged.push({ name, qty, expiry: expiryDate });
  } else {
    const expiryDate = expiryVal ? new Date(expiryVal) : new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    packaged.push({ name, qty, expiry: expiryDate });
  }

  updateTable("packageTable", packaged, ["name","qty","expiry"]);
  e.target.reset();
});

document.getElementById("veggieForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("veggieName").value.trim().toLowerCase();
  const qty = document.getElementById("veggieQty").value.trim();
  const days = parseInt(document.getElementById("veggieDays").value);
  veggies.push({ name, qty, days });
  updateTable("veggieTable", veggies, ["name","qty","days"]);
  e.target.reset();
});

document.getElementById("fruitForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("fruitName").value.trim().toLowerCase();
  const qty = document.getElementById("fruitQty").value.trim();
  const days = parseInt(document.getElementById("fruitDays").value);
  fruits.push({ name, qty, days });
  updateTable("fruitTable", fruits, ["name","qty","days"]);
  e.target.reset();
});

// --- Scanner overlay (simple start/stop camera) ---
let _cameraStream = null;

document.getElementById("scanBarcodeBtn").addEventListener("click", () => {
  openScanner();
});

function openScanner() {
  const overlay = document.getElementById("scannerOverlay");
  overlay.style.display = "flex";
  const video = document.getElementById("videoElement");

  // start camera
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        _cameraStream = stream;
        video.srcObject = stream;
        video.play();
      })
      .catch(err => {
        console.warn("Camera access denied or not available:", err);
        // still keep overlay open but show black video area (user can close)
      });
  }
}

function closeScanner() {
  const overlay = document.getElementById("scannerOverlay");
  overlay.style.display = "none";
  const video = document.getElementById("videoElement");
  video.pause();
  video.srcObject = null;
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
}

// Expose closeScanner globally so inline onclick in HTML works
window.closeScanner = closeScanner;
window.login = login;

// End of script.js
