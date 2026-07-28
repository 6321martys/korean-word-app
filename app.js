/**
 * ==========================================================================
 * 한국어 단어 학습기 - 로그인 연동 자바스크립트
 * 구글 스프레드시트 연동 및 로컬 Mock 테스트 모드를 모두 지원합니다.
 * ==========================================================================
 */

// [중요 설정] 구글 스프레드시트 웹 앱(GAS) 배포 후 생성된 URL을 여기에 넣으세요.
// 이 변수가 비어있는 경우에는 로컬 Mock 데이터 기반으로 로그인 테스트가 진행됩니다.
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz0mmFTjqYQs8Irzpnqq1S6PFyvFHt4gUO_YCAL0iGItXL-d7br2yWp17Z9fPfSvxjI/exec";

// 로컬 테스트를 위한 가짜(Mock) 사용자 데이터베이스
// 스프레드시트 연동 전에 로그인 동작을 확인하는 용도로 사용됩니다.
const MOCK_USER_DB = {
  "2026-test1": { name: "김민준 (중국어)", role: "student" },
  "2026-test2": { name: "흐엉 (베트남어)", role: "student" },
  "2026-test3": { name: "아지즈 (우즈벡어)", role: "student" },
  "teacher-admin": { name: "선생님 (관리자)", role: "teacher" }
};

// ==========================================================================
// [신규 전역 변수] 단어 데이터 및 학습 플래너 상태 변수
// ==========================================================================
let wordDatabase = [];         // 전체 단어장 목록 저장 캐시
let currentStudyWords = [];    // 현재 학습 중인 10개 단어 목록
let currentWordIndex = 0;      // 현재 보고 있는 단어의 인덱스 (0 ~ 9)
let isWordsLoaded = false;     // 단어 데이터 로딩 여부 플래그
let plannerState = null;       // [신규] 학생 플래너 세션 정보 객체
let currentSelectedDay = "";   // [신규] 현재 학습 일차 (예: "Day 1")
let currentSelectedSession = 1;// [신규] 현재 학습 회차 (1, 2, 3)
let calendarYear = 2026;       // [신규] 달력 활성 년도
let calendarMonth = 6;         // [신규] 달력 활성 월 (0: 1월, 6: 7월)
let allStudentsData = [];      // [신규] 대시보드용 전체 학생 목록 캐시

// DOM 요소 캐싱
const loginSection = document.getElementById("login-section");
const welcomeSection = document.getElementById("welcome-section");
const loginForm = document.getElementById("login-form");
const studentIdInput = document.getElementById("student-id");
const errorMessage = document.getElementById("error-message");
const btnLogin = document.getElementById("btn-login");
const btnText = document.getElementById("btn-text");
const loginSpinner = document.getElementById("login-spinner");

const userDisplayId = document.getElementById("user-display-id");
const userRoleBadge = document.getElementById("user-role-badge");
const btnLogout = document.getElementById("btn-logout");

// 모국어 선택 드롭다운
const languageSelect = document.getElementById("language-select");

// [신규] 학습 플래너 관련 DOM 캐싱
const lateWarningBadge = document.getElementById("late-warning-badge");
const calendarTitle = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");
const btnPrevMonth = document.getElementById("btn-prev-month");
const btnNextMonth = document.getElementById("btn-next-month");

// 단어 학습 진행 카드 DOM
const studySection = document.getElementById("study-section");
const currentProgressNum = document.getElementById("current-progress-num");
const totalProgressNum = document.getElementById("total-progress-num");
const studyProgressBar = document.getElementById("study-progress-bar");

const studyWordKo = document.getElementById("study-word-ko");
const studyWordHint = document.getElementById("study-word-hint");
const studyWordTranslation = document.getElementById("study-word-translation");

const btnPrevWord = document.getElementById("btn-prev-word");
const btnNextWord = document.getElementById("btn-next-word");

const completionSection = document.getElementById("completion-section");
const btnGoMenu = document.getElementById("btn-go-menu");

// [신규] 선생님용 학생 정보 통합 편집 모달 DOM 캐싱
const adminEditModal = document.getElementById("admin-edit-modal");
const btnCloseEditModal = document.getElementById("btn-close-edit-modal");
const adminEditForm = document.getElementById("admin-edit-form");
const editStudentId = document.getElementById("edit-student-id");
const editStudentName = document.getElementById("edit-student-name");
const editStudentLevel = document.getElementById("edit-student-level");
const editStudentStartDate = document.getElementById("edit-student-startdate");
const btnOpenDatePicker = document.getElementById("btn-open-datepicker");
const btnCancelEdit = document.getElementById("btn-cancel-edit");
const editDynamicFieldsContainer = document.getElementById("edit-dynamic-fields-container");

// [신규] 학습시작일 지정을 위한 평일 달력 피커 DOM 캐싱
const adminDatePickerModal = document.getElementById("admin-date-picker-modal");
const btnCloseDatePicker = document.getElementById("btn-close-datepicker");
const btnPickerPrev = document.getElementById("btn-picker-prev");
const btnPickerNext = document.getElementById("btn-picker-next");
const pickerCalendarTitle = document.getElementById("picker-calendar-title");
const pickerCalendarGrid = document.getElementById("picker-calendar-grid");

// [신규] 선생님 대시보드 제어용 전역 변수
let adminHeaders = []; // 구글 시트 원본 학생 헤더 정보 캐시
let pickerYear = 2026;
let pickerMonth = 6;

/**
 * 페이지 초기화 시 자동 로그인 세션 복구 처리
 */
document.addEventListener("DOMContentLoaded", () => {
  // [Comment Policy: 초기화 감지]
  // 페이지 로드 시 구글 API 주소 설정 여부에 따라 초기 연동 상태 표시기를 렌더링하고,
  // 기존 로컬 로그인 세션 및 모달창의 이벤트 리스너를 바인딩합니다.
  updateConnectionStatus(!!GOOGLE_SCRIPT_URL);

  const savedUser = JSON.parse(localStorage.getItem("active_user"));
  if (savedUser) {
    showWelcomeScreen(savedUser);
  }

  // [Comment Policy: 모달 닫기 이벤트 핸들러 바인딩]
  const btnCloseModal = document.getElementById("btn-close-modal");
  const modalOverlay = document.getElementById("student-modal");
  
  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", closeStudentModal);
  }
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) {
        closeStudentModal();
      }
    });
  }

  // [Comment Policy: 선생님 로그아웃 이벤트 등록]
  const btnTeacherLogout = document.getElementById("btn-teacher-logout");
  if (btnTeacherLogout) {
    btnTeacherLogout.addEventListener("click", () => {
      localStorage.removeItem("active_user");
      studentIdInput.value = "";
      
      const teacherSection = document.getElementById("teacher-section");
      if (teacherSection) {
        teacherSection.classList.add("hidden");
        teacherSection.classList.remove("active");
      }
      loginSection.classList.add("active");
      loginSection.classList.remove("hidden");
    });
  }
});

