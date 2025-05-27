const pastel_colors = [
  "#AEC6CF", "#FFB347", "#B39EB5", "#77DD77", "#FF6961", "#FDFD96", "#CFCFC4",
  "#DEA5A4", "#B0E0E6", "#DDA0DD", "#E0BBE4", "#CBAACB", "#FFFFB3", "#FFDAB9",
  "#C1E1C1", "#FFB6C1", "#FFCCCB", "#E6E6FA", "#F4C2C2", "#E3E4FA", "#D6CADD",
  "#F5DEB3", "#F0E68C", "#FAFAD2", "#E0FFFF", "#F0FFF0", "#FFFACD", "#F8F8FF",
  "#F5F5DC", "#D8BFD8", "#FFE4E1", "#FFF0F5", "#E0B0FF"
];

const url = 'https://26c0-136-52-89-240.ngrok-free.app';

let selectedCars = new Set();
let selectedTags = new Set();
let carColors = {};

class Table {
  constructor() {
    this.table = document.getElementById('transcript-table');
    this.lastRows = [];
    fetch(`${url}/data.csv`, {
      headers: {
        "ngrok-skip-browser-warning": "69420"
      }
    })
      .then(response => {
        if (!response.ok) throw new Error("Failed to load CSV file");
        return response.text();
      })
      .then(csvData => {
        const parsedRows = this.parseCSV(csvData);
        this.lastRows = parsedRows;
        this.initializeCarButtons(parsedRows);
        this.buildTable(parsedRows);
        // ✅ Now tableInstance is ready — start polling here
        tableInstance = this;
        pollForUpdates(); // Run once immediately
        setInterval(pollForUpdates, 2000); // Repeatedly poll every 2s
      });
  }

  parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const parsed = lines.map(line => {
      const cells = [];
      let current = '';
      let inQuotes = false;
  
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
  
        if (char === '"' && inQuotes && nextChar === '"') {
          current += '"'; // Escaped quote
          i++; // Skip next quote
        } else if (char === '"') {
          inQuotes = !inQuotes; // Toggle quote state
        } else if (char === ',' && !inQuotes) {
          cells.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      cells.push(current); // Push the final field
  
      return {
        timestamp: cells[0],
        car: cells[1]?.trim(),
        transcription: cells[2],
        tags: cells[3]?.trim(),
        audio: cells[4]?.trim()
      };
    });
  
    return parsed;
  }
  

  updateTableWithNewRows(newRows) {
    const newEntries = newRows.slice(this.lastRows.length);
    if (newEntries.length > 0) {
      // Check for new cars and assign color + button
      const knownCars = new Set(Object.keys(carColors));
      const newCars = [...new Set(newEntries.map(row => row.car))].filter(car => !knownCars.has(car));
      newCars.forEach(car => {
        const color = pastel_colors[Object.keys(carColors).length % pastel_colors.length];
        carColors[car] = color;
        // Add new car button to the UI
        const container = document.getElementById("car-buttons-container");
        const button = document.createElement("button");
        button.className = "btn btn-outline-light btn-sm me-1 mb-1 car-btn";
        button.setAttribute("data-car", car);
        button.innerText = car;
        button.style.borderColor = color;
        button.style.color = color;
        button.onclick = function () {
          toggleCarFilter(this);
        };
        container.appendChild(button);
        console.log(`Added new car button for ${car} with color ${color}`);
      });
      this.appendRows(newEntries);
      this.lastRows = newRows;
    }
  }

