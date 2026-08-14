/**
 * [Comment Policy: 선생님 대시보드 및 어드민 관리 모듈 (admin.js)]
 * 학생들의 전체 학습 진도 모니터링, 필터링 검색, 날짜 선택 피커 구현, 
 * 그리고 시작일/레벨을 강제 교정하여 구글 스프레드시트 진도를 재생성하는 어드민 관리 인터페이스를 전담합니다.
 */

// 어드민 제어 전역 변수
let adminHeaders = ["ID", "Name", "Role", "LastLogin", "학습시작일", "레벨"];
let pickerYear = 2026;
let pickerMonth = 6;

/**
 * [Comment Policy: 오프라인 학생 데이터 수집]
 * 로컬 Mock 사용자의 스토리지 데이터를 돌며 가상의 학생 전체 현황 데이터를 빌드합니다.
 * 이를 통해 스프레드시트가 오프라인이더라도 대시보드 기능을 완전하게 실증 테스트할 수 있습니다.
 * @returns {Promise<Array>}
 */
async function collectMockStudentsData() {
  const students = [];
  const mockKeys = Object.keys(MOCK_USER_DB).filter(id => MOCK_USER_DB[id].role === "student");

  for (const id of mockKeys) {
    const localKey = `planner_session_${id}`;
    let data = localStorage.getItem(localKey);

    if (!data) {
      // 로컬 스토리지 데이터가 없으면 모의로 생성
      await generateMockPlannerState(id);
      data = localStorage.getItem(localKey);
    }

    if (data) {
      const parsed = JSON.parse(data);
      const studentName = MOCK_USER_DB[id].name.split(" ")[0]; // 이름 부분만 추출

      // [Comment Policy: Mock 학생 언어 매핑 수정]
      // 이름에 포함된 모국어 정보를 매핑할 때, 우즈벡어 대신 새 모국어로 추가된 '영어'를 판독하여 'en' 코드로 바인딩하도록 수정합니다.
      let lang = "vi"; // 기본 언어 매핑을 한국어에서 베트남어로 변경
      if (MOCK_USER_DB[id].name.includes("중국어")) lang = "zh";
      if (MOCK_USER_DB[id].name.includes("베트남어")) lang = "vi";
      if (MOCK_USER_DB[id].name.includes("영어")) lang = "en";

      // 진도율 계산 (90개 회차 중 학습 완료인 회차 수 계산)
      const completedSessions = parsed.words.filter(w => w.status === "학습 완료").length;
      const hasAnyLate = parsed.words.some(w => w.status === "지각");
      const recentDates = [];

      parsed.words.forEach(w => {
        if (w.attendanceDate) {
          const cleanDateStr = w.attendanceDate.replace(/-/g, '/');
          recentDates.push(new Date(cleanDateStr));
        }
      });

      // 최근 학습일자 중 가장 최신 구하기
      let lastStudyStr = "기록 없음";
      if (recentDates.length > 0) {
        const maxDate = new Date(Math.max(...recentDates.map(d => d.getTime())));
        // 날짜를 YYYY-MM-DD HH:MM 형태의 읽기 편한 포맷으로 변환
        const y = maxDate.getFullYear();
        const m = String(maxDate.getMonth() + 1).padStart(2, '0');
        const d = String(maxDate.getDate()).padStart(2, '0');
        const hr = String(maxDate.getHours()).padStart(2, '0');
        const mn = String(maxDate.getMinutes()).padStart(2, '0');
        lastStudyStr = `${y}-${m}-${d} ${hr}:${mn}`;
      }

      students.push({
        id: id,
        name: studentName,
        lang: lang,
        lastStudyDate: lastStudyStr,
        progress: `${completedSessions} / 90회차 완료`,
        completedDays: completedSessions,
        isLate: hasAnyLate,
        startDate: parsed.words.length > 0 ? parsed.words[0].startDate : "-",
        rawWords: parsed.words // 모달 상세 렌더링에 사용
      });
    }
  }
  return students;
}

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
        console.warn("구글 API 호출 실패로 로컬 폴백을 시도합니다.", err);
      }
    }

    // 2. 연동이 실패했거나 오프라인인 경우 로컬 Mock 데이터 병합
    if (!students) {
      console.warn("전체 학생 데이터를 로컬 Mock 저장소에서 빌드합니다.");
      students = await collectMockStudentsData();
      adminHeaders = ["ID", "Name", "Role", "LastLogin", "학습시작일", "레벨"];
      updateConnectionStatus(false);
    }

    allStudentsData = students;

    // 3. 필터링 및 검색 이벤트 바인딩
    bindAdminFilters();

    // 4. 테이블 그리기
    renderStudentTable(allStudentsData);

    // 5. 신규 관리 기능 이벤트 리스너 바인딩 (최초 1회 등록)
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

  // 실시간 타이핑 검색 및 변경 반영을 위해 이벤트 바인딩
  const handler = () => applyFilters(searchInput.value, langSelect.value, lateCheck.checked);

  searchInput.removeEventListener("input", handler);
  langSelect.removeEventListener("change", handler);
  lateCheck.removeEventListener("change", handler);

  searchInput.addEventListener("input", handler);
  langSelect.addEventListener("change", handler);
  lateCheck.addEventListener("change", handler);
}