/**
 * 로그인 폼 제출 이벤트 핸들러
 */
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault(); // 기본 폼 제출 동작 방지

  const studentId = studentIdInput.value.trim();
  if (!studentId) return;

  // 현재 사용자가 선택한 모국어 코드값 (ko, zh, vi)
  const selectedLang = languageSelect.value;

  // 로그인 시도 중 버튼 로딩 애니메이션 활성화
  setLoadingState(true);
  hideError();

  try {
    let userData = null;

    if (!GOOGLE_SCRIPT_URL) {
      // 1. [로컬 모드] 구글 주소가 지정되지 않은 경우 Mock DB에서 사용자 검증
      await delay(800); // 사용자 경험용 인위적 지연 (API 통신 느낌 구현)
      userData = MOCK_USER_DB[studentId];
      if (userData) {
        // 로컬 테스트 환경용 접속 기록 모의 업데이트 출력
        console.log(`[Mock DB] ${userData.name}님의 마지막 접속 기록 업데이트 완료: ${new Date().toLocaleString()}`);
      }
    } else {
      // 2. [실제 연동 모드] 구글 앱스 스크립트 웹 앱에 API 요청 전송
      userData = await verifyUserWithGoogleSheet(studentId);
    }

    if (userData) {
      // 로그인 성공 시 데이터 보존 및 화면 전환
      const sessionData = {
        id: studentId,
        name: userData.name,
        role: userData.role,
        level: userData.level, // [수정] 누락되었던 학생 레벨 정보(초급/중급) 보존
        lang: selectedLang // 세션에 선택한 모국어 정보 저장
      };
      localStorage.setItem("active_user", JSON.stringify(sessionData));
      showWelcomeScreen(sessionData);
    } else {
      // 일치하는 ID가 없는 경우 에러 표시
      showError("일치하는 정보가 없습니다. 다시 확인해 주세요.");
    }
  } catch (error) {
    console.error("로그인 검증 오류:", error);
    showError("서버와의 통신에 실패했습니다. 인터넷 연결을 확인하세요.");
  } finally {
    setLoadingState(false);
  }
});

/**
 * 로그아웃 버튼 이벤트 처리
 */
btnLogout.addEventListener("click", () => {
  localStorage.removeItem("active_user"); // 로컬 세션 삭제
  studentIdInput.value = "";              // 입력 필드 초기화

  // [신규] 모든 학습 세션 및 상태를 초기화하고 화면을 숨김
  currentStudyWords = [];
  currentWordIndex = 0;
  
  welcomeSection.classList.add("hidden");
  welcomeSection.classList.remove("active");
  studySection.classList.add("hidden");
  studySection.classList.remove("active");
  completionSection.classList.add("hidden");
  completionSection.classList.remove("active");
  
  loginSection.classList.add("active");
  loginSection.classList.remove("hidden");
});

/**
 * 구글 스프레드시트에 식별자 검증 요청을 보내는 함수 (JSONP 또는 CORS 처리 대응)
 * @param {string} studentId 
 * @returns {Promise<object|null>}
 */
async function verifyUserWithGoogleSheet(studentId) {
  // 캐시 방지를 위한 타임스탬프 파라미터 포함하여 요청 전송
  const requestUrl = `${GOOGLE_SCRIPT_URL}?id=${encodeURIComponent(studentId)}&_=${Date.now()}`;

  try {
    const response = await fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();
    if (result && result.success) {
      updateConnectionStatus(true); // [Comment Policy: 구글 연동 뱃지 상태 업데이트]
      return {
        name: result.name || studentId,
        role: result.role || "student",
        level: result.level || "단어장-초급",
        isFirstLogin: !!result.isFirstLogin
      };
    }
  } catch (error) {
    updateConnectionStatus(false); // [Comment Policy: 구글 연동 실패 상태 업데이트]
    throw error;
  }
  return null;
}

/**
 * 로그인 성공 시 화면을 환영 페이지로 전환하는 함수
 * 최초 로그인 학생의 경우 90일 학습 경로 일괄 등록 절차를 수행합니다.
 * @param {object} user 
 */
async function showWelcomeScreen(user) {
  // [Comment Policy: 선생님 역할 로그인 세션 분기]
  // 로그인한 사용자의 권한이 'teacher'일 경우, 학생용 메인 메뉴 대신 선생님 전용 어드민 대시보드를 노출합니다.
  if (user.role === "teacher") {
    initTeacherDashboard();
    
    loginSection.classList.add("hidden");
    loginSection.classList.remove("active");
    
    const teacherSection = document.getElementById("teacher-section");
    if (teacherSection) {
      teacherSection.classList.add("active");
      teacherSection.classList.remove("hidden");
    }
    return;
  }

  // 최초 로그인인 경우 90일치 벌크 등록 수행
  if (user.isFirstLogin) {
    const overlay = document.getElementById("bulk-register-overlay");
    if (overlay) {
      overlay.classList.remove("hidden");
      overlay.classList.add("active");
    }
    
    // 백엔드 벌크 생성 요청
    let registerSuccess = false;
    if (GOOGLE_SCRIPT_URL) {
      registerSuccess = await registerPlannerWithGoogleSheet(user.id, user.level);
    } else {
      // 로컬 모드 폴백 (로컬 스토리지에 벌크 상태 적재 모의 처리)
      await delay(1500); // 1.5초 연출 대기
      registerSuccess = true;
    }
    
    if (overlay) {
      overlay.classList.remove("active");
      overlay.classList.add("hidden");
    }
    
    if (!registerSuccess) {
      showError("학습 일정을 생성하지 못했습니다. 관리자에게 문의해 주세요.");
      return;
    }
    
    // 최초 로그인 처리 완료로 상태 변경
    user.isFirstLogin = false;
    localStorage.setItem("active_user", JSON.stringify(user));
  }

  userDisplayId.textContent = user.name;

  // 선택한 모국어를 한글 이름으로 렌더링
  const userDisplayLang = document.getElementById("user-display-lang");
  if (userDisplayLang) {
    userDisplayLang.textContent = getLanguageName(user.lang);
  }

  // 유저 권한에 따라 웰컴 배지 스타일링 분기 처리
  userRoleBadge.className = "user-type-badge"; // 클래스 리셋
  userRoleBadge.textContent = "학생";
  userRoleBadge.classList.add("student");

  // [신규] 로그인 성공 즉시 플래너 시스템 및 단어장 백그라운드 로드 시작
  initPlannerSystem(user.id);

  // 섹션 전환 애니메이션 클래스 토글
  loginSection.classList.add("hidden");
  loginSection.classList.remove("active");
  welcomeSection.classList.add("active");
  welcomeSection.classList.remove("hidden");
}

