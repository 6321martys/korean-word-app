/**
 * [Comment Policy: 선생님 대시보드 및 어드민 관리 모듈 (admin.js)]
 * 학생들의 전체 학습 진도 모니터링, 필터링 검색, 날짜 선택 피커 구현, 
 * 그리고 시작일/레벨을 강제 교정하여 구글 스프레드시트 진도를 재생성하는 어드민 관리 인터페이스를 전담합니다.
 * 구글 스프레드시트 단일 소스 원칙을 적용합니다.
 */

// 어드민 제어 전역 변수
let adminHeaders = ["ID", "Name", "Role", "LastLogin", "학습시작일", "레벨"];
let pickerYear = 2026;
let pickerMonth = 6;

/**
 * [Comment Policy: 선생님 대시보드 코어 초기화]
 * 학생 데이터 조회, 필터 조작 리스너 바인딩, 그리고 동적 표 출력을 총괄 제어합니다.
 */
async function initTeacherDashboard() {
  let isGoogleFetch = !!GOOGLE_SCRIPT_URL;
  try {
    if (isGoogleFetch) showConnectionLoading();
    let students = null;

    // 1. 구글 연동 중이라면 API 조회 시도
    if (GOOGLE_SCRIPT_URL) {
      const requestUrl = `${GOOGLE_SCRIPT_URL}?action=getAllStudents&_=${Date.now()}`;
      try {
        const response = await fetch(requestUrl);
        if (response.ok) {
          const result = await response.json();
          if (result && result.success && Array.isArray(result.students)) {
            students = result.students;
            adminHeaders = result.headers || ["ID", "Name", "Role", "LastLogin", "학습시작일", "레벨"];
            updateConnectionStatus(true);
          }
        }
      } catch (err) {
        console.warn("구글 API 호출 실패:", err);
      }
    }

    if (!students) {
      allStudentsData = [];
      updateConnectionStatus(false);
      renderStudentTable([]);
      return;
    }

    allStudentsData = students;

    // 2. 필터링 및 검색 이벤트 바인딩
    bindAdminFilters();

    // 3. 테이블 그리기
    renderStudentTable(allStudentsData);

    // 4. 신규 관리 기능 이벤트 리스너 바인딩 (최초 1회 등록)
    bindAdminEditEvents();

  } catch (error) {
    console.error("선생님 대시보드 로딩 중 오류:", error);
    updateConnectionStatus(false);
  } finally {
    if (isGoogleFetch) hideConnectionLoading();
  }
}

/**
 * [Comment Policy: 필터 컨트롤 바인딩]
 * 검색 필드 입력 및 드롭다운, 체크박스의 변경 사항에 따라 테이블을 실시간 갱신합니다.
 */
function bindAdminFilters() {
  const searchInput = document.getElementById("search-student");
  const langSelect = document.getElementById("filter-lang");
  const lateCheck = document.getElementById("filter-late");

  if (!searchInput || !langSelect || !lateCheck) return;

  const applyFilter = () => {
    const q = searchInput.value.trim().toLowerCase();
    const l = langSelect.value;
    const isLateOnly = lateCheck.checked;

    const filtered = allStudentsData.filter(s => {
      const matchQuery = !q || s.id.toLowerCase().includes(q) || (s.name && s.name.toLowerCase().includes(q));
      let matchLang = true;
      if (l !== "all") {
        if (l === "vi") matchLang = (s.name && s.name.includes("베트남어")) || s.lang === "vi";
        else if (l === "zh") matchLang = (s.name && s.name.includes("중국어")) || s.lang === "zh";
        else if (l === "en") matchLang = (s.name && s.name.includes("영어")) || s.lang === "en";
      }
      const matchLate = !isLateOnly || s.isLate;

      return matchQuery && matchLang && matchLate;
    });

    renderStudentTable(filtered);
  };

  searchInput.oninput = applyFilter;
  langSelect.onchange = applyFilter;
  lateCheck.onchange = applyFilter;
}