/**
 * [Comment Policy: 대시보드 검색 필터 적용]
 * 입력된 조건(이름/ID, 모국어, 지각 유무)에 부합하는 학생 행만 동적 필터링합니다.
 */
function applyFilters(query, lang, isLateOnly) {
  const filtered = allStudentsData.filter(student => {
    // 1. 이름 또는 학번 부분 매칭
    const cleanQuery = query.trim().toLowerCase();
    const matchesQuery = !cleanQuery || 
                         student.name.toLowerCase().includes(cleanQuery) || 
                         student.id.toLowerCase().includes(cleanQuery);

    // 2. 모국어 매핑 매칭
    const matchesLang = !lang || student.lang === lang;

    // 3. 지각 발생 여부 매칭
    const matchesLate = !isLateOnly || student.isLate;

    return matchesQuery && matchesLang && matchesLate;
  });

  renderStudentTable(filtered);
}

/**
 * [Comment Policy: 학생 관리 테이블 드로잉]
 * HTML 테이블 영역 내에 가공된 필터링 데이터를 표 리스트로 노출하며 행 클릭 리스너를 결합합니다.
 */
function renderStudentTable(students) {
  const tbody = document.getElementById("student-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (students.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--color-text-secondary); padding: 30px;">
          조건에 부합하는 학생 정보가 존재하지 않습니다.
        </td>
      </tr>
    `;
    return;
  }

  students.forEach(student => {
    const tr = document.createElement("tr");

    // 지각 여부에 따라 테이블 행에 적색 테두리 등 스타일 구분 클래스 토글
    if (student.isLate) {
      tr.classList.add("late-row");
    }

    // 모국어 뱃지 텍스트 파악
    let langLabel = "베트남어";
    if (student.lang === "zh") langLabel = "중국어";
    if (student.lang === "en") langLabel = "영어";

    // 지각 시각 배지 생성
    const lateBadge = student.isLate ? `<span class="dashboard-badge late">지각 경고</span>` : `<span class="dashboard-badge normal">정상</span>`;

    // 90회차 중 완료된 진도를 % 게이지바로 연산 (완료 회차수 / 90 * 100)
    const progressRate = Math.round((student.completedDays / 90) * 100);

    tr.innerHTML = `
      <td>${student.id}</td>
      <td class="bold">${student.name}</td>
      <td><span class="lang-tag ${student.lang}">${langLabel}</span></td>
      <td>${student.lastStudyDate || "학습 전"}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="progress-bar-container" style="flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; width: 60px;">
            <div style="width: ${progressRate}%; height: 100%; background: ${student.isLate ? 'var(--color-secondary)' : 'var(--color-primary)'}; border-radius: 3px;"></div>
          </div>
          <span style="font-size: 0.78rem; color: var(--color-text-secondary); min-width: 28px;">${progressRate}%</span>
        </div>
      </td>
      <td>${lateBadge}</td>
      <td>
        <div style="display: flex; gap: 8px; justify-content: center;">
          <button class="btn-action-primary" onclick="showStudentDetailModal('${student.id}'); event.stopPropagation();">진도 보기</button>
          <button class="btn-action-secondary" onclick="showAdminEditModal('${student.id}'); event.stopPropagation();">정보 수정</button>
        </div>
      </td>
    `;

    // 행 자체 클릭 시에도 자연스럽게 진도 모달이 열리도록 조치
    tr.addEventListener("click", () => {
      showStudentDetailModal(student.id);
    });

    tbody.appendChild(tr);
  });
}

/**
 * [Comment Policy: 관리자 수정 다이어로그 생성]
 * 학생 관리 수정 모달창을 기동하고 현재 설정되어 있는 학생의 시작일과 레벨을 인풋에 이식합니다.
 * @param {string} studentId
 */
function showAdminEditModal(studentId) {
  const modal = document.getElementById("admin-edit-modal");
  const editStudentId = document.getElementById("edit-student-id");
  const editStudentName = document.getElementById("edit-student-name");
  const editStudentStartDate = document.getElementById("edit-student-start-date");
  const editStudentLevel = document.getElementById("edit-student-level");

  if (!modal || !editStudentId) return;

  // 캐싱된 목록에서 대상 학생 정보 서치
  const student = allStudentsData.find(s => s.id === studentId);
  if (!student) return;

  editStudentId.value = student.id;
  editStudentName.value = student.name;
  editStudentStartDate.value = student.startDate || "";
  // 학생 등급 지정
  // [Comment Policy: active_user 보관소를 sessionStorage로 통일하여 브라우저 종료 시 초기화]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
  const levelVal = (activeUser && activeUser.id === studentId) ? activeUser.level : (student.rawWords && student.rawWords.length > 0 ? (student.rawWords[0].level || "단어장-초급") : "단어장-초급");
  editStudentLevel.value = levelVal;

  modal.classList.remove("hidden");
  void modal.offsetWidth;
  modal.classList.add("active");
}

/**
 * [Comment Policy: 관리자 수정 다이어로그 닫기]
 */
function closeAdminEditModal() {
  const modal = document.getElementById("admin-edit-modal");
  if (!modal) return;
  modal.classList.remove("active");
  setTimeout(() => {
    if (!modal.classList.contains("active")) {
      modal.classList.add("hidden");
    }
  }, 350);
}

/**
 * [Comment Policy: 커스텀 날짜 선택기(DatePicker) 모달 활성화]
 */
function showAdminDatePicker() {
  const dateInput = document.getElementById("edit-student-start-date");
  if (!dateInput) return;

  const currentVal = dateInput.value;
  if (currentVal && currentVal !== "-") {
    const parsed = parseLocalDate(currentVal);
    pickerYear = parsed.getFullYear();
    pickerMonth = parsed.getMonth();
  } else {
    const today = new Date();
    pickerYear = today.getFullYear();
    pickerMonth = today.getMonth();
  }

  const pickerModal = document.getElementById("admin-datepicker-modal");
  if (pickerModal) {
    pickerModal.classList.remove("hidden");
    void pickerModal.offsetWidth;
    pickerModal.classList.add("active");
    renderPickerCalendar();
  }
}

/**
 * [Comment Policy: 커스텀 날짜 선택기 모달 닫기]
 */
function closeAdminDatePicker() {
  const pickerModal = document.getElementById("admin-datepicker-modal");
  if (!pickerModal) return;
  pickerModal.classList.remove("active");
  setTimeout(() => {
    if (!pickerModal.classList.contains("active")) {
      pickerModal.classList.add("hidden");
    }
  }, 250);
}

/**
 * [Comment Policy: 커스텀 DatePicker 캘린더 그리드 빌드]
 * 년/월 스크롤 네비게이션에 맞춰 요일 정렬 및 평일(선택가능)과 주말(Dimmed) 스타일링을 구분 작성합니다.
 */
function renderPickerCalendar() {
  const title = document.getElementById("picker-calendar-title");
  const grid = document.getElementById("picker-calendar-grid");
  if (!title || !grid) return;

  title.textContent = `${pickerYear}년 ${pickerMonth + 1}월`;
  grid.innerHTML = "";

  const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
  const lastDate = new Date(pickerYear, pickerMonth + 1, 0).getDate();

  // 요일 빈칸 추가
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }

  // 일자 노드 생성
  for (let d = 1; d <= lastDate; d++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day picker-day-cell";
    cell.textContent = d;

    const cellDate = new Date(pickerYear, pickerMonth, d);
    const dayOfWeek = cellDate.getDay();

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // 주말인 경우 비활성화
      cell.classList.add("dimmed");
      cell.style.cursor = "not-allowed";
    } else {
      // 평일인 경우 클릭 이벤트 매핑
      cell.addEventListener("click", () => {
        const formatted = getLocalDateString(cellDate);
        const dateInput = document.getElementById("edit-student-start-date");
        if (dateInput) {
          dateInput.value = formatted;
        }
        closeAdminDatePicker();
      });
    }

    grid.appendChild(cell);
  }
}

/**
 * [Comment Policy: 학생용 상세 진도율 모달 노출 및 캘린더 요약 로그 생성]
 * 해당 학생의 30일(총 90회차)에 배정된 출석 요일 리스트 및 완료/지각 스탬프 히스토리를 
 * 사용자 팝업창 내에 타임라인 형태로 가독성 있게 출력합니다.
 * @param {string} studentId 
 */
function showStudentDetailModal(studentId) {
  const modal = document.getElementById("student-modal");
  const titleName = document.getElementById("modal-student-name");
  const progressText = document.getElementById("modal-student-progress");
  const logScroll = document.getElementById("modal-log-scroll");

  if (!modal || !logScroll) return;

  const student = allStudentsData.find(s => s.id === studentId);
  if (!student) return;

  // 1. 헤더 텍스트 주입
  titleName.textContent = student.name;
  progressText.textContent = `현재 전체 진도율: ${student.progress}`;

  // 2. 히스토리 요일 스탬프 목록 리셋 및 빌드
  logScroll.innerHTML = "";

  if (!student.rawWords || student.rawWords.length === 0) {
    logScroll.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); padding: 20px;">출석 및 세션 기록이 없습니다.</div>`;
  } else {
    student.rawWords.forEach(w => {
      const item = document.createElement("div");
      item.className = "word-log-item";

      // 지각/정상 뱃지 분기 마크업
      let statusClass = "status-not-started";
      let statusTxt = "시작 전";

      if (w.status === "학습 완료") {
        statusClass = "status-completed";
        statusTxt = "학습 완료";
      } else if (w.status === "지각") {
        statusClass = "status-late";
        statusTxt = "지각";
      } else if (w.status === "학습 전") {
        statusClass = "status-ready";
        statusTxt = "학습 전";
      }

      const isLateBadge = `<span class="log-status-badge ${statusClass}">${statusTxt}</span>`;

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="word-log-day">${w.dayLabel} (${w.session}회차)</span>
          <span class="word-log-range" style="font-size: 0.75rem; color: var(--color-text-secondary);">(${w.startDate})</span>
          ${isLateBadge}
        </div>
        <span class="word-log-date">${w.attendanceDate || "-"}</span>
      `;
      logScroll.appendChild(item);
    });
  }

  // 4. 모달 노출 활성화
  modal.classList.remove("hidden");
  void modal.offsetWidth; // 리플로우 강제 트리거
  modal.classList.add("active");
}

/**
 * [Comment Policy: 상세 정보 모달 비활성화]
 * 모달창을 닫고 hidden 상태로 전환합니다.
 */
function closeStudentModal() {
  const modal = document.getElementById("student-modal");
  if (!modal) return;
  modal.classList.remove("active");

  setTimeout(() => {
    if (!modal.classList.contains("active")) {
      modal.classList.add("hidden");
    }
  }, 350);
}

/**
 * [Comment Policy: 어드민 페이지 관리 이벤트 리스너 바인딩]
 * 달력/DatePicker 네비게이션 버튼 및 수정 폼 전송 이벤트를 통합 등록합니다.
 */
function bindAdminEditEvents() {
  const adminEditForm = document.getElementById("admin-edit-form");
  const btnPrevPicker = document.getElementById("btn-prev-picker");
  const btnNextPicker = document.getElementById("btn-next-picker");
  const editStudentStartDate = document.getElementById("edit-student-start-date");

  if (!adminEditForm || !btnPrevPicker || !btnNextPicker || !editStudentStartDate) return;

  // 1. DatePicker 입력창 포커스 시 모달 띄우기
  editStudentStartDate.onclick = (e) => {
    e.preventDefault();
    showAdminDatePicker();
  };

  // 2. DatePicker 이전 월 이동 버튼
  btnPrevPicker.onclick = (e) => {
    e.preventDefault();
    pickerMonth--;
    if (pickerMonth < 0) {
      pickerMonth = 11;
      pickerYear--;
    }
    renderPickerCalendar();
  };

  // 3. DatePicker 다음 월 이동 버튼
  btnNextPicker.onclick = (e) => {
    e.preventDefault();
    pickerMonth++;
    if (pickerMonth > 11) {
      pickerMonth = 0;
      pickerYear++;
    }
    renderPickerCalendar();
  };

  // 4. 정보 수정 폼 서브밋 처리 (대안 B: 출석 정보 복사 후 90일 재작성 마이그레이션)
  adminEditForm.onsubmit = async (e) => {
    e.preventDefault();

    const targetId = document.getElementById("edit-student-id").value;
    const newStartDate = editStudentStartDate.value;
    const newLevel = document.getElementById("edit-student-level").value;

    if (!newStartDate || newStartDate === "-") {
      alert("학습 시작일을 올바르게 선택해 주세요.");
      return;
    }

    const globalLoader = document.getElementById("global-loading-overlay");
    if (globalLoader) {
      globalLoader.classList.remove("hidden");
      globalLoader.classList.add("active");
    }

    let success = false;
    let isGoogleFetch = !!GOOGLE_SCRIPT_URL;

    try {
      if (isGoogleFetch) showConnectionLoading();
      if (GOOGLE_SCRIPT_URL) {
        // 1. 구글 시트 연동 모드: 정보 갱신 및 마이그레이션 재생성 API 요청
        const requestUrl = `${GOOGLE_SCRIPT_URL}?action=updateStudentInfo&id=${encodeURIComponent(targetId)}&newStartDate=${encodeURIComponent(newStartDate)}&newLevel=${encodeURIComponent(newLevel)}&_=${Date.now()}`;
        const response = await fetch(requestUrl);
        if (response.ok) {
          const result = await response.json();
          if (result && result.success) {
            success = true;
          }
        }
      } else {
        // 2. 로컬 Mock 모드 폴백: 로컬스토리지 상의 출석을 파악 후 90일 스케줄 동적 재생성
        const localKey = `planner_session_${targetId}`;
        const localData = localStorage.getItem(localKey);
        const completedMap = {}; // "dayLabel:session" -> attendanceDate

        if (localData) {
          const parsed = JSON.parse(localData);
          parsed.words.forEach(w => {
            if (w.attendanceDate) {
              completedMap[`${w.dayLabel}:${w.session}`] = w.attendanceDate;
            }
          });
        }

        // 평일 리스트 90일 연산
        const startDay = parseLocalDate(newStartDate);
        while (startDay.getDay() === 0 || startDay.getDay() === 6) {
          startDay.setDate(startDay.getDate() + 1);
        }

        const tempD = new Date(startDay);
        const workdayList = [];
        while (workdayList.length < 90) {
          if (tempD.getDay() !== 0 && tempD.getDay() !== 6) {
            workdayList.push(getLocalDateString(tempD));
          }
          tempD.setDate(tempD.getDate() + 1);
        }

        // 단어장 단어에서 일차 추출
        if (!isWordsLoaded) {
          await loadWordDatabase();
        }
        const daysMap = {};
        const daysOrdered = [];
        wordDatabase.forEach(w => {
          if (w.dayLabel && !daysMap[w.dayLabel]) {
            daysMap[w.dayLabel] = true;
            daysOrdered.push(w.dayLabel);
          }
        });

        const maxDays = Math.min(daysOrdered.length, 30);
        const words = [];
        let dayCounter = 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();

        for (let d = 0; d < maxDays; d++) {
          const dayLabel = daysOrdered[d];
          const dayEndDateStr = workdayList[dayCounter + 2];

          for (let session = 1; session <= 3; session++) {
            const dateStr = workdayList[dayCounter++];
            const key = `${dayLabel}:${session}`;

            let attDate = "";
            let status = "시작 전";

            if (completedMap[key]) {
              attDate = completedMap[key];
              status = "학습 완료";
            } else {
              const dEndDate = parseLocalDate(dayEndDateStr);
              dEndDate.setHours(0, 0, 0, 0);
              const dStartDate = parseLocalDate(workdayList[d * 3]);
              dStartDate.setHours(0, 0, 0, 0);

              if (todayTime > dEndDate.getTime()) {
                status = "지각";
              } else if (todayTime >= dStartDate.getTime()) {
                status = "학습 전";
              } else {
                status = "시작 전";
              }
            }

            words.push({
              recordTime: new Date().toLocaleString(),
              studentId: targetId,
              dayLabel: dayLabel,
              session: session,
              startDate: dateStr,
              endDate: dayEndDateStr,
              attendanceDate: attDate,
              status: status
            });
          }
        }

        const newState = { success: true, words: words };
        localStorage.setItem(localKey, JSON.stringify(newState));
        success = true;

        // 만약 수정한 대상이 현재 로그인한 유저 본인이라면 메모리 캐시도 교체
        // [Comment Policy: active_user 보관소를 sessionStorage로 통일하여 브라우저 종료 시 초기화]
        const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
        if (activeUser && activeUser.id === targetId) {
          activeUser.level = newLevel;
          sessionStorage.setItem("active_user", JSON.stringify(activeUser));
          plannerState = newState;
        }
      }

      if (success) {
        closeAdminEditModal();
        alert("학생 학습 계획 정보가 정상 수정 및 재생성되었습니다.");
        // 대시보드 리로드
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