/**
 * 최초 로그인 시 구글 시트에 90일 학습 일정을 벌크 생성하도록 백엔드에 요청합니다.
 * @param {string} studentId 
 * @param {string} level 
 * @returns {Promise<boolean>}
 */
async function registerPlannerWithGoogleSheet(studentId, level) {
  const requestUrl = `${GOOGLE_SCRIPT_URL}?action=registerPlanner&id=${encodeURIComponent(studentId)}&level=${encodeURIComponent(level)}&_=${Date.now()}`;
  try {
    const response = await fetch(requestUrl);
    if (!response.ok) throw new Error("Network response not ok");
    const result = await response.json();
    console.log("[Google Sheets] registerPlanner API 응답 데이터:", result);
    return !!(result && result.success);
  } catch (error) {
    console.error("일괄 등록 요청 오류:", error);
    return false;
  }
}

/**
 * 로그인 버튼 로딩 상태 토글
 * @param {boolean} isLoading 
 */
function setLoadingState(isLoading) {
  if (isLoading) {
    btnLogin.disabled = true;
    btnText.textContent = "검증 중...";
    loginSpinner.classList.remove("hidden");
  } else {
    btnLogin.disabled = false;
    btnText.textContent = "학습 시작하기";
    loginSpinner.classList.add("hidden");
  }
}

/**
 * 사용자 피드백용 임시 딜레이 프로미스
 * @param {number} ms 
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 오류 메시지 표시
 * @param {string} msg 
 */
function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.remove("hidden");
}

/**
 * 오류 메시지 숨김
 */
function hideError() {
  errorMessage.classList.add("hidden");
}

/**
 * [신규] 언어 코드값을 한글 이름으로 매핑해주는 헬퍼 함수
 * @param {string} langCode 
 * @returns {string}
 */
function getLanguageName(langCode) {
  const langs = {
    "ko": "한국어",
    "zh": "중국어",
    "vi": "베트남어"
  };
  return langs[langCode] || "한국어";
}

/**
 * [Comment Policy: 시간대 오차 방지 날짜 파서]
 * YYYY-MM-DD 포맷의 문자열을 시스템 로컬 시간대의 00:00:00 정각 기준으로 정확히 파싱합니다.
 * 자바스크립트 기본 new Date("YYYY-MM-DD")의 경우 UTC 기준시로 해석하여 한국 표준시(KST)에서 9시간 오차가 발생하는 버그를 방지합니다.
 * @param {string} dateStr 
 * @returns {Date}
 */
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * ==========================================================================
 * [신규] 단어 학습 및 학습 플래너 코어 비즈니스 로직
 * 단어장 로드, 캘린더 엔진, 학습 진척도 동기화 기능 제공
 * ==========================================================================
 */

/**
 * 플래너 시스템 초기 로드 함수
 * 단어 데이터베이스 및 플래너 상태 로딩을 동시 처리합니다.
 * @param {string} studentId
 */
async function initPlannerSystem(studentId) {
  if (calendarGrid) {
    calendarGrid.innerHTML = `
      <div class="calendar-loading-container" style="grid-column: span 7; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0; gap: 12px; color: var(--color-text-secondary);">
        <div class="spinner" style="border-width: 3px; border-color: rgba(255, 255, 255, 0.1); border-top-color: var(--color-primary); width: 28px; height: 28px;"></div>
        <span style="font-size: 13px; font-weight: 500;">일정을 불러오는 중입니다...</span>
      </div>
    `;
  }

  // 1. 단어 데이터베이스가 준비되지 않았다면 백그라운드 로드 수행
  await loadWordDatabase();

  // 2. 구글 API 또는 로컬 가짜 데이터에서 학생 플래너 세션 조회
  await loadPlannerState(studentId);
}

/**
 * 구글 스프레드시트 API를 호출하여 전체 단어 데이터를 가져옵니다. (학생 레벨에 매핑)
 */
async function loadWordDatabase() {
  if (isWordsLoaded) return;
  const activeUser = JSON.parse(localStorage.getItem("active_user"));
  const level = (activeUser && activeUser.level) ? activeUser.level : "단어장-초급";

  try {
    let words = [];
    // 구글 API 지원 시
    if (GOOGLE_SCRIPT_URL) {
      const requestUrl = `${GOOGLE_SCRIPT_URL}?action=getWords&level=${encodeURIComponent(level)}&_=${Date.now()}`;
      const response = await fetch(requestUrl);
      if (response.ok) {
        const result = await response.json();
        if (result && result.success && Array.isArray(result.words)) {
          words = result.words;
          updateConnectionStatus(true);
        } else {
          updateConnectionStatus(false);
        }
      } else {
        updateConnectionStatus(false);
      }
    }
    
    // 실패 시 로컬 CSV 폴백 (초급 또는 중급 파일 분기 시도)
    if (words.length === 0) {
      const isIntermediate = level.includes("중급");
      const csvPath = isIntermediate ? "단어장/단어장-중급.csv" : "단어장/단어장-초급.csv";
      
      try {
        const localCsvResponse = await fetch(csvPath);
        if (localCsvResponse.ok) {
          const csvText = await localCsvResponse.text();
          words = parseLocalCsv(csvText);
        }
      } catch (err) {
        // 단어장 단일 파일 폴백
        const fallbackResponse = await fetch("단어장/단어장.csv");
        if (fallbackResponse.ok) {
          const csvText = await fallbackResponse.text();
          words = parseLocalCsv(csvText);
        }
      }
    }
    
    wordDatabase = words;
    isWordsLoaded = true;
    console.log(`[Database] 단어 데이터 확보 완료: ${wordDatabase.length}개 (${level})`);
  } catch (error) {
    console.error("[Database] 단어 데이터 로드 오류:", error);
    updateConnectionStatus(false);
  }
}

/**
 * 학생의 90일 단위기간 단어 배정 및 요일 진도 데이터를 조회합니다.
 * @param {string} studentId
 */
async function loadPlannerState(studentId) {
  try {
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
      const activeUser = JSON.parse(localStorage.getItem("active_user"));
      const level = (activeUser && activeUser.level) ? activeUser.level : "단어장-초급";
      
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
  }
}

/**
 * 구글 API 연결 불가 시 브라우저에서 독립 작동할 수 있게 90일 평일 단위의 모의 데이터를 생성하는 헬퍼 함수
 * @param {string} studentId
 * @returns {object}
 */
