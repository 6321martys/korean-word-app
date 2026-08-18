/**
 * [Comment Policy: 플래너 및 달력 연산 모듈 (planner.js)]
 * 주말 포함 연속 90일 학습 일정 조회, 달력 일자 그리드 구성 및 지각/완료/학습전 3가지 상태 렌더링을 제어합니다.
 * 구글 스프레드시트 단일 소스 원칙에 따라 로컬 Mock 데이터를 완전히 배제하고 실시간 API 응답을 동기화합니다.
 */

// 플래너 달력 및 세션 상태 전역 변수
let plannerState = null;       // 학생 플래너 세션 정보 객체
let currentSelectedDay = "";   // 현재 선택된 학습 일차 (예: "Day 1")
let currentSelectedSession = 1;// 현재 선택된 학습 회차 (1, 2, 3)
let calendarYear = 2026;       // 달력 활성 년도
let calendarMonth = 6;         // 달력 활성 월 (0: 1월, 6: 7월)

/**
 * 윈도우 시간대 오차(Timezone Offset)를 배제하고 로컬 시간 객체를 구하는 파서 헬퍼
 * @param {string} dateStr (YYYY-MM-DD)
 * @returns {Date}
 */
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  return new Date(dateStr);
}

/**
 * 날짜 객체를 YYYY-MM-DD 형태의 로컬 문자열로 포맷하는 헬퍼 함수
 * @param {Date} date 
 * @returns {string}
 */
function getLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 학생의 90일 연속 일정 단어 배정 및 요일 진도 데이터를 조회합니다.
 * @param {string} studentId
 */
async function loadPlannerState(studentId) {
  let isGoogleFetch = !!GOOGLE_SCRIPT_URL;
  try {
    if (isGoogleFetch) showConnectionLoading();
    let state = null;

    if (GOOGLE_SCRIPT_URL) {
      // 1. [구글 스프레드시트 연동] 플래너 세션 조회 API 요청
      const requestUrl = `${GOOGLE_SCRIPT_URL}?action=getPlannerState&id=${encodeURIComponent(studentId)}&_=${Date.now()}`;
      const response = await fetch(requestUrl);
      if (response.ok) {
        const result = await response.json();
        if (result && result.success) {
          state = result;
          console.log("[Google Sheets] 플래너 상태 로드 성공:", state);
          updateConnectionStatus(true);
        }
      }
    }

    // [이중 안전장치] 구글 연동은 성공했으나 학습기록(words)이 비어있는 경우 즉시 90일 일정을 신규 생성합니다.
    if (state && state.success && (!state.words || state.words.length === 0)) {
      console.warn("학습 기록이 비어있어 90일 일정을 새로 구성합니다.");
      const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
      const level = (activeUser && activeUser.level) ? activeUser.level : "단어장-초급";

      const globalLoader = document.getElementById("global-loading-overlay");
      if (globalLoader) {
        globalLoader.classList.remove("active");
        globalLoader.classList.add("hidden");
      }

      const overlay = document.getElementById("bulk-register-overlay");
      if (overlay) {
        overlay.classList.remove("hidden");
        overlay.classList.add("active");
      }

      const registerSuccess = await registerPlannerWithGoogleSheet(studentId, level);

      if (overlay) {
        overlay.classList.remove("active");
        overlay.classList.add("hidden");
      }

      if (registerSuccess) {
        if (globalLoader) {
          globalLoader.classList.remove("hidden");
          globalLoader.classList.add("active");
        }
        return loadPlannerState(studentId);
      }
    }

    if (!state || !state.success) {
      showError("구글 스프레드시트에서 학습 일정을 불러오지 못했습니다. 네트워크 연결 및 서버 주소를 확인해 주세요.");
      updateConnectionStatus(false);
      return;
    }

    // 전역 상태에 바인딩
    plannerState = state;

    // 가장 첫 번째 회차의 시작일을 기준으로 달력의 활성화 월 설정
    if (plannerState.words && plannerState.words.length > 0) {
      plannerState.startDate = plannerState.words[0].startDate;
      plannerState.endDate = plannerState.words[plannerState.words.length - 1].endDate;

      const baseDate = parseLocalDate(plannerState.startDate);
      calendarYear = baseDate.getFullYear();
      calendarMonth = baseDate.getMonth();
    }

    // 2. 플래너 달력 렌더링 및 상태 반영
    updatePlannerUI();

  } catch (error) {
    console.error("플래너 상태 초기화 실패:", error);
    showError("학습 일정을 불러오는 중 통신 오류가 발생했습니다.");
    updateConnectionStatus(false);
  } finally {
    if (isGoogleFetch) hideConnectionLoading();
  }
}