/**
 * [Comment Policy: 학생 대시보드 테이블 동적 렌더링]
 * 학생 데이터 목록을 표 형식으로 렌더링하며, 행 클릭 시 상세 모달 또는 수정 모달을 엽니다.
 * @param {Array} students 
 */
function renderStudentTable(students) {
  const tbody = document.getElementById("teacher-student-list");
  const countBadge = document.getElementById("total-student-count");
  if (!tbody) return;

  if (countBadge) countBadge.textContent = `${students.length}명`;
  tbody.innerHTML = "";

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-secondary); padding: 30px;">조회된 학생 데이터가 없습니다.</td></tr>`;
    return;
  }

  students.forEach((s) => {
    const tr = document.createElement("tr");

    // 지각 여부 뱃지
    const lateBadge = s.isLate
      ? `<span class="badge-status-late">지각 감지</span>`
      : `<span class="badge-status-normal">정상</span>`;

    // 진도 계산 (90회차 기준 프로그레스 바)
    const completedNum = s.completedDays || 0;
    const pct = Math.min(100, Math.round((completedNum / 90) * 100));

    tr.innerHTML = `
      <td style="font-weight: 600;">${s.id}</td>
      <td>${s.name || "-"}</td>
      <td><span class="badge-level">${s.level || "단어장-초급"}</span></td>
      <td>${s.startDate || "-"}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="flex: 1; height: 6px; background: var(--color-surface-hover); border-radius: 3px; overflow: hidden; min-width: 60px;">
            <div style="width: ${pct}%; height: 100%; background: var(--color-success); border-radius: 3px;"></div>
          </div>
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-primary); white-space: nowrap;">${completedNum}/90</span>
        </div>
      </td>
      <td>${lateBadge}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn-table-action btn-detail" title="출석 세부 조회">상세</button>
          <button class="btn-table-action btn-edit" title="학습시작일/레벨 수정">수정</button>
        </div>
      </td>
    `;

    // 버튼 이벤트 바인딩
    const btnDetail = tr.querySelector(".btn-detail");
    if (btnDetail) {
      btnDetail.onclick = (e) => {
        e.stopPropagation();
        openStudentDetailModal(s);
      };
    }

    const btnEdit = tr.querySelector(".btn-edit");
    if (btnEdit) {
      btnEdit.onclick = (e) => {
        e.stopPropagation();
        openAdminEditModal(s);
      };
    }

    tbody.appendChild(tr);
  });
}

/**
 * [Comment Policy: 학생별 90일 세부 출석 모달 오픈]
 * 특정 학생의 90일 전체 회차 상태를 모달에 렌더링합니다.
 * @param {Object} student 
 */