async function generateMockPlannerState(studentId) {
  const localKey = `planner_session_${studentId}`;
  let localData = localStorage.getItem(localKey);
  const activeUser = JSON.parse(localStorage.getItem("active_user"));
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

  // 데이터베이스 로드 대기
  if (!isWordsLoaded) {
    await loadWordDatabase();
  }
  
  // 90개 평일 날짜 리스트 빌딩
  const todayStr = new Date().toISOString().split('T')[0];
  const startDate = new Date(todayStr);
  while (startDate.getDay() === 0 || startDate.getDay() === 6) {
    startDate.setDate(startDate.getDate() + 1);
  }
  
  const workdayList = [];
  const tempDate = new Date(startDate);
  
  while (workdayList.length < 90) {
    const dayOfWeek = tempDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workdayList.push(tempDate.toISOString().split('T')[0]);
    }
    tempDate.setDate(tempDate.getDate() + 1);
  }

  // 실제 단어장에서 일차 목록 빌드
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
  
  for (let d = 0; d < maxDays; d++) {
    const dayLabel = daysOrdered[d];
    // 3회차의 배정 날짜를 학습단위기간종료일로 사용
    const dayEndDateStr = workdayList[dayCounter + 2];
    
    for (let session = 1; session <= 3; session++) {
      const dateStr = workdayList[dayCounter++];
      
      words.push({
        recordTime: new Date().toLocaleString(),
        studentId: studentId,
        dayLabel: dayLabel,
        session: session,
        startDate: dateStr,
        endDate: dayEndDateStr, // 학습단위기간종료일 (Day 3회차 날짜)
        attendanceDate: "",
        status: "시작 전"
      });
    }
  }

  const newState = {
    success: true,
    words: words
  };

  localStorage.setItem(localKey, JSON.stringify(newState));
  return newState;
}

/**
 * 로컬 시간대를 기반으로 Date 객체를 YYYY-MM-DD 형식의 문자열로 변환합니다.
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
 * 플래너 달력 UI 렌더링 및 지각 경고 문구를 갱신합니다.
 */
function updatePlannerUI() {
  if (!plannerState) return;

  // 1. 달력 타이틀 세팅
  calendarTitle.textContent = `${calendarYear}년 ${calendarMonth + 1}월`;

  // 2. 달력 그리드 생성
  renderCalendarGrid();
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
      today.setHours(0,0,0,0);
      const todayTime = today.getTime();

      const dayStartDate = parseLocalDate(dayStartStr);
      dayStartDate.setHours(0,0,0,0);
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
 * 특정 일차(예: "Day 1")의 특정 회차(1, 2, 3)에 배정된 10단어 학습을 가동합니다.
 * @param {string} dayLabel
 * @param {number} session
 */
function startStudySessionForDay(dayLabel, session) {
  currentSelectedDay = dayLabel;
  currentSelectedSession = session;
  
  // 전체 단어 중 해당 일차(Day Label)에 속하는 단어 추출
  const dayWords = wordDatabase.filter(w => w.dayLabel === dayLabel);
  
  if (dayWords.length === 0) {
    alert("해당 일차의 배정 단어가 없습니다.");
    return;
  }

  // 회차별 10단어 슬라이싱 (1회차: 0-9, 2회차: 10-19, 3회차: 20-29)
  const startIndex = (session - 1) * 10;
  const endIndex = startIndex + 10;
  currentStudyWords = dayWords.slice(startIndex, endIndex);

  if (currentStudyWords.length === 0) {
    alert("해당 회차에 배정된 단어가 없습니다.");
    return;
  }

  currentWordIndex = 0;

  // 화면 전환 (캘린더 메뉴 숨기고 학습 창 열기)
  welcomeSection.classList.add("hidden");
  welcomeSection.classList.remove("active");
  studySection.classList.add("active");
  studySection.classList.remove("hidden");

  // 첫 단어 렌더링
  renderCurrentWord();
}

/**
 * 단어 표기에서 부수적인 고유번호 및 불필요한 문장 부호 정제
 * 예: "-가13" -> "가", "가난01" -> "가난"
 * @param {string} rawWord 
 * @returns {string}
 */
function cleanWord(rawWord) {
  if (!rawWord) return "";
  return rawWord.replace(/^-/, '').replace(/[0-9]+$/, '').trim();
}

/**
 * 학습을 완료한 회차 세션의 진척도를 서버와 로컬에 저장합니다.
 * @param {string} dayLabel
 * @param {number} session
 */
async function recordSessionProgress(dayLabel, session) {
  const activeUser = JSON.parse(localStorage.getItem("active_user"));
  if (!activeUser) return;

  try {
    let success = false;

    if (GOOGLE_SCRIPT_URL) {
      // 1. 구글 스프레드시트 세션 진도 전송 API 요청
      const requestUrl = `${GOOGLE_SCRIPT_URL}?action=submitSessionProgress&id=${encodeURIComponent(activeUser.id)}&dayLabel=${encodeURIComponent(dayLabel)}&session=${session}&_=${Date.now()}`;
      const response = await fetch(requestUrl);
      if (response.ok) {
        const result = await response.json();
        if (result && result.success) {
          success = true;
          updateConnectionStatus(true);
        }
      }
    }

    // 2. 로컬 모드 또는 구글 API 에러 대비 로컬 스토리지 동기화 (오프라인 가동 보장)
    const localKey = `planner_session_${activeUser.id}`;
    let localData = localStorage.getItem(localKey);
    
    if (localData) {
      const parsed = JSON.parse(localData);
      const targetRecord = parsed.words.find(w => w.dayLabel === dayLabel && w.session === session);
      
      if (targetRecord) {
        // 이 Day의 전체 3회차 종료일(마감일) 찾기
        const dayEndRecord = parsed.words.find(w => w.dayLabel === dayLabel && w.session === 3);
        const dayEndStr = dayEndRecord ? dayEndRecord.endDate : targetRecord.endDate;
        
        const today = new Date();
        today.setHours(0,0,0,0);
        const dayEndDate = parseLocalDate(dayEndStr);
        dayEndDate.setHours(0,0,0,0);
        
        const isLate = today.getTime() > dayEndDate.getTime();
        
        if (isLate) {
          // 기한이 만료된 지각 복습 완료 시: 최초출석을 찍지 않고 '지각' 보존
          targetRecord.status = "지각";
        } else {
          // 정상 완료 시: 최초출석을 기록하고 '학습 완료' 상태로 전환
          targetRecord.attendanceDate = new Date().toLocaleString();
          targetRecord.status = "학습 완료";
        }

        localStorage.setItem(localKey, JSON.stringify(parsed));
        
        // 메모리 상의 plannerState 도 실시간 갱신
        plannerState = parsed;
        
        if (!GOOGLE_SCRIPT_URL) {
          success = true;
        }
      }
    }

    if (!success) {
      console.warn("진도 동기화 실패. 로컬에 백업되었습니다.");
    }
  } catch (error) {
    console.error("진도 전송 실패:", error);
  }
}

/**
 * 현재 단어 상태 렌더링
 */
function renderCurrentWord() {
  const activeUser = JSON.parse(localStorage.getItem("active_user"));
  if (!activeUser || currentStudyWords.length === 0) return;

  const currentWord = currentStudyWords[currentWordIndex];

  // 1. 단어 한국어 텍스트 정제 후 렌더링
  studyWordKo.textContent = cleanWord(currentWord.word);

  // 2. 단어 품사 및 힌트(길잡이말) 렌더링
  const posText = currentWord.pos || "품사 미정";
  const guideText = currentWord.guide ? ` · ${currentWord.guide}` : "";
  studyWordHint.textContent = `${posText}${guideText}`;

  // 3. 사용자 모국어 설정에 맞춰 번역 컬럼 매핑 및 노출
  const userLang = activeUser.lang || "ko";
  let translationText = "";

  if (userLang === "zh") {
    translationText = currentWord.zh || currentWord.en; // 중국어 선택 시
  } else if (userLang === "vi") {
    translationText = currentWord.vi || currentWord.en; // 베트남어 선택 시
  } else {
    // 한국어(ko) 또는 다른 언어 선택 시에는 영어 번역 노출
    translationText = currentWord.en || "Translation not available";
  }
  studyWordTranslation.textContent = translationText;

  // 4. 상단 학습 진척도 UI 업데이트
  const currentNum = currentWordIndex + 1;
  currentProgressNum.textContent = currentNum;
  totalProgressNum.textContent = 10;
  
  // 프로그레스 바 비율 계산 및 애니메이션 효과 적용
  const progressPercent = (currentNum / 10) * 100;
  studyProgressBar.style.width = `${progressPercent}%`;

  // 5. 이전/다음 네비게이션 버튼 제어 (첫 단어에서도 이전 버튼을 노출하여 달력 복귀 지원)
  btnPrevWord.disabled = false;
  btnPrevWord.style.opacity = "1";

  // 마지막 단어일 경우 다음 버튼을 완료 버튼으로 텍스트 교체
  if (currentWordIndex === 9) {
    btnNextWord.textContent = "학습 완료";
  } else {
    btnNextWord.textContent = "다음";
  }
}

/**
 * 로컬 CSV 텍스트를 파싱하여 객체 배열로 정제하는 헬퍼 함수
 * 쉼표(,) 및 큰따옴표("")의 감싸기 텍스트(예: "nhà, chuyên gia")를 정확히 처리
 * @param {string} text 
 * @returns {Array<object>}
 */
function parseLocalCsv(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  
  // 헤더가 있는 1행을 제외하고 2행부터 파싱
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const row = [];
    let inQuotes = false;
    let currentVal = '';
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    row.push(currentVal.trim());
    
    if (row.length >= 7) {
      result.push({
        level: row[0],
        word: row[1],
        guide: row[2],
        pos: row[3],
        vi: row[4],
        zh: row[5],
        en: row[6],
        note: row[7] || ''
      });
    }
  }
  return result;
}