/**
 * 플래너 달력 UI 렌더링 및 누적 단어수를 갱신합니다.
 */
function updatePlannerUI() {
  if (!plannerState) return;

  // 1. 달력 타이틀 세팅
  calendarTitle.textContent = `${calendarYear}년 ${calendarMonth + 1}월`;

  // 2. 달력 그리드 생성
  renderCalendarGrid();

  // 3. 누적 학습 단어수 숫자 박스 동적 렌더링
  updateLearningStatus();
}

/**
 * 윤년 및 월별 날짜를 계산하여 HTML 캘린더 그리드를 작성합니다.
 * [개편] 주말 제외 없이 연속 90일 전체가 정상 학습일로 배정되며, 모든 90일 회차가 상시 오픈됩니다.
 */
function renderCalendarGrid() {
  calendarGrid.innerHTML = ""; // 기존 그리드 리셋

  // 해당 월의 첫 번째 일자의 요일 및 마지막 날짜 계산
  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
  const lastDayDate = new Date(calendarYear, calendarMonth + 1, 0).getDate();

  // 이전 달 여백 추가 (empty 셀)
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty";
    calendarGrid.appendChild(emptyCell);
  }

  const todayStr = getLocalDateString(new Date());

  // 일자 셀 렌더링
  for (let date = 1; date <= lastDayDate; date++) {
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day";

    // 일자 숫자 추가
    const dayNum = document.createElement("span");
    dayNum.className = "day-number";
    dayNum.textContent = date;
    dayCell.appendChild(dayNum);

    // 날짜 스트링 포맷 연산
    const currentFullDate = new Date(calendarYear, calendarMonth, date);
    const dateStr = getLocalDateString(currentFullDate);

    // 오늘 날짜 하이라이트
    if (dateStr === todayStr) {
      dayCell.classList.add("today");
    }

    // 신규 90일 연속 회차 매핑 (해당 날짜에 배정된 회차 레코드 검색)
    const activeRecord = plannerState.words.find(w => w.startDate === dateStr);

    if (activeRecord) {
      dayCell.className = "calendar-day active-period";

      // 요일구분(Day X)과 회차(Y회차) 정보를 뱃지 속성으로 바인딩
      dayCell.setAttribute("data-day-label", `${activeRecord.dayLabel} (${activeRecord.session}회차)`);

      // [Comment Policy: 3가지 상태 클래스 부여]
      // 1. 학습 완료: completed-day (초록색)
      // 2. 지각: late-day (빨간색)
      // 3. 학습 전: study-ready-day (보라색 - 상시 진입 가능)
      if (activeRecord.status === "학습 완료") {
        dayCell.classList.add("completed-day");
      } else if (activeRecord.status === "지각") {
        dayCell.classList.add("late-day");
      } else {
        dayCell.classList.add("study-ready-day");
      }

      // 하단 진척 상태용 도트(Dot) 주입
      const statusDot = document.createElement("div");
      statusDot.className = "day-status-dot";
      dayCell.appendChild(statusDot);

      // [Comment Policy: 상시 진입 허용]
      // 회색 잠금 상태가 완전히 제거되었으므로 90일 모든 회차를 언제든 원하는 때에 클릭하여 학습 가능합니다.
      dayCell.addEventListener("click", () => {
        startStudySessionForDay(activeRecord.dayLabel, activeRecord.session);
      });
    }

    calendarGrid.appendChild(dayCell);
  }
}

/**
 * [Comment Policy: 학생의 총 학습 완료 단어 개수를 동적으로 계산하고 화면에 렌더링]
 * 완료된 회차 수를 세어 회차당 10단어를 곱하여 총 학습 단어 개수를 산출합니다.
 */
