/**
 * [Comment Policy: 선생님 대시보드 및 어드민 관리 모듈 (admin.js)]
 * 학생들의 전체 학습 진도 모니터링, 필터링 검색, 날짜 선택 피커 구현, 
 * 그리고 시작일/레벨을 강제 교정하여 구글 스프레드시트 진도를 재생성하는 어드민 관리 인터페이스를 전담합니다.
 * 구글 스프레드시트 단일 소스 원칙을 적용합니다.
 */

// 어드민 제어 전역 변수
let adminHeaders = ["ID", "Name", "Role", "LastLogin", "학습시작일", "레벨"];
let pickerYear = 2026;
let pickerMonth = 8;

/**
 * [Comment Policy: 선생님 대시보드 코어 초기화]
 * 학생 데이터 조회, 필터 조작 리스너 바인딩, 그리고 동적 표 출력을 총괄 제어합니다.
 */
async function initTeacherDashboard() {
  // [Comment Policy: Supabase 고속 DB 단독 연동]
  if (typeof getAllStudentsFromSupabase === "function") {
    try {
      const sbResult = await getAllStudentsFromSupabase();
      if (sbResult && sbResult.success && Array.isArray(sbResult.students)) {
        allStudentsData = sbResult.students;
        adminHeaders = ["ID", "Name", "Role", "LastLogin", "학습시작일", "진도율", "지각횟수", "레벨"];
        if (typeof updateConnectionStatus === "function") updateConnectionStatus(true);
        bindAdminFilters();
        renderStudentTable(allStudentsData);
        bindAdminEditEvents();
        console.log("[Supabase] 관리자 학생 목록 로드 완료:", allStudentsData.length);
        return;
      }
    } catch (sbErr) {
      console.error("[Admin] Supabase 학생 목록 조회 오류:", sbErr);
    }
  }

  allStudentsData = [];
  if (typeof updateConnectionStatus === "function") updateConnectionStatus(false);
  renderStudentTable([]);
}

/**
 * [Comment Policy: 필터 컨트롤 바인딩]
 * 검색 필드 입력 및 드롭다운, 체크박스의 변경 사항에 따라 테이블을 실시간 갱신합니다.
 */