/**
 * 단어 목록 중 지정된 개수를 무작위(중복 없음)로 선정하여 반환하는 셔플 함수
 * Fisher-Yates 셔늘 알고리즘의 최적화 구현
 * @param {Array<object>} list 
 * @param {number} count 
 * @returns {Array<object>}
 */
function getRandomWords(list, count = 10) {
  const shuffled = [...list];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// ==========================================================================
// 학습 플래너 및 단어 학습 화면 인터랙션 이벤트 바인딩
// ==========================================================================

// 달력 월 단위 네비게이션 버튼 등록
if (btnPrevMonth) {
  btnPrevMonth.addEventListener("click", () => {
    if (calendarMonth === 0) {
      calendarMonth = 11;
      calendarYear--;
    } else {
      calendarMonth--;
    }
    updatePlannerUI();
  });
}

if (btnNextMonth) {
  btnNextMonth.addEventListener("click", () => {
    if (calendarMonth === 11) {
      calendarMonth = 0;
      calendarYear++;
    } else {
      calendarMonth++;
    }
    updatePlannerUI();
  });
}

// 이전 단어 네비게이션 버튼 이벤트 등록
if (btnPrevWord) {
  btnPrevWord.addEventListener("click", () => {
    if (currentWordIndex > 0) {
      currentWordIndex--;
      renderCurrentWord();
    } else {
      // 1번 단어(index === 0)에서 이전을 누르면 달력 창으로 복귀
      studySection.classList.add("hidden");
      studySection.classList.remove("active");
      welcomeSection.classList.add("active");
      welcomeSection.classList.remove("hidden");
      
      // 달력 데이터 최신 상태로 새로고침 렌더링
      const activeUser = JSON.parse(localStorage.getItem("active_user"));
      if (activeUser) {
        loadPlannerState(activeUser.id);
      }
    }
  });
}

// 다음 단어 및 완료 네비게이션 버튼 이벤트 등록
if (btnNextWord) {
  btnNextWord.addEventListener("click", async () => {
    if (currentWordIndex < 9) {
      currentWordIndex++;
      renderCurrentWord();
    } else {
      // 10번째 단어에서 '학습 완료' 클릭 시 로딩 오버레이 표출 및 진도 동기화 후 완료 화면 전환
      const globalLoader = document.getElementById("global-loading-overlay");
      if (globalLoader) {
        globalLoader.classList.remove("hidden");
        globalLoader.classList.add("active");
      }

      btnNextWord.disabled = true; // 중복 호출 방지
      try {
        await recordSessionProgress(currentSelectedDay, currentSelectedSession);
      } catch (err) {
        console.error("완료 API 호출 중 오류:", err);
      } finally {
        btnNextWord.disabled = false;
        if (globalLoader) {
          globalLoader.classList.remove("active");
          globalLoader.classList.add("hidden");
        }
      }
      showCompletionScreen();
    }
  });
}

// 완료 화면에서 메인 메뉴로 복귀 버튼 이벤트 등록
if (btnGoMenu) {
  btnGoMenu.addEventListener("click", () => {
    completionSection.classList.add("hidden");
    completionSection.classList.remove("active");
    welcomeSection.classList.add("active");
    welcomeSection.classList.remove("hidden");
    
    // 달력 데이터 최신 상태로 새로고침 렌더링
    const activeUser = JSON.parse(localStorage.getItem("active_user"));
    if (activeUser) {
      loadPlannerState(activeUser.id);
    }
  });
}

/**
 * 학습을 완료하고 축하 카드를 엽니다.
 */
function showCompletionScreen() {
  studySection.classList.add("hidden");
  studySection.classList.remove("active");
  completionSection.classList.add("active");
  completionSection.classList.remove("hidden");
}

/**
 * [Comment Policy: 구글 연동 뱃지 상태 업데이트]
 * 구글 스프레드시트 API 통신 결과에 따라 우상단 표시기 아이콘 및 툴팁 내용을 동적으로 업데이트합니다.
 * @param {boolean} isConnected 
 */
function updateConnectionStatus(isConnected) {
  const statusBadge = document.getElementById("connection-status");
  const statusIcon = document.getElementById("status-icon");
  const statusTooltip = document.getElementById("status-tooltip");
  
  if (!statusBadge || !statusIcon || !statusTooltip) return;
  
  if (isConnected) {
    statusBadge.className = "connection-status-badge connected";
    statusIcon.textContent = "V";
    statusBadge.title = "구글 스프레드시트 연동 완료 [V]";
    statusTooltip.innerHTML = "구글 스프레드시트 서버와 안정적으로 연결되었습니다. 실시간으로 데이터를 동기화 중입니다.";
  } else {
    statusBadge.className = "connection-status-badge disconnected";
    statusIcon.textContent = "!";
    statusBadge.title = "스프레드시트 연동 실패 [!]";
    statusTooltip.innerHTML = "구글 스프레드시트 서버와 연결이 끊어졌거나 주소가 비어 있어 <strong>로컬 Mock 모드</strong>로 작동 중입니다.";
  }
}

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
      
      // 언어 코드 파악 (MOCK_USER_DB의 명칭 또는 스토리지 내 단어 기준)
      let lang = "ko";
      if (MOCK_USER_DB[id].name.includes("중국어")) lang = "zh";
      if (MOCK_USER_DB[id].name.includes("베트남어")) lang = "vi";
      if (MOCK_USER_DB[id].name.includes("우즈벡어")) lang = "vi"; // 베트남/우즈벡 등 매핑
      
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
 * 학생 데이터 조회, 필터 조작 리스너 바인딩, 그리고 표 출력을 총괄 제어합니다.
 */
/**
 * [Comment Policy: 선생님 대시보드 코어 초기화]
 * 학생 데이터 조회, 필터 조작 리스너 바인딩, 그리고 동적 표 출력을 총괄 제어합니다.
 */
async function initTeacherDashboard() {
  try {
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
  }
}

/**
 * [Comment Policy: 필터 컨트롤 바인딩]
 * 검색 필드 입력 및 드롭다운, 체크박스의 변경 사항에 따라 테이블을 실시간 갱신합니다.
 */
function bindAdminFilters() {
  const searchInput = document.getElementById("search-student");
  const langSelect = document.getElementById("filter-language");
  const lateCheck = document.getElementById("toggle-late");
  
  if (!searchInput || !langSelect || !lateCheck) return;
  
  searchInput.oninput = applyFilters;
  langSelect.onchange = applyFilters;
  lateCheck.onchange = applyFilters;
}

/**
 * [Comment Policy: 필터링 조건 연산]
 * 입력어(이름/학번), 모국어, 지각 유무 3가지 AND 조건을 체크하여 데이터를 여과합니다.
 */
function applyFilters() {
  const searchVal = document.getElementById("search-student").value.trim().toLowerCase();
  const langVal = document.getElementById("filter-language").value;
  const lateVal = document.getElementById("toggle-late").checked;
  
  const filtered = allStudentsData.filter(student => {
    // 1. 검색어 조건 (학번 또는 이름에 포함되는지)
    const matchesSearch = student.id.toLowerCase().includes(searchVal) || 
                          student.name.toLowerCase().includes(searchVal);
    
    // 2. 모국어 조건
    const matchesLang = (langVal === "all") || (student.lang === langVal);
    
    // 3. 지각 조건
    const matchesLate = !lateVal || (student.isLate === true);
    
    return matchesSearch && matchesLang && matchesLate;
  });
  
  renderStudentTable(filtered);
}

/**
 * [Comment Policy: 대시보드 테이블 렌더러 (동적 헤더 지원)]
 * 구글 스프레드시트의 전체 열 정보를 받아와서 동적 헤더 및 유연한 뷰 구조로 렌더링합니다.
 * ID, Name, Role, LastLogin, 학습시작일, 레벨 및 동적으로 추가된 열들도 모두 표현합니다.
 */
function renderStudentTable(studentsList) {
  const thead = document.getElementById("student-list-header");
  const tbody = document.getElementById("student-list-body");
  if (!thead || !tbody) return;
  
  thead.innerHTML = "";
  tbody.innerHTML = "";
  
  // 1. 동적 헤더 구성
  // 기본 표시 고정 열 목록: ID, 이름, 최근 학습일, 진도, 지각 여부
  // 그 뒤에 학생 시트의 추가 컬럼을 유연하게 렌더링하고, 마지막에 학습시작일, 레벨, 관리 버튼 배치
  const baseHeaders = ["ID", "이름", "최근 학습일", "진도 (완료/전체)", "지각 여부"];
  const excludeFromDynamic = ["ID", "Name", "Role", "LastLogin", "학습시작일", "레벨"];
  const dynamicHeaders = adminHeaders.filter(h => h && !excludeFromDynamic.includes(h));
  
  const finalHeaders = [...baseHeaders, ...dynamicHeaders, "학습시작일", "레벨", "관리"];
  const colSpanCount = finalHeaders.length;
  
  const headerTr = document.createElement("tr");
  headerTr.style.borderBottom = "2px solid rgba(255, 255, 255, 0.6)";
  headerTr.style.background = "rgba(255, 255, 255, 0.3)";
  
  finalHeaders.forEach(hName => {
    const th = document.createElement("th");
    th.style.padding = "14px 10px";
    th.style.fontWeight = "600";
    if (hName === "관리") {
      th.style.textAlign = "center";
    }
    th.textContent = hName;
    headerTr.appendChild(th);
  });
  thead.appendChild(headerTr);
  
  // 2. 학생 데이터 행 구성
  if (studentsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colSpanCount}" style="padding: 30px; text-align: center; color: var(--color-text-secondary); background: transparent;">일치하는 학생 데이터가 없습니다.</td></tr>`;
    return;
  }
  
  studentsList.forEach(student => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255, 255, 255, 0.05)";
    
    // 기본 셀 목록 구성
    const lateBadgeHtml = student.isLate 
      ? `<span style="color: var(--color-error); font-weight:700;">⚠️ 지각</span>`
      : `<span style="color: var(--color-success); font-weight:700;">정상 제출</span>`;
      
    // 고정 셀 생성
    let rowHtml = `
      <td style="padding: 14px 10px; color: var(--color-text-secondary);">${student.id}</td>
      <td style="padding: 14px 10px;"><span class="clickable-name" data-id="${student.id}">${student.name}</span></td>
      <td style="padding: 14px 10px; font-size: 0.9rem; color: var(--color-text-secondary);">${student.lastStudyDate}</td>
      <td style="padding: 14px 10px; font-weight: 600;">${student.progress}</td>
      <td style="padding: 14px 10px;">${lateBadgeHtml}</td>
    `;
    
    // 추가된 동적 열들의 데이터를 순서에 맞춰서 매핑
    dynamicHeaders.forEach(dHeader => {
      const idx = adminHeaders.indexOf(dHeader);
      const val = (idx !== -1 && student.rowValues && student.rowValues[idx]) ? student.rowValues[idx] : "";
      rowHtml += `<td style="padding: 14px 10px; font-size: 0.9rem; color: var(--color-text-secondary);">${val}</td>`;
    });
    
    // 마지막 제어 컬럼 및 관리 버튼 추가
    rowHtml += `
      <td style="padding: 14px 10px; color: var(--color-text-secondary);">${student.startDate}</td>
      <td style="padding: 14px 10px; font-weight: 600;">${student.level}</td>
      <td style="padding: 14px 10px; text-align: center;">
        <button class="btn-cal-nav btn-edit-student" data-id="${student.id}" style="width: auto; padding: 4px 10px; font-size: 0.8rem; background: var(--color-primary-hover); color:#fff; border-radius: 8px;">수정</button>
      </td>
    `;
    
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });
  
  // 이름 클릭 상세조회 이벤트 위임
  tbody.querySelectorAll(".clickable-name").forEach(el => {
    el.addEventListener("click", () => {
      const studentId = el.getAttribute("data-id");
      showStudentDetailModal(studentId);
    });
  });
  
  // 수정 버튼 클릭 이벤트 위임
  tbody.querySelectorAll(".btn-edit-student").forEach(el => {
    el.addEventListener("click", () => {
      const studentId = el.getAttribute("data-id");
      showAdminEditModal(studentId);
    });
  });
}

