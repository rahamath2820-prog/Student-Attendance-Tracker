
const $ = (id) => document.getElementById(id);

const STATUSES = ["Present", "Absent", "Late", "Leave"];
const STUDENTS_KEY = "sat_students_v1";
const ATTENDANCE_KEY = "sat_attendance_v1";
const THRESHOLD_KEY = "sat_threshold_v1";

function loadJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

let students = loadJSON(STUDENTS_KEY, []);
let attendance = loadJSON(ATTENDANCE_KEY, {});
let threshold = Number(localStorage.getItem(THRESHOLD_KEY)) || 75;

if (!Array.isArray(students)) students = [];
if (!attendance || typeof attendance !== "object" ||
    Array.isArray(attendance)) attendance = {};

function saveData() {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
  localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(attendance));
}

function makeId() {
  return "student_" + Date.now() + "_" +
    Math.random().toString(36).slice(2, 8);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function todayString() {
  const now = new Date();
  const local = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
  );
  return local.toISOString().slice(0, 10);
}

function dateRecords(studentId) {
  return Object.entries(attendance)
    .filter(([key, record]) =>
      record &&
      key.startsWith(studentId + "|") &&
      STATUSES.includes(record.status)
    )
    .map(([key, record]) => ({
      key,
      date: key.slice(studentId.length + 1),
      status: record.status
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Present and Late count as attended.
// Absent counts as not attended.
// Leave is excluded from the percentage denominator.
function getStats(studentId) {
  const records = dateRecords(studentId);

  const counted = records.filter(record =>
    ["Present", "Absent", "Late"].includes(record.status)
  );

  const attended = counted.filter(record =>
    ["Present", "Late"].includes(record.status)
  ).length;

  return {
    total: counted.length,
    attended,
    percentage: counted.length
      ? (attended / counted.length) * 100
      : 0
  };
}

function getRecordKey(studentId, date) {
  return studentId + "|" + date;
}

function getStatus(studentId, date) {
  return attendance[getRecordKey(studentId, date)]?.status || "";
}

function statusBadge(status) {
  if (!status) {
    return '<span class="status">Not Marked</span>';
  }

  return `<span class="status status-${status}">
    ${escapeHTML(status)}
  </span>`;
}

// Student form: add and edit.
$("studentForm").addEventListener("submit", function (event) {
  event.preventDefault();

  const editId = $("editId").value;
  const studentId = $("studentId").value.trim();
  const name = $("studentName").value.trim();
  const department = $("department").value.trim();

  if (!studentId || !name || !department) {
    alert("Please fill in all student details.");
    return;
  }

  const duplicate = students.some(student =>
    student.studentId.toLowerCase() === studentId.toLowerCase() &&
    student.uid !== editId
  );

  if (duplicate) {
    alert("This Student ID already exists.");
    return;
  }

  if (editId) {
    const student = students.find(item => item.uid === editId);

    if (!student) {
      alert("Student record not found.");
      resetStudentForm();
      return;
    }

    student.studentId = studentId;
    student.name = name;
    student.department = department;
  } else {
    students.push({
      uid: makeId(),
      studentId,
      name,
      department
    });
  }

  saveData();
  resetStudentForm();
  renderAll();
});

function resetStudentForm() {
  $("studentForm").reset();
  $("editId").value = "";
  $("saveStudent").textContent = "Add Student";
  $("cancelEdit").hidden = true;
}

$("cancelEdit").addEventListener("click", resetStudentForm);

function editStudent(uid) {
  const student = students.find(item => item.uid === uid);
  if (!student) return;

  $("editId").value = student.uid;
  $("studentId").value = student.studentId;
  $("studentName").value = student.name;
  $("department").value = student.department;

  $("saveStudent").textContent = "Update Student";
  $("cancelEdit").hidden = false;

  $("studentForm").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function deleteStudent(uid) {
  const student = students.find(item => item.uid === uid);
  if (!student) return;

  if (!confirm(`Delete ${student.name} and their attendance history?`)) {
    return;
  }

  students = students.filter(item => item.uid !== uid);

  Object.keys(attendance).forEach(key => {
    if (key.startsWith(uid + "|")) {
      delete attendance[key];
    }
  });

  if ($("editId").value === uid) {
    resetStudentForm();
  }

  saveData();
  renderAll();
}

// Mark or update attendance.
// Each student/date combination has only one record.
function markAttendance(uid, date, status) {
  const student = students.find(item => item.uid === uid);

  if (!student || !date || !STATUSES.includes(status)) return;

  const key = getRecordKey(uid, date);

  attendance[key] = { status };
  saveData();
  renderAll();
}

function renderDashboard() {
  const date = $("attendanceDate").value;

  let present = 0;
  let absent = 0;
  let attendedOverall = 0;
  let countedOverall = 0;

  students.forEach(student => {
    const status = getStatus(student.uid, date);

    if (status === "Present") present++;
    if (status === "Absent") absent++;

    const stats = getStats(student.uid);
    attendedOverall += stats.attended;
    countedOverall += stats.total;
  });

  const overall = countedOverall
    ? (attendedOverall / countedOverall) * 100
    : 0;

  $("totalStudents").textContent = students.length;
  $("presentStudents").textContent = present;
  $("absentStudents").textContent = absent;
  $("overallAttendance").textContent = overall.toFixed(1) + "%";
}

function renderAttendanceTable() {
  const date = $("attendanceDate").value;
  const query = $("searchInput").value.trim().toLowerCase();
  const filter = $("statusFilter").value;
  const tbody = $("attendanceTable");

  const filtered = students.filter(student => {
    const matchesSearch = [
      student.name,
      student.studentId,
      student.department
    ].some(value => value.toLowerCase().includes(query));

    const stats = getStats(student.uid);
    const currentStatus = getStatus(student.uid, date);

    const matchesFilter =
      filter === "all" ||
      (filter === "Not Marked" && !currentStatus) ||
      (filter === "Low Attendance" &&
        stats.total > 0 && stats.percentage < threshold) ||
      currentStatus === filter;

    return matchesSearch && matchesFilter;
  });

  tbody.innerHTML = filtered.map(student => {
    const stats = getStats(student.uid);
    const status = getStatus(student.uid, date);
    const low = stats.total > 0 && stats.percentage < threshold;

    const options = [
      '<option value="">Not Marked</option>',
      ...STATUSES.map(item =>
        `<option value="${item}" ${status === item ? "selected" : ""}>
          ${item}
        </option>`
      )
    ].join("");

    return `
      <tr class="${low ? "low-row" : ""}">
        <td>${escapeHTML(student.studentId)}</td>
        <td>
          ${escapeHTML(student.name)}
          ${low ? '<br><span class="low-alert">Low Attendance</span>' : ""}
        </td>
        <td>${escapeHTML(student.department)}</td>
        <td>${stats.percentage.toFixed(1)}%</td>
        <td>
          <select aria-label="Attendance status for ${escapeHTML(student.name)}"
            data-action="attendance" data-uid="${student.uid}"
            data-date="${date}">
            ${options}
          </select>
          ${status ? statusBadge(status) : ""}
        </td>
        <td>
          <div class="row-actions">
            <button class="secondary" data-action="edit"
              data-uid="${student.uid}">Edit</button>
            <button class="danger" data-action="delete"
              data-uid="${student.uid}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  $("emptyMessage").hidden = filtered.length !== 0;
}

function renderHistoryOptions() {
  const select = $("historyStudent");
  const previous = select.value;

  select.innerHTML = '<option value="">Select a student</option>' +
    students.map(student =>
      `<option value="${student.uid}">
        ${escapeHTML(student.studentId)} — ${escapeHTML(student.name)}
      </option>`
    ).join("");

  if (students.some(student => student.uid === previous)) {
    select.value = previous;
  }
}

function renderHistory() {
  const uid = $("historyStudent").value;
  const student = students.find(item => item.uid === uid);

  if (!student) {
    $("historySummary").textContent = "";
    $("historyTable").innerHTML = "";
    return;
  }

  const records = dateRecords(uid);
  const stats = getStats(uid);

  $("historySummary").textContent =
    `Student: ${student.name} | ` +
    `Counted days: ${stats.total} | ` +
    `Attended: ${stats.attended} | ` +
    `Attendance: ${stats.percentage.toFixed(1)}%`;

  $("historyTable").innerHTML = records.length
    ? records.map(record => `
        <tr>
          <td>${escapeHTML(record.date)}</td>
          <td>${statusBadge(record.status)}</td>
        </tr>
      `).join("")
    : '<tr><td colspan="2">No attendance records available.</td></tr>';
}

function renderAll() {
  renderDashboard();
  renderAttendanceTable();
  renderHistoryOptions();
  renderHistory();
}

// Handle table actions using event delegation.
$("attendanceTable").addEventListener("click", function (event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const uid = button.dataset.uid;

  if (button.dataset.action === "edit") {
    editStudent(uid);
  } else if (button.dataset.action === "delete") {
    deleteStudent(uid);
  }
});

$("attendanceTable").addEventListener("change", function (event) {
  const select = event.target.closest(
    'select[data-action="attendance"]'
  );
  if (!select) return;

  const { uid, date } = select.dataset;

  if (!select.value) {
    delete attendance[getRecordKey(uid, date)];
    saveData();
    renderAll();
    return;
  }

  markAttendance(uid, date, select.value);
});

$("attendanceDate").addEventListener("change", renderAll);
$("searchInput").addEventListener("input", renderAttendanceTable);
$("statusFilter").addEventListener("change", renderAttendanceTable);
$("historyStudent").addEventListener("change", renderHistory);

$("threshold").value = threshold;

$("threshold").addEventListener("change", function () {
  const value = Number(this.value);

  if (!Number.isFinite(value) || value < 1 || value > 100) {
    alert("Enter a threshold between 1 and 100.");
    this.value = threshold;
    return;
  }

  threshold = value;
  localStorage.setItem(THRESHOLD_KEY, String(threshold));
  renderAll();
});

// Initialize the application.
$("attendanceDate").value = todayString();
renderAll();