  appendRows(rows) {
    const tbody = this.table.tBodies[0];
    rows.forEach(rowData => {
      const row = tbody.insertRow();
      const color = carColors[rowData.car] || "#fff";
      const tdTime = row.insertCell();
      tdTime.textContent = rowData.timestamp;
      const tdCar = row.insertCell();
      tdCar.textContent = rowData.car;
      const tdTranscript = row.insertCell();
      tdTranscript.textContent = rowData.transcription;
      const tdTags = row.insertCell();
      tdTags.textContent = rowData.tags;
      const tdAudio = row.insertCell();
      if (rowData.audio) {
        const audio = document.createElement("audio");
        audio.controls = true;
      
        fetch(`${url}/${rowData.audio}`, {
          headers: {
            "ngrok-skip-browser-warning": "69420"
          }
        })
        .then(response => {
          if (!response.ok) throw new Error("Failed to load audio");
          return response.blob();
        })
        .then(blob => {
          const audioUrl = URL.createObjectURL(blob);
          audio.src = audioUrl;
        })
        .catch(error => {
          console.error("Audio fetch error:", error);
          tdAudio.textContent = "Audio load error";
        });
      
        tdAudio.appendChild(audio);
      } else {
        tdAudio.textContent = "No audio";
      }
      
      // Style each cell with car color
      for (const cell of row.cells) {
        cell.style.backgroundColor = color;
      }
      // Smooth fade-in effect for new rows
      row.style.opacity = 0;
      row.style.transition = 'opacity 0.6s ease';
      requestAnimationFrame(() => {
        row.style.opacity = 1;
      });
    });
    // Re-filter in case any filters are active
    filterTable();
  }


  initializeCarButtons(dataRows) {
    const container = document.getElementById("car-buttons-container");
    const uniqueCars = [...new Set(dataRows.map(row => row.car))];
    uniqueCars.forEach((car, index) => {
      const color = pastel_colors[index % pastel_colors.length];
      carColors[car] = color;
      console.log(`Assigned color ${color} to car ${car}`);
      const button = document.createElement("button");
      button.className = "btn btn-outline-light btn-sm me-1 mb-1 car-btn";
      button.setAttribute("data-car", car);
      button.innerText = car;
      button.style.borderColor = color;
      button.style.color = color;
      button.onclick = function () {
        toggleCarFilter(this);
      };
      container.appendChild(button);
    });
  }

  buildTable(dataRows) {
    // Clear only the tbody, keep thead intact
    let tbody = this.table.tBodies[0];
    if (!tbody) {
      tbody = this.table.createTBody();
    }
    tbody.innerHTML = ""; // Clear old rows
    dataRows.forEach(rowData => {
      const row = tbody.insertRow();
      const color = carColors[rowData.car] || "#fff";
      const tdTime = row.insertCell();
      tdTime.textContent = rowData.timestamp;
      const tdCar = row.insertCell();
      tdCar.textContent = rowData.car;
      const tdTranscript = row.insertCell();
      tdTranscript.textContent = rowData.transcription;
      const tdTags = row.insertCell();
      tdTags.textContent = rowData.tags;
      const tdAudio = row.insertCell();
      if (rowData.audio) {
        const audio = document.createElement("audio");
        audio.controls = true;
      
        fetch(`${url}/${rowData.audio}`, {
          headers: {
            "ngrok-skip-browser-warning": "69420"
          }
        })
        .then(response => {
          if (!response.ok) throw new Error("Failed to load audio");
          return response.blob();
        })
        .then(blob => {
          const audioUrl = URL.createObjectURL(blob);
          audio.src = audioUrl;
        })
        .catch(error => {
          console.error("Audio fetch error:", error);
          tdAudio.textContent = "Audio load error";
        });
      
        tdAudio.appendChild(audio);
      } else {
        tdAudio.textContent = "No audio";
      }
      
      for (const cell of row.cells) {
        cell.style.backgroundColor = color;
      }
    });
  }
  
  
}

// POLLING LOGIC FOR FREQUENT READ OF data.csv
let tableInstance = null;
function pollForUpdates() {
  fetch(`${url}/data.csv`, {
    headers: {
      "ngrok-skip-browser-warning": "69420"
    }
  })
    .then(response => {
      if (!response.ok) throw new Error("Failed to fetch CSV");
      return response.text();
    })
    .then(csvData => {
      console.log("Polled CSV data:", csvData);
      const newRows = tableInstance.parseCSV(csvData);
      tableInstance.updateTableWithNewRows(newRows);
    });
}