/**
 * [Comment Policy: 학생 정보 편집 모달 초기화 및 노출]
 * 특정 학생의 정보와 동적 추가 열 목록을 바인딩하여 폼을 활성화시킵니다.
 */
function showAdminEditModal(studentId) {
  const student = allStudentsData.find(s => s.id === studentId);
  if (!student) return;
  
  editStudentId.value = student.id;
  editStudentName.value = student.name;
  editStudentLevel.value = student.level || "단어장-초급";
  editStudentStartDate.value = student.startDate || "";
  
  // 동적 열 데이터 바인딩
  editDynamicFieldsContainer.innerHTML = "";
  const exclude = ["ID", "Name", "Role", "LastLogin", "학습시작일", "레벨"];
  
  adminHeaders.forEach((header, index) => {
    if (header && !exclude.includes(header)) {
      const val = (student.rowValues && student.rowValues[index] !== undefined) ? student.rowValues[index] : "";
      
      const badge = document.createElement("div");
      badge.className = "dynamic-badge";
      badge.innerHTML = `
        <span class="dynamic-badge-key">${header}</span>
        <span class="dynamic-badge-value" title="${val}">${val || "-"}</span>
      `;
      editDynamicFieldsContainer.appendChild(badge);
    }
  });
  
  if (editDynamicFieldsContainer.children.length === 0) {
    editDynamicFieldsContainer.innerHTML = `<div style="grid-column: span 2; text-align: center; color: var(--color-text-secondary); padding: 10px 0;">추가된 열 정보가 없습니다.</div>`;
  }
  
  adminEditModal.classList.remove("hidden");
  void adminEditModal.offsetWidth;
  adminEditModal.classList.add("active");
}