function updateLearningStatus() {
  if (!plannerState || !plannerState.words) return;

  const completedSessions = plannerState.words.filter(w => w.status === "학습 완료").length;
  const totalLearnedWords = completedSessions * 10;
  const wordCountText = document.getElementById("word-count-text");
  
  if (wordCountText) {
    wordCountText.textContent = totalLearnedWords;
  }
}

// ==========================================================================
// [신규] 최초 로그인 학생용 '학습 시작일 설정' 온보딩 달력 로직
// ==========================================================================
let onboardingSelectedDate = getLocalDateString(new Date());
let onboardingYear = new Date().getFullYear();
let onboardingMonth = new Date().getMonth();
let isOnboardingListenersBound = false;

/**
 * 한국어 날짜 포맷팅 헬퍼 (예: 2026년 8월 18일 (화))
 * @param {string} dateStr (YYYY-MM-DD)
 * @returns {string}
 */
function formatKoreanDate(dateStr) {
  const d = parseLocalDate(dateStr);
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
}

/**
 * [Comment Policy: 온보딩 시작일 피커 초기화]
 * 오늘 날짜를 기본값으로 설정하고 달력 그리드와 이벤트 리스너를 준비합니다.
 */
function initStartDatePicker() {
  const today = new Date();
  onboardingSelectedDate = getLocalDateString(today);
  onboardingYear = today.getFullYear();
  onboardingMonth = today.getMonth();

  // 이벤트 리스너 1회 바인딩
  if (!isOnboardingListenersBound) {
    const btnPrev = document.getElementById("btn-start-prev-month");
    const btnNext = document.getElementById("btn-start-next-month");

    if (btnPrev) {
      btnPrev.onclick = () => {
        onboardingMonth--;
        if (onboardingMonth < 0) {
          onboardingMonth = 11;
          onboardingYear--;
        }
        renderStartDatePickerGrid();
      };
    }

    if (btnNext) {
      btnNext.onclick = () => {
        onboardingMonth++;
        if (onboardingMonth > 11) {
          onboardingMonth = 0;
          onboardingYear++;
        }
        renderStartDatePickerGrid();
      };
    }

    isOnboardingListenersBound = true;
  }

  renderStartDatePickerGrid();
}

/**
 * [Comment Policy: 시작일 선택 달력 그리드 렌더링]
 */
function renderStartDatePickerGrid() {
  const titleElem = document.getElementById("start-date-calendar-title");
  const gridElem = document.getElementById("start-date-calendar-grid");
  const previewElem = document.getElementById("start-date-selected-preview");

  if (!gridElem || !titleElem) return;

  titleElem.textContent = `${onboardingYear}년 ${onboardingMonth + 1}월`;
  gridElem.innerHTML = "";

  if (previewElem) {
    previewElem.textContent = `선택한 시작일: ${formatKoreanDate(onboardingSelectedDate)}`;
  }

  const firstDayIndex = new Date(onboardingYear, onboardingMonth, 1).getDay();
  const lastDayDate = new Date(onboardingYear, onboardingMonth + 1, 0).getDate();
  const todayStr = getLocalDateString(new Date());

  // 이전 달 빈 셀
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty";
    gridElem.appendChild(emptyCell);
  }

  // 일자 셀 렌더링
  for (let d = 1; d <= lastDayDate; d++) {
    const cell = document.createElement("div");
    cell.className = "start-date-day-cell";

    const numSpan = document.createElement("span");
    numSpan.className = "day-number";
    numSpan.textContent = d;
    cell.appendChild(numSpan);

    const fullD = new Date(onboardingYear, onboardingMonth, d);
    const dateStr = getLocalDateString(fullD);
    const dayOfWeek = fullD.getDay();

    // 일요일/토요일 색상 클래스
    if (dayOfWeek === 0) cell.style.color = "hsl(354, 85%, 70%)";
    if (dayOfWeek === 6) cell.style.color = "hsl(200, 85%, 70%)";

    // 오늘 날짜 마커
    if (dateStr === todayStr) {
      cell.classList.add("today-marker");
    }

    // 현재 선택된 날짜 하이라이트
    if (dateStr === onboardingSelectedDate) {
      cell.classList.add("selected-start-day");
    }

    // 클릭 시 선택 날짜 변경
    cell.onclick = () => {
      onboardingSelectedDate = dateStr;
      renderStartDatePickerGrid();
    };

    gridElem.appendChild(cell);
  }
}