document.addEventListener("DOMContentLoaded", () => {
  new Table(); // `tableInstance` is set inside the constructor
});


// Tag Filter Logic
function toggleTagFilter(button) {
  const tag = button.getAttribute("data-tag");
  if (selectedTags.has(tag)) {
    selectedTags.delete(tag);
    button.classList.remove("active");
  } else {
    selectedTags.add(tag);
    button.classList.add("active");
  }
  filterTable();
}

function resetTagFilters() {
  selectedTags.clear();
  const buttons = document.querySelectorAll(".tag-btn");
  buttons.forEach(btn => btn.classList.remove("active"));
  filterTable();
}

// Car Filter Logic
function toggleCarFilter(button) {
  const car = button.getAttribute("data-car");
  if (selectedCars.has(car)) {
    selectedCars.delete(car);
    button.classList.remove("active");
    button.style.backgroundColor = "";
    button.style.color = carColors[car];
  } else {
    selectedCars.add(car);
    button.classList.add("active");
    button.style.backgroundColor = carColors[car];
    button.style.color = "#000";
  }
  filterTable();
}

function resetCarFilters() {
  selectedCars.clear();
  const buttons = document.querySelectorAll(".car-btn");
  buttons.forEach(btn => {
    btn.classList.remove("active");
    const car = btn.getAttribute("data-car");
    btn.style.backgroundColor = "";
    btn.style.color = carColors[car];
  });
  filterTable();
}

// Combined Filter Function
function filterTable() {
  const table = document.getElementById("transcript-table");
  const rows = table.getElementsByTagName("tr");

  for (let i = 1; i < rows.length; i++) {
    const carCell = rows[i].cells[1];
    const tagCell = rows[i].cells[3];
    if (!carCell || !tagCell) continue;

    const rowCar = carCell.textContent.trim();
    const rowTags = tagCell.textContent.toLowerCase();

    const carMatch = selectedCars.size === 0 || selectedCars.has(rowCar);
    const tagMatch = selectedTags.size === 0 || [...selectedTags].some(tag => rowTags.includes(tag.toLowerCase()));

    rows[i].style.display = carMatch && tagMatch ? "" : "none";
  }
}

// CSV Export Function
function exportTableToCSV(filename = 'export.csv') {
  const table = document.getElementById('transcript-table');
  const rows = Array.from(table.querySelectorAll('tr'));
  // Get only rows that are visible (not display: none)
  const visibleRows = rows.filter(row => row.style.display !== "none");
  const csv = visibleRows.map(row => {
    return Array.from(row.cells)
      .map(cell => `"${cell.innerText.replace(/"/g, '""')}"`)
      .join(',');
  }).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}


// Sorting Table by Time
let ascending = true;
function sortTableByTime() {
  const table = document.getElementById("transcript-table");
  const tbody = table.tBodies[0];
  // Get visible rows only
  const visibleRows = Array.from(tbody.querySelectorAll("tr")).filter(
    row => row.style.display !== "none"
  );
  // Sort visible rows by timestamp (HH:MM:SS or HH:MM)
  visibleRows.sort((a, b) => {
    const parseTime = (timeStr) => {
      const parts = timeStr.trim().split(':').map(Number);
      // Handle formats: HH:MM or HH:MM:SS
      const seconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
      return seconds;
    };
    const timeA = parseTime(a.cells[0].innerText);
    const timeB = parseTime(b.cells[0].innerText);
    return ascending ? timeA - timeB : timeB - timeA;
  });
  // Append sorted rows back to tbody in order
  visibleRows.forEach(row => tbody.appendChild(row));
  // Flip the sorting order for next click
  ascending = !ascending;
  // Update sort arrow indicator
  const sortArrow = document.getElementById("sort-arrow");
  if (sortArrow) {
    sortArrow.innerText = ascending ? '🔽' : '🔼';
  }
}


