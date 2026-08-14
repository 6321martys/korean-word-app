/**
 * [Comment Policy: 플래너 및 달력 연산 모듈 (planner.js)]
 * 90일 평일 단위의 학습 일정 생성, 달력 일자 그리드 구성 및 지각/완료 상태 렌더링을 제어합니다.
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
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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
 * 구글 API 연결 불가 시 브라우저에서 독립 작동할 수 있게 90일 평일 단위의 모의 데이터를 생성하는 헬퍼 함수
 * @param {string} studentId
 * @returns {object}
 */
async function generateMockPlannerState(studentId) {
  const localKey = `planner_session_${studentId}`;
  let localData = localStorage.getItem(localKey);
  // [Comment Policy: active_user 보관소를 sessionStorage로 통일하여 브라우저 종료 시 초기화]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
  const level = activeUser ? activeUser.level : "단어장-초급";

  if (localData) {
    const parsed = JSON.parse(localData);
    // 오늘 기준 로컬 모드에서 각 회차의 '지각' 여부를 동적으로 갱신하여 돌려줌
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTime = parseLocalDate(todayStr).getTime();

    parsed.words.forEach(w => {
      if (!w.attendanceDate) {
        const endTime = parseLocalDate(w.endDate).getTime();
        const startTime = parseLocalDate(w.startDate).getTime();

        if (todayTime > endTime) {
          w.status = "지각";
        } else if (todayTime >= startTime && todayTime <= endTime) {
          w.status = "학습 전";
        } else {
          w.status = "시작 전";
        }
      } else {
        w.status = "학습 완료";
      }
    });

    localStorage.setItem(localKey, JSON.stringify(parsed));
    return parsed;
  }

  // 데이터가 아예 없는 경우: 오늘 기준 평일 90일 스케줄 동적 계산
  console.log("[Mock DB] 최초 신규 일정을 로컬에 수립합니다.");
  const startDay = new Date();
  // 토/일요일 진입 시 평일로 이동
  while (startDay.getDay() === 0 || startDay.getDay() === 6) {
    startDay.setDate(startDay.getDate() + 1);
  }

  const workdayList = [];
  const tempD = new Date(startDay);
  while (workdayList.length < 90) {
    if (tempD.getDay() !== 0 && tempD.getDay() !== 6) {
      workdayList.push(getLocalDateString(tempD));
    }
    tempD.setDate(tempD.getDate() + 1);
  }

  // 1일차~30일차별 3회차 단어 구성
  const mockWords = [];
  let dayCounter = 0;

  for (let d = 1; d <= 30; d++) {
    const dayLabel = `Day ${d}`;
    const dayEndDateStr = workdayList[dayCounter + 2]; // 3회차 시작일이 곧 이 Day의 종료 기준일

    for (let session = 1; session <= 3; session++) {
      mockWords.push({
        recordTime: new Date().toLocaleString(),
        studentId: studentId,
        dayLabel: dayLabel,
        session: session,
        startDate: workdayList[dayCounter++],
        endDate: dayEndDateStr,
        attendanceDate: "",
        status: "시작 전"
      });
    }
  }

  // 오늘 기준 학습 가능일자 활성화
  const todayStr = getLocalDateString(new Date());
  const todayTime = parseLocalDate(todayStr).getTime();

  mockWords.forEach(w => {
    const sTime = parseLocalDate(w.startDate).getTime();
    const eTime = parseLocalDate(w.endDate).getTime();

    if (todayTime > eTime) {
      w.status = "지각";
    } else if (todayTime >= sTime && todayTime <= eTime) {
      w.status = "학습 전";
    } else {
      w.status = "시작 전";
    }
  });

  const state = {
    success: true,
    words: mockWords
  };

  localStorage.setItem(localKey, JSON.stringify(state));
  return state;
}

/**
 * 학생의 90일 단위기간 단어 배정 및 요일 진도 데이터를 조회합니다.
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

    // [이중 안전장치] 구글 연동은 성공했으나 학습기록(words)이 아예 비어있는 경우
    // 최초 로그인 시점에 알 수 없는 이유로 생성이 생략되었거나 정리가 수행된 것으로 보고 90일 일정을 즉시 재생성합니다.
    if (state && state.success && (!state.words || state.words.length === 0)) {
      console.warn("학습 기록이 비어있어 90일 일정을 새로 구성합니다.");
      // [Comment Policy: active_user 보관소를 sessionStorage로 통일하여 브라우저 종료 시 초기화]
      const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
      const level = (activeUser && activeUser.level) ? activeUser.level : "단어장-초급";

      // [신규] 90일 생성 로딩창을 띄우기 전, 백그라운드의 일반 통신 로딩창은 은폐
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
        // 생성이 완료되었으므로 플래너 상태를 다시 로드합니다.
        // 이때 다시 로드하면서 일반 로딩창(global-loading-overlay)이 필요하므로 다시 켜줍니다.
        if (globalLoader) {
          globalLoader.classList.remove("hidden");
          globalLoader.classList.add("active");
        }
        return loadPlannerState(studentId);
      }
    }

    // 2. 만약 구글 API 연동이 비활성화되었거나 응답 오류 시 로컬 Mock 플래너 상태로 폴백
    if (!state) {
      console.warn("[Warning] 구글 API 미설정 또는 오류. 로컬 Mock 플래너 데이터를 활성화합니다.");
      state = await generateMockPlannerState(studentId);
      updateConnectionStatus(false);
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

    // 3. 플래너 달력 렌더링 및 지각 배지 반영
    updatePlannerUI();

  } catch (error) {
    console.error("플래너 상태 초기화 실패:", error);
  } finally {
    if (isGoogleFetch) hideConnectionLoading();
  }
}

/**
 * 플래너 달력 UI 렌더링 및 지각 경고 문구를 갱신합니다.
 */