/**
 * [Comment Policy: 정보 편집 모달 닫기]
 */
function closeAdminEditModal() {
  adminEditModal.classList.remove("active");
  setTimeout(() => {
    if (!adminEditModal.classList.contains("active")) {
      adminEditModal.classList.add("hidden");
    }
  }, 350);
}

/**
 * [Comment Policy: 시작일 평일 미니 달력 피커 열기]
 */
function showAdminDatePicker() {
  const currentVal = editStudentStartDate.value;
  if (currentVal && currentVal !== "-") {
    const parsed = parseLocalDate(currentVal);
    pickerYear = parsed.getFullYear();
    pickerMonth = parsed.getMonth();
  } else {
    const today = new Date();
    pickerYear = today.getFullYear();
    pickerMonth = today.getMonth();
  }
  
  renderPickerCalendar();
  
  adminDatePickerModal.classList.remove("hidden");
  void adminDatePickerModal.offsetWidth;
  adminDatePickerModal.classList.add("active");
}

/**
 * [Comment Policy: 시작일 미니 달력 피커 닫기]
 */
function closeAdminDatePicker() {
  adminDatePickerModal.classList.remove("active");
  setTimeout(() => {
    if (!adminDatePickerModal.classList.contains("active")) {
      adminDatePickerModal.classList.add("hidden");
    }
  }, 300);
}

/**
 * [Comment Policy: 평일 한정 미니 달력 그리드 렌더러]
 * 주말(토, 일)을 흐릿하게 처리하고 클릭을 차단하여 오직 평일로만 학습시작일을 지정할 수 있게 강제합니다.
 */
function renderPickerCalendar() {
  pickerCalendarTitle.textContent = `${pickerYear}년 ${pickerMonth + 1}월`;
  pickerCalendarGrid.innerHTML = "";
  
  const firstDay = new Date(pickerYear, pickerMonth, 1);
  const startDayOfWeek = firstDay.getDay(); // 0: 일요일 ~ 6: 토요일
  const lastDay = new Date(pickerYear, pickerMonth + 1, 0);
  const numDays = lastDay.getDate();
  
  const todayStr = getLocalDateString(new Date());
  const selectedStr = editStudentStartDate.value;
  
  // 1. 이전 달의 빈 공간 채우기
  for (let i = 0; i < startDayOfWeek; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "picker-day other-month";
    pickerCalendarGrid.appendChild(emptyCell);
  }
  
  // 2. 현재 달의 날짜 렌더링
  for (let date = 1; date <= numDays; date++) {
    const dayCell = document.createElement("div");
    dayCell.className = "picker-day";
    dayCell.textContent = date;
    
    const cellDate = new Date(pickerYear, pickerMonth, date);
    const dayOfWeek = cellDate.getDay();
    const cellDateStr = getLocalDateString(cellDate);
    
    // 오늘 날짜 하이라이트
    if (cellDateStr === todayStr) {
      dayCell.style.border = "1px solid var(--color-primary)";
    }
    
    // 선택된 날짜 표기
    if (cellDateStr === selectedStr) {
      dayCell.classList.add("selected");
    }
    
    // 주말 판정 및 비활성화 처리
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      dayCell.classList.add("weekend-disabled");
    } else {
      // 평일 클릭 시 해당 일자로 학습시작일 바인딩
      dayCell.addEventListener("click", () => {
        editStudentStartDate.value = cellDateStr;
        closeAdminDatePicker();
      });
    }
    
    pickerCalendarGrid.appendChild(dayCell);
  }
}