function bindAdminFilters() {
  const searchInput = document.getElementById("search-student");
  const langSelect = document.getElementById("filter-language");
  const lateCheck = document.getElementById("toggle-late");
  const btnLogout = document.getElementById("btn-teacher-logout");

  if (btnLogout) {
    btnLogout.onclick = () => {
      sessionStorage.removeItem("active_user");
      location.reload();
    };
  }

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
  const tbody = document.getElementById("student-list-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!students || students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-secondary); padding: 30px;">조회된 학생 데이터가 없습니다.</td></tr>`;
    return;
  }

  students.forEach((s) => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.06)";
    tr.style.transition = "background var(--transition-fast)";

    // 지각 여부 뱃지
    const lateBadge = s.isLate
      ? `<span class="badge-status-late" style="background: rgba(235, 77, 75, 0.15); color: #ff7675; padding: 4px 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 600;">지각 감지</span>`
      : `<span class="badge-status-normal" style="background: rgba(0, 184, 148, 0.15); color: #55efc4; padding: 4px 10px; border-radius: 8px; font-size: 0.8rem; font-weight: 600;">정상</span>`;

    // 진도 계산 (90회차 기준 프로그레스 바)
    const completedNum = s.completedDays || 0;
    const pct = Math.min(100, Math.round((completedNum / 90) * 100));

    tr.innerHTML = `
      <td style="padding: 14px; font-weight: 700; color: var(--color-text-primary);">${s.id}</td>
      <td style="padding: 14px; color: var(--color-text-primary);">${s.name || "-"}</td>
      <td style="padding: 14px;"><span class="badge-level" style="background: rgba(108, 92, 231, 0.15); color: #a29bfe; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">${s.level || "단어장-초급"}</span></td>
      <td style="padding: 14px; color: var(--color-text-secondary); font-size: 0.88rem;">${s.startDate || "-"}</td>
      <td style="padding: 14px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="flex: 1; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 3px; overflow: hidden; min-width: 60px;">
            <div style="width: ${pct}%; height: 100%; background: var(--color-primary); border-radius: 3px;"></div>
          </div>
          <span style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-primary); white-space: nowrap;">${completedNum}/90</span>
        </div>
      </td>
      <td style="padding: 14px;">${lateBadge}</td>
      <td style="padding: 14px;">
        <div style="display: flex; gap: 6px;">
          <button class="btn-table-action btn-detail" style="background: rgba(255,255,255,0.06); border: 1px solid var(--color-border); color: var(--color-text-primary); padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer;" title="출석 세부 조회">상세</button>
          <button class="btn-table-action btn-edit" style="background: var(--color-primary); border: none; color: white; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 600; cursor: pointer;" title="학습시작일/레벨 수정">수정</button>
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
  const modalId = document.getElementById("modal-student-id");
  const modalLang = document.getElementById("modal-student-lang");
  const logScroll = document.querySelector(".word-log-container") || document.getElementById("modal-session-logs");

  if (!modal || !modalId) return;

  modalId.textContent = `학번: ${student.id} (${student.name || ""})`;
  if (modalLang) modalLang.textContent = `레벨: ${student.level || "단어장-초급"} | 시작일: ${student.startDate || "-"}`;

  if (logScroll) {
    logScroll.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); padding: 20px;">학습 세션 데이터를 불러오는 중...</div>`;
  }

  modal.classList.remove("hidden");
  void modal.offsetWidth;
  modal.classList.add("active");

  // Supabase에서 학생의 90일치 세부 상태 로드
  try {
    let records = [];
    if (typeof getPlannerStateFromSupabase === "function") {
      const state = await getPlannerStateFromSupabase(student.id);
      if (state && state.success && Array.isArray(state.words)) {
        records = state.words;
      }
    }

    if (logScroll) {
      logScroll.innerHTML = "";

      if (records.length === 0) {
        logScroll.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); padding: 20px;">생성된 학습 기록이 없습니다.</div>`;
        return;
      }

      records.forEach(w => {
        const item = document.createElement("div");
        item.className = "session-log-item";
        item.style.padding = "10px 14px";
        item.style.marginBottom = "8px";
        item.style.background = "rgba(255, 255, 255, 0.02)";
        item.style.borderRadius = "10px";
        item.style.border = "1px solid var(--color-border)";

        let statusClass = "status-ready";
        let statusTxt = "학습 전";
        if (w.status === "학습 완료") {
          statusClass = "status-completed";
          statusTxt = "학습 완료";
        } else if (w.status === "지각") {
          statusClass = "status-late";
          statusTxt = "지각";
        }

        const scoreBadge = w.scoreRecord
          ? `<span style="font-size: 0.75rem; background: rgba(108, 92, 231, 0.15); color: #a29bfe; padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-left: 4px;">점수: ${w.scoreRecord}</span>`
          : "";

        item.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <span style="font-weight: 600; color: var(--color-text-primary); font-size: 0.9rem;">${w.dayLabel} (${w.session}회차)</span>
              <span style="font-size: 0.75rem; color: var(--color-text-secondary);">(${w.startDate})</span>
              ${scoreBadge}
            </div>
            <span class="log-status-badge ${statusClass}" style="font-size: 0.8rem; font-weight: 600; padding: 3px 8px; border-radius: 6px;">${statusTxt}</span>
          </div>
        `;
        logScroll.appendChild(item);
      });
    }

  } catch (err) {
    console.error("세션 상세 조회 실패:", err);
    if (logScroll) {
      logScroll.innerHTML = `<div style="text-align: center; color: var(--color-danger); padding: 20px;">학습 기록을 불러오는 중 오류가 발생했습니다.</div>`;
    }
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
  const editStartDate = document.getElementById("edit-student-startdate");
  const editLevel = document.getElementById("edit-student-level");

  if (!modal || !editId) return;

  editId.value = student.id;
  if (editName) editName.value = student.name || student.id;
  if (editStartDate) editStartDate.value = student.startDate !== "-" ? student.startDate : "2026-09-01";
  if (editLevel) editLevel.value = student.level || "단어장-초급";

  // 달력 피커 초기화
  const dateVal = editStartDate ? editStartDate.value : "2026-09-01";
  const parts = dateVal.split("-");
  if (parts.length === 3) {
    pickerYear = parseInt(parts[0]) || 2026;
    pickerMonth = (parseInt(parts[1]) - 1) || 8;
  }
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
  const pickerGrid = document.getElementById("picker-calendar-grid") || document.getElementById("admin-picker-calendar-grid");
  const pickerTitle = document.getElementById("picker-calendar-title") || document.getElementById("admin-picker-title") || document.getElementById("picker-title");
  const editDateInput = document.getElementById("edit-student-startdate");
  if (!pickerGrid) return;

  if (pickerTitle) pickerTitle.textContent = `${pickerYear}년 ${pickerMonth + 1}월`;
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
    cell.style.display = "flex";
    cell.style.alignItems = "center";
    cell.style.justifyContent = "center";
    cell.style.borderRadius = "8px";

    const monthStr = String(pickerMonth + 1).padStart(2, "0");
    const dayStr = String(d).padStart(2, "0");
    const dateStr = `${pickerYear}-${monthStr}-${dayStr}`;

    cell.textContent = d;

    if (dateStr === selectedDateStr) {
      cell.classList.add("today");
      cell.style.borderColor = "var(--color-primary)";
      cell.style.background = "var(--color-primary)";
      cell.style.color = "white";
      cell.style.fontWeight = "700";
    }

    cell.onclick = () => {
      if (editDateInput) {
        editDateInput.value = dateStr;
      }
      const datePickerModal = document.getElementById("admin-date-picker-modal");
      if (datePickerModal) {
        datePickerModal.classList.remove("active");
        setTimeout(() => {
          datePickerModal.classList.add("hidden");
        }, 150);
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

  const btnOpenDatePicker = document.getElementById("btn-open-datepicker");
  const datePickerModal = document.getElementById("admin-date-picker-modal");
  const btnCloseDatePicker = document.getElementById("btn-close-datepicker");

  const btnPickerPrev = document.getElementById("btn-picker-prev");
  const btnPickerNext = document.getElementById("btn-picker-next");

  if (btnCloseModal) btnCloseModal.onclick = closeStudentModal;
  if (btnCloseEditModal) btnCloseEditModal.onclick = closeAdminEditModal;
  if (btnCancelEdit) btnCancelEdit.onclick = closeAdminEditModal;

  if (btnOpenDatePicker && datePickerModal) {
    btnOpenDatePicker.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      datePickerModal.classList.remove("hidden");
      void datePickerModal.offsetWidth;
      datePickerModal.classList.add("active");
      renderPickerGrid();
    };
  }

  if (btnCloseDatePicker && datePickerModal) {
    btnCloseDatePicker.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      datePickerModal.classList.remove("active");
      setTimeout(() => {
        datePickerModal.classList.add("hidden");
      }, 150);
    };
  }

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
      const newStartDate = document.getElementById("edit-student-startdate").value;
      const newLevel = document.getElementById("edit-student-level").value;

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

      try {
        let success = false;

        // [Comment Policy: Supabase 고속 DB 단독 연동]
        if (typeof updateStudentInfoInSupabase === "function") {
          try {
            success = await updateStudentInfoInSupabase(targetId, newStartDate, newLevel);
          } catch (sbErr) {
            console.error("[Admin] Supabase 학생 정보 수정 오류:", sbErr);
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
        if (globalLoader) {
          globalLoader.classList.remove("active");
          globalLoader.classList.add("hidden");
        }
      }
    };
  }
}