async function openStudentDetailModal(student) {
  const modal = document.getElementById("student-modal");
  const modalName = document.getElementById("modal-student-name");
  const modalId = document.getElementById("modal-student-id");
  const modalProgress = document.getElementById("modal-student-progress");
  const modalStart = document.getElementById("modal-student-start");
  const logScroll = document.getElementById("modal-session-logs");

  if (!modal || !modalName || !logScroll) return;

  modalName.textContent = student.name || student.id;
  modalId.textContent = student.id;
  modalProgress.textContent = `${student.completedDays || 0} / 90회차 완료`;
  modalStart.textContent = student.startDate || "-";

  logScroll.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); padding: 20px;">학습 세션 데이터를 불러오는 중...</div>`;

  modal.classList.remove("hidden");
  void modal.offsetWidth;
  modal.classList.add("active");

  // 구글 시트에서 학생의 90일치 세부 상태 로드
  try {
    let records = [];
    if (GOOGLE_SCRIPT_URL) {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getPlannerState&id=${encodeURIComponent(student.id)}&_=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.words)) {
          records = data.words;
        }
      }
    }

    logScroll.innerHTML = "";

    if (records.length === 0) {
      logScroll.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); padding: 20px;">생성된 학습 기록이 없습니다.</div>`;
      return;
    }

    records.forEach(w => {
      const item = document.createElement("div");
      item.className = "session-log-item";

      let statusClass = "status-ready";
      let statusTxt = "학습 전";
      if (w.status === "학습 완료") {
        statusClass = "status-completed";
        statusTxt = "학습 완료";
      } else if (w.status === "지각") {
        statusClass = "status-late";
        statusTxt = "지각";
      }

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="word-log-day">${w.dayLabel} (${w.session}회차)</span>
          <span class="word-log-range" style="font-size: 0.75rem; color: var(--color-text-secondary);">(${w.startDate})</span>
          <span class="log-status-badge ${statusClass}">${statusTxt}</span>
        </div>
      `;
      logScroll.appendChild(item);
    });

  } catch (err) {
    console.error("세션 상세 조회 실패:", err);
    logScroll.innerHTML = `<div style="text-align: center; color: var(--color-danger); padding: 20px;">학습 기록을 불러오는 중 오류가 발생했습니다.</div>`;
  }
}

/**
 * [Comment Policy: 상세 정보 모달 비활성화]
 */
function closeStudentModal() {
  const modal = document.getElementById("student-modal");
  if (!modal) return;
  modal.classList.remove("active");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 200);
}

/**
 * [Comment Policy: 선생님 관리자 정보 수정 모달 오픈]
 * @param {Object} student 
 */
function openAdminEditModal(student) {
  const modal = document.getElementById("admin-edit-modal");
  const editId = document.getElementById("edit-student-id");
  const editName = document.getElementById("edit-student-name");
  const editDateInput = document.getElementById("edit-start-date-input");
  const editLevelSelect = document.getElementById("edit-level-select");

  if (!modal || !editId || !editDateInput) return;

  editId.value = student.id;
  editName.textContent = student.name || student.id;
  editDateInput.value = student.startDate !== "-" ? student.startDate : getLocalDateString(new Date());
  if (editLevelSelect) {
    editLevelSelect.value = student.level || "단어장-초급";
  }

  // 달력 피커 초기화
  const baseD = parseLocalDate(editDateInput.value);
  pickerYear = baseD.getFullYear();
  pickerMonth = baseD.getMonth();
  renderPickerGrid();

  modal.classList.remove("hidden");
  void modal.offsetWidth;
  modal.classList.add("active");
}

/**
 * [Comment Policy: 관리자 수정 모달 닫기]
 */
function closeAdminEditModal() {
  const modal = document.getElementById("admin-edit-modal");
  if (!modal) return;
  modal.classList.remove("active");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 200);
}

/**
 * 날짜 선택기(Calendar Picker) 렌더링 함수
 */
function renderPickerGrid() {
  const pickerGrid = document.getElementById("picker-calendar-grid");
  const pickerTitle = document.getElementById("picker-title");
  const editDateInput = document.getElementById("edit-start-date-input");
  if (!pickerGrid || !pickerTitle) return;

  pickerTitle.textContent = `${pickerYear}년 ${pickerMonth + 1}월`;
  pickerGrid.innerHTML = "";

  const firstDayIndex = new Date(pickerYear, pickerMonth, 1).getDay();
  const lastDayDate = new Date(pickerYear, pickerMonth + 1, 0).getDate();

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty";
    pickerGrid.appendChild(emptyCell);
  }

  const selectedDateStr = editDateInput ? editDateInput.value : "";

  for (let d = 1; d <= lastDayDate; d++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.style.minHeight = "36px";
    cell.style.padding = "4px";
    cell.style.cursor = "pointer";

    const numSpan = document.createElement("span");
    numSpan.className = "day-number";
    numSpan.style.fontSize = "0.8rem";
    numSpan.textContent = d;
    cell.appendChild(numSpan);

    const fullD = new Date(pickerYear, pickerMonth, d);
    const dateStr = getLocalDateString(fullD);

    if (dateStr === selectedDateStr) {
      cell.classList.add("today");
      cell.style.borderColor = "var(--color-primary)";
      cell.style.background = "rgba(108, 92, 231, 0.2)";
    }

    cell.onclick = () => {
      if (editDateInput) {
        editDateInput.value = dateStr;
      }
      renderPickerGrid();
    };

    pickerGrid.appendChild(cell);
  }
}

/**
 * [Comment Policy: 어드민 수정 모달 이벤트 바인딩]
 */
function bindAdminEditEvents() {
  const btnCloseModal = document.getElementById("btn-close-modal");
  const btnCloseEditModal = document.getElementById("btn-close-edit-modal");
  const btnCancelEdit = document.getElementById("btn-cancel-edit");
  const formEdit = document.getElementById("admin-edit-form");

  const btnPickerPrev = document.getElementById("btn-picker-prev");
  const btnPickerNext = document.getElementById("btn-picker-next");

  if (btnCloseModal) btnCloseModal.onclick = closeStudentModal;
  if (btnCloseEditModal) btnCloseEditModal.onclick = closeAdminEditModal;
  if (btnCancelEdit) btnCancelEdit.onclick = closeAdminEditModal;

  if (btnPickerPrev) {
    btnPickerPrev.onclick = () => {
      pickerMonth--;
      if (pickerMonth < 0) {
        pickerMonth = 11;
        pickerYear--;
      }
      renderPickerGrid();
    };
  }

  if (btnPickerNext) {
    btnPickerNext.onclick = () => {
      pickerMonth++;
      if (pickerMonth > 11) {
        pickerMonth = 0;
        pickerYear++;
      }
      renderPickerGrid();
    };
  }

  if (formEdit) {
    formEdit.onsubmit = async (e) => {
      e.preventDefault();

      const targetId = document.getElementById("edit-student-id").value;
      const newStartDate = document.getElementById("edit-start-date-input").value;
      const newLevel = document.getElementById("edit-level-select").value;

      if (!targetId || !newStartDate || !newLevel) {
        alert("모든 필수 항목을 입력해 주세요.");
        return;
      }

      if (!confirm(`[${targetId}] 학생의 학습 일정을 [${newStartDate}] 시작, [${newLevel}] 기준으로 재생성하시겠습니까? 기존 완료된 출석 기록은 안전하게 보존됩니다.`)) {
        return;
      }

      const globalLoader = document.getElementById("global-loading-overlay");
      if (globalLoader) {
        globalLoader.classList.remove("hidden");
        globalLoader.classList.add("active");
      }

      let isGoogleFetch = !!GOOGLE_SCRIPT_URL;
      try {
        if (isGoogleFetch) showConnectionLoading();
        let success = false;

        if (GOOGLE_SCRIPT_URL) {
          const requestUrl = `${GOOGLE_SCRIPT_URL}?action=updateStudentInfo&id=${encodeURIComponent(targetId)}&newStartDate=${encodeURIComponent(newStartDate)}&newLevel=${encodeURIComponent(newLevel)}&_=${Date.now()}`;
          const response = await fetch(requestUrl);
          if (response.ok) {
            const result = await response.json();
            if (result && result.success) {
              success = true;
            }
          }
        }

        if (success) {
          closeAdminEditModal();
          alert("학생 학습 계획 정보가 정상 수정 및 재생성되었습니다.");
          await initTeacherDashboard();
        } else {
          alert("정보 수정에 실패했습니다. 다시 시도해 주세요.");
        }

      } catch (err) {
        console.error("수정 API 통신 오류:", err);
        alert("서버 연결 실패로 수정을 완료하지 못했습니다.");
      } finally {
        if (isGoogleFetch) hideConnectionLoading();
        if (globalLoader) {
          globalLoader.classList.remove("active");
          globalLoader.classList.add("hidden");
        }
      }
    };
  }
}