function updatePlannerUI() {
  if (!plannerState) return;

  // 1. 달력 타이틀 세팅
  calendarTitle.textContent = `${calendarYear}년 ${calendarMonth + 1}월`;

  // 2. 달력 그리드 생성
  renderCalendarGrid();

  // [Comment Policy: 3. 누적 학습 단어수 숫자 박스 동적 렌더링 호출]
  // 기획서 개편 레이아웃에 포함된 동적 단어 수 렌더링 함수를 달력 UI 갱신 시점에 함께 구동합니다.
  updateLearningStatus();
}

/**
 * 윤년 및 월별 날짜를 계산하여 HTML 캘린더 그리드를 작성합니다.
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

    // 날짜 스트링 포맷 연산 (시간대 오차 방지를 위해 로컬 스트링 헬퍼 사용)
    const currentFullDate = new Date(calendarYear, calendarMonth, date);
    const dateStr = getLocalDateString(currentFullDate);
    const dayOfWeek = currentFullDate.getDay();

    // 1. 주말(토/일요일) Dimmed 처리
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      dayCell.classList.add("dimmed");
    }

    // 2. 오늘 날짜 하이라이트
    if (dateStr === todayStr) {
      dayCell.classList.add("today");
    }

    // 3. 신규 90일 회차 매핑
    // 해당 날짜에 시작되는 학습 회차 레코드가 있는지 검사
    const activeRecord = plannerState.words.find(w => w.startDate === dateStr);

    if (activeRecord && dayOfWeek !== 0 && dayOfWeek !== 6) {
      // 미래 날짜 잠금 여부 계산:
      // 이 회차가 속한 Day 전체의 1회차(session === 1) 시작일을 기준으로 잠금 판단
      const dayStartRecord = plannerState.words.find(w => w.dayLabel === activeRecord.dayLabel && w.session === 1);
      const dayStartStr = dayStartRecord ? dayStartRecord.startDate : activeRecord.startDate;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTime = today.getTime();

      const dayStartDate = parseLocalDate(dayStartStr);
      dayStartDate.setHours(0, 0, 0, 0);
      const dayStartTime = dayStartDate.getTime();

      const isFuture = todayTime < dayStartTime;

      dayCell.className = "calendar-day active-period";

      // 요일구분(Day X)과 회차(Y회차) 정보를 속성으로 바인딩
      dayCell.setAttribute("data-day-label", `${activeRecord.dayLabel} (${activeRecord.session}회차)`);

      // 상태별 클래스 부여
      if (activeRecord.status === "학습 완료") {
        dayCell.classList.add("completed-day");
      } else if (activeRecord.status === "지각") {
        dayCell.classList.add("late-day");
      } else if (activeRecord.status === "학습 전") {
        dayCell.classList.add("study-ready-day"); // 학습 전 (대기 상태)
      } else {
        dayCell.classList.add("not-started-day");  // 시작 전
      }

      // 하단 진척 상태용 도트(Dot) 주입
      const statusDot = document.createElement("div");
      statusDot.className = "day-status-dot";
      dayCell.appendChild(statusDot);

      // 미래의 Day라면 클릭을 잠그고 스타일링 적용
      if (isFuture) {
        dayCell.classList.add("future-day");
      } else {
        // 미래가 아니거나 지난 학습/복습인 경우에만 클릭 이벤트 허용
        dayCell.addEventListener("click", () => {
          startStudySessionForDay(activeRecord.dayLabel, activeRecord.session);
        });
      }
    }

    calendarGrid.appendChild(dayCell);
  }
}

/**
 * [Comment Policy: 학생의 총 학습 완료 단어 개수를 동적으로 계산하고 화면에 렌더링]
 * 완료(또는 지각 상태인 완료된) 회차 수를 세어 10을 곱하여 총 학습 단어 개수를 구한 뒤,
 * #word-count-text 엘리먼트의 텍스트로 주입합니다.
 */
function updateLearningStatus() {
  if (!plannerState || !plannerState.words) return;

  // 학습 완료되었거나 출석 기록(attendanceDate)이 존재하는 세션의 총 개수를 필터링합니다.
  const completedSessions = plannerState.words.filter(
    w => w.status === "학습 완료" || (w.attendanceDate && w.attendanceDate.trim() !== "")
  ).length;

  const totalLearnedWords = completedSessions * 10;
  const wordCountText = document.getElementById("word-count-text");
  
  if (wordCountText) {
    wordCountText.textContent = totalLearnedWords;
  }
}