/**
 * [Comment Policy: 선생님 대시보드 관리 이벤트 리스너 바인딩]
 * 수정 제출, 취소, 달력 내 네비게이션 동작을 1회 등록 연결합니다.
 */
function bindAdminEditEvents() {
  // 모달 닫기/취소 리스너 연결
  btnCloseEditModal.onclick = closeAdminEditModal;
  btnCancelEdit.onclick = closeAdminEditModal;
  btnCloseDatePicker.onclick = closeAdminDatePicker;
  
  // 시작일 피커 실행 연결
  btnOpenDatePicker.onclick = showAdminDatePicker;
  
  // 달력 피커 월 이동 리스너
  btnPickerPrev.onclick = () => {
    if (pickerMonth === 0) {
      pickerMonth = 11;
      pickerYear--;
    } else {
      pickerMonth--;
    }
    renderPickerCalendar();
  };
  
  btnPickerNext.onclick = () => {
    if (pickerMonth === 11) {
      pickerMonth = 0;
      pickerYear++;
    } else {
      pickerMonth++;
    }
    renderPickerCalendar();
  };
  
  // 정보 수정 폼 서브밋 처리 (대안 B: 출석 정보 복사 후 90일 재작성 마이그레이션)
  adminEditForm.onsubmit = async (e) => {
    e.preventDefault();
    
    const targetId = editStudentId.value;
    const newStartDate = editStudentStartDate.value;
    const newLevel = editStudentLevel.value;
    
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
    
    try {
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
        today.setHours(0,0,0,0);
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
              dEndDate.setHours(0,0,0,0);
              const dStartDate = parseLocalDate(workdayList[d * 3]);
              dStartDate.setHours(0,0,0,0);
              
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
        const activeUser = JSON.parse(localStorage.getItem("active_user"));
        if (activeUser && activeUser.id === targetId) {
          activeUser.level = newLevel;
          localStorage.setItem("active_user", JSON.stringify(activeUser));
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
      if (globalLoader) {
        globalLoader.classList.remove("active");
        globalLoader.classList.add("hidden");
      }
    }
  };
}

/**
 * [Comment Policy: 상세 정보 모달 제어]
 * 특정 학생의 미니 5일 달력 요일 진도 및 공부한 단어 이력을 시간 역순으로 렌더링하고 모달을 띄웁니다.
 * @param {string} studentId 
 */
function showStudentDetailModal(studentId) {
  const student = allStudentsData.find(s => s.id === studentId);
  if (!student) return;
  
  const modal = document.getElementById("student-modal");
  const modalTitle = document.getElementById("modal-student-title");
  const modalIdBadge = document.getElementById("modal-student-id");
  const modalLangBadge = document.getElementById("modal-student-lang");
  const progressContainer = document.getElementById("modal-progress-bar-container");
  const logScroll = document.getElementById("modal-word-log-scroll");
  
  if (!modal || !modalTitle || !modalIdBadge || !modalLangBadge || !progressContainer || !logScroll) return;
  
  // 1. 기본 텍스트 정보 바인딩
  modalTitle.textContent = `${student.name} 학생 학습 상세`;
  modalIdBadge.textContent = `학번: ${student.id}`;
  modalLangBadge.textContent = `모국어: ${getLanguageName(student.lang)}`;
  
  // 2. 미니 5일 달력(요일 진도 바) 렌더링
  progressContainer.innerHTML = "";
  
  // 로컬/시트 원본 데이터에서 words 파악
  let rawWords = student.rawWords || [];
  if (rawWords.length === 0 && GOOGLE_SCRIPT_URL) {
    // 만약 학생 데이터에 rawWords가 비어있다면, 로컬 스토리지에 동기화된 플래너 데이터에서 조회 시도
    const localKey = `planner_session_${student.id}`;
    const localData = localStorage.getItem(localKey);
    if (localData) {
      rawWords = JSON.parse(localData).words || [];
    }
  }
  
  for (let day = 1; day <= 5; day++) {
    const dayLabel = `Day ${day}`;
    // 해당 Day의 1, 2, 3회차 상태 파악
    const daySessions = rawWords.filter(w => w.dayLabel === dayLabel);
    const isCompleted = daySessions.length > 0 && daySessions.every(w => w.status === "학습 완료");
    const isLate = daySessions.some(w => w.status === "지각");
    
    const badge = document.createElement("div");
    badge.className = "modal-day-badge";
    
    let statusText = "대기";
    if (isCompleted) {
      badge.classList.add("completed");
      statusText = "완료";
    } else if (isLate) {
      badge.classList.add("late");
      statusText = "지각";
    }
    
    badge.innerHTML = `
      <span class="badge-label">${dayLabel}</span>
      <span class="badge-status">${statusText}</span>
    `;
    progressContainer.appendChild(badge);
  }
  
  // 3. 완료한 단어 상세 로그 렌더링 (최근 학습 일시가 존재하는 단어들만 시간 역순 정렬)
  logScroll.innerHTML = "";
  
  // 최근 학습 일자가 있는 세션들 필터링 및 정렬
  const completedSessions = rawWords
    .filter(w => w.attendanceDate)
    .sort((a, b) => {
      const dateA = new Date(a.attendanceDate.replace(/-/g, '/'));
      const dateB = new Date(b.attendanceDate.replace(/-/g, '/'));
      return dateB - dateA;
    });
    
  if (completedSessions.length === 0) {
    logScroll.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); padding: 20px 0; font-size: 0.9rem;">학습을 완료한 단어 기록이 없습니다.</div>`;
  } else {
    completedSessions.forEach(w => {
      const item = document.createElement("div");
      item.className = "word-log-item";
      
      const isLateBadge = w.status === "지각" ? `<span style="color: var(--color-error); font-size: 10px; margin-left: 6px;">[지각]</span>` : "";
      
      item.innerHTML = `
        <div>
          <span class="word-log-word">${w.dayLabel}</span>
          <span style="font-size: 11px; color: var(--color-text-secondary); margin-left: 6px;">${w.session}회차 완료</span>
          ${isLateBadge}
        </div>
        <span class="word-log-date">${w.attendanceDate}</span>
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
