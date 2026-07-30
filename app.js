/**
 * ==========================================================================
 * 한국어 단어 학습기 - 메인 코어 및 컨트롤러 (app.js)
 * 글로벌 상태, DOM 요소 바인딩, 학습 화면 UI 렌더링 및 이벤트를 총괄 통제합니다.
 * ==========================================================================
 */

// [중요 설정] 구글 스프레드시트 웹 앱(GAS) 배포 후 생성된 URL을 여기에 넣으세요.
// 이 변수가 비어있는 경우에는 로컬 Mock 데이터 기반으로 로그인 테스트가 진행됩니다.
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz0mmFTjqYQs8Irzpnqq1S6PFyvFHt4gUO_YCAL0iGItXL-d7br2yWp17Z9fPfSvxjI/exec";

// [Comment Policy: Mock 사용자 데이터베이스 수정]
// 로그인 다국어 지원 정책 수정(한국어 제외, 영어 추가)에 맞춰 우즈벡어 학생 데이터인 '2026-test3'을 '아지즈 (영어)'로 변경하여,
// 로그인 이후 단어 노출 시 영어 번역 데이터를 검증하기 수월하도록 설정합니다.
const MOCK_USER_DB = {
  "2026-test1": { name: "김민준 (중국어)", role: "student" },
  "2026-test2": { name: "흐엉 (베트남어)", role: "student" },
  "2026-test3": { name: "아지즈 (영어)", role: "student" },
  "teacher-admin": { name: "선생님 (관리자)", role: "teacher" }
};

// 핵심 학습 상태 전역 변수
let wordDatabase = [];         // 전체 단어장 목록 저장 캐시
let currentStudyWords = [];    // 현재 학습 중인 10개 단어 목록
let currentWordIndex = 0;      // 현재 보고 있는 단어의 인덱스 (0 ~ 9)
let isWordsLoaded = false;     // 단어 데이터 로딩 여부 플래그
let allStudentsData = [];      // 대시보드용 전체 학생 목록 캐시 (admin.js 공유)

// DOM 요소 캐싱
const loginSection = document.getElementById("login-section");
const welcomeSection = document.getElementById("welcome-section");
const loginForm = document.getElementById("login-form");
const studentIdInput = document.getElementById("student-id");
const errorMessage = document.getElementById("error-message");
const btnLogin = document.getElementById("btn-login");
const btnText = document.getElementById("btn-text");
const loginSpinner = document.getElementById("login-spinner");

// [Comment Policy: 웰컴 화면 2개의 이름 바인딩을 위한 DOM 캐싱 변경]
const userDisplayId1 = document.getElementById("user-display-id-1");
const userDisplayId2 = document.getElementById("user-display-id-2");
const userRoleBadge = document.getElementById("user-role-badge");
const btnLogout = document.getElementById("btn-logout");

// 모국어 선택 드롭다운
const languageSelect = document.getElementById("language-select");

// 학습 플래너 관련 DOM 캐싱
const lateWarningBadge = document.getElementById("late-warning-badge");
const calendarTitle = document.getElementById("calendar-title");
const calendarGrid = document.getElementById("calendar-grid");
const btnPrevMonth = document.getElementById("btn-prev-month");
const btnNextMonth = document.getElementById("btn-next-month");
const btnRetryStudy = document.getElementById("btn-retry-study"); // [신규] 학습 다시하기 버튼

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

// 학습 완료 관련 DOM 캐싱
const completionSection = document.getElementById("completion-section");
const btnGoMenu = document.getElementById("btn-go-menu"); // [Comment Policy: 메인메뉴 복귀 버튼 복구]

/**
 * 사용자 피드백용 임시 딜레이 프로미스
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 임시 에러 메시지 팝업 노출 헬퍼
 */
function showError(message) {
  if (errorMessage) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
  }
}

/**
 * [Comment Policy: 구글 연동 뱃지 상태 업데이트]
 * 구글 API 연결 상태에 맞추어 상태 뱃지 우상단 텍스트 및 마우스 호버 안내문구를 동적 교체합니다.
 */
function updateConnectionStatus(isConnected) {
  const statusBadge = document.getElementById("connection-status");
  const statusIcon = document.getElementById("status-icon");
  const statusTooltip = document.getElementById("status-tooltip");

  if (!statusBadge || !statusIcon || !statusTooltip) return;

  if (isConnected) {
    statusBadge.className = "connection-status-badge connected";
    statusIcon.textContent = "V";
    statusBadge.title = "구글 서버 연동 완료 [V]";
    statusTooltip.innerHTML = "구글 서버와 안정적으로 연결되었습니다. 실시간으로 데이터를 동기화 중입니다.";
  } else {
    statusBadge.className = "connection-status-badge disconnected";
    statusIcon.textContent = "!";
    statusBadge.title = "서버 연동 실패 [!]";
    statusTooltip.innerHTML = "구글 서버와 연결이 끊어졌거나 주소가 비어 있어 <strong>로컬 Mock 모드</strong>로 작동 중입니다.";
  }
}

/**
 * [Comment Policy: 구글 서버 통신 중 로딩 상태 표시]
 * connection-status 뱃지 내부의 스피너를 노출하여 서버와 활발히 동기화 중임을 가시적으로 나타냅니다.
 */
function showConnectionLoading() {
  const spinner = document.getElementById("status-spinner");
  const icon = document.getElementById("status-icon");
  if (spinner && icon) {
    icon.style.opacity = "0.1"; // 텍스트 반투명 은폐
    spinner.classList.remove("hidden");
  }
}

/**
 * [Comment Policy: 구글 서버 통신 완료 시 로딩 상태 해제]
 * 뱃지 내부의 스피너를 숨겨 통신 완료를 안내합니다.
 */
function hideConnectionLoading() {
  const spinner = document.getElementById("status-spinner");
  const icon = document.getElementById("status-icon");
  if (spinner && icon) {
    icon.style.opacity = "1"; // 원래대로 복구
    spinner.classList.add("hidden");
  }
}

/**
 * 구글 스프레드시트 API를 호출하여 전체 단어 데이터를 가져옵니다. (학생 레벨에 매핑)
 */
async function loadWordDatabase() {
  if (isWordsLoaded) return;
  const activeUser = JSON.parse(localStorage.getItem("active_user"));
  const level = (activeUser && activeUser.level) ? activeUser.level : "단어장-초급";
  let isGoogleFetch = !!GOOGLE_SCRIPT_URL;

  try {
    if (isGoogleFetch) showConnectionLoading();
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
  } finally {
    if (isGoogleFetch) hideConnectionLoading();
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
      // 30단어마다 1일차씩 동적 매핑 (Day 1 ~ Day 30)
      const dayIndex = Math.floor((result.length) / 30) + 1;
      result.push({
        dayLabel: `Day ${dayIndex}`,
        level: row[0],
        word: row[1],
        guide: row[2] || "",
        pos: row[3] || "",
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

  // [Comment Policy: 회차별 10단어 슬라이싱 복구]
  // 1회차: 0-9, 2회차: 10-19, 3회차: 20-29 단어만을 정상적으로 추출합니다.
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
 * 현재 단어 상태 렌더링
 */
function renderCurrentWord() {
  const activeUser = JSON.parse(localStorage.getItem("active_user"));
  if (!activeUser || currentStudyWords.length === 0) return;

  // [Comment Policy: 번역 플립 카드 리셋 (Transition Snap 기법)]
  // 단어가 바뀔 때 부드럽게 뒤집히는 애니메이션 시간 동안 다음 단어 뜻이 노출되는 스포일러 현상을 예방
  const flipCard = document.getElementById("translation-flip-card");
  if (flipCard) {
    const inner = flipCard.querySelector(".flip-card-inner");
    if (inner) {
      inner.style.transition = "none";
      flipCard.classList.remove("flipped");
      void inner.offsetHeight; // 강제 리플로우 트리거로 0초 닫힘 적용
      inner.style.transition = "";
    }
  }

  const currentWord = currentStudyWords[currentWordIndex];

  // 1. 단어 한국어 텍스트 정제 후 렌더링
  if (studyWordKo) {
    studyWordKo.textContent = cleanWord(currentWord.word);
  }

  // 2. 단어 품사 및 힌트(길잡이말) 렌더링
  if (studyWordHint) {
    const posText = currentWord.pos || "품사 미정";
    const guideText = currentWord.guide ? ` · ${currentWord.guide}` : "";
    studyWordHint.textContent = `${posText}${guideText}`;
  }

  // 3. 모국어별 번역 매핑
  if (studyWordTranslation) {
    const userLang = activeUser.lang || "vi";
    let translationText = "";

    if (userLang === "zh") {
      translationText = currentWord.zh || currentWord.en;
    } else if (userLang === "vi") {
      translationText = currentWord.vi || currentWord.en;
    } else if (userLang === "en") {
      translationText = currentWord.en || "Translation not available";
    } else {
      translationText = currentWord.en || "Translation not available";
    }
    studyWordTranslation.textContent = translationText;
  }

  // 4. 상단 학습 진척도 UI 업데이트
  const currentNum = currentWordIndex + 1;
  if (currentProgressNum) currentProgressNum.textContent = currentNum;
  if (totalProgressNum) totalProgressNum.textContent = 10;

  // 프로그레스 바 비율 계산 및 애니메이션 효과 적용
  const progressPercent = (currentNum / 10) * 100;
  if (studyProgressBar) studyProgressBar.style.width = `${progressPercent}%`;

  // 5. 이전/다음 네비게이션 버튼 텍스트 변경
  if (currentWordIndex === 0) {
    btnPrevWord.textContent = "돌아가기";
  } else {
    btnPrevWord.textContent = "이전";
  }

  if (currentWordIndex === currentStudyWords.length - 1) {
    btnNextWord.textContent = "완료";
  } else {
    btnNextWord.textContent = "다음";
  }
}

/**
 * 학습을 완료한 회차 세션의 진척도를 서버와 로컬에 저장합니다.
 * @param {string} dayLabel
 * @param {number} session
 */
async function recordSessionProgress(dayLabel, session) {
  const activeUser = JSON.parse(localStorage.getItem("active_user"));
  if (!activeUser) return;

  let isGoogleFetch = !!GOOGLE_SCRIPT_URL;

  try {
    if (isGoogleFetch) showConnectionLoading();
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
        today.setHours(0, 0, 0, 0);
        const dayEndDate = parseLocalDate(dayEndStr);
        dayEndDate.setHours(0, 0, 0, 0);

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
  } finally {
    if (isGoogleFetch) hideConnectionLoading();
  }
}

/**
 * 로그인 직후 학습 플래너 시스템 및 단어 데이터 백그라운드 다운로드 구동
 * @param {string} studentId 
 */
async function initPlannerSystem(studentId) {
  const globalLoader = document.getElementById("global-loading-overlay");
  if (globalLoader) {
    globalLoader.classList.remove("hidden");
    globalLoader.classList.add("active");
  }

  // 1. 단어 데이터베이스가 준비되지 않았다면 백그라운드 로드 수행
  await loadWordDatabase();

  // 2. 구글 API 또는 로컬 가짜 데이터에서 학생 플래너 세션 조회
  await loadPlannerState(studentId);

  if (globalLoader) {
    globalLoader.classList.remove("active");
    globalLoader.classList.add("hidden");
  }
}

// ==========================================================================
// DOMContentLoaded 이벤트 리스너 (모든 컨트롤 연결 및 초기화 실행)
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. 로그인 폼 전송 처리
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      showError(""); // 기존 에러 메시지 클리어

      const studentId = studentIdInput.value.trim();
      const selectedLang = languageSelect.value;

      if (!studentId) {
        showError("학번을 입력하십시오.");
        return;
      }

      setLoadingState(true); // 검증 로딩 가동

      try {
        let authResult = null;

        // 구글 연동 중일 때
        if (GOOGLE_SCRIPT_URL) {
          authResult = await verifyUserWithGoogleSheet(studentId);
        } else {
          // 로컬 Mock 모드 기동
          await delay(800); // 0.8초 딜레이
          if (MOCK_USER_DB[studentId]) {
            const mock = MOCK_USER_DB[studentId];
            authResult = {
              name: mock.name,
              role: mock.role,
              level: (studentId === "2026-test2") ? "단어장-중급" : "단어장-초급", // 베트남 학생 중급 고정
              isFirstLogin: !localStorage.getItem(`planner_session_${studentId}`)
            };
            updateConnectionStatus(false);
          }
        }

        if (authResult) {
          // 모국어 강제 선택 주입
          authResult.lang = selectedLang;
          authResult.id = studentId;

          // 로그인 세션 보존
          localStorage.setItem("active_user", JSON.stringify(authResult));
          sessionStorage.setItem("last_logged_in_id", studentId); // 자동완성용 백업

          // 대시보드 또는 웰컴 화면 출력
          await showWelcomeScreen(authResult);
        } else {
          showError("학번을 다시 확인하고 바르게 입력하십시오. 그렇게 했는데도 로그인이 안 되면 교수님에게 학번을 보여주십시오.");
        }
      } catch (err) {
        console.error("로그인 프로세스 실패:", err);
        showError("서버와의 연결이 지연되고 있습니다. 잠시 후 다시 시작해 주세요.");
      } finally {
        setLoadingState(false);
      }
    };
  }

  // 2. 로그아웃 버튼 바인딩
  if (btnLogout) {
    btnLogout.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis(); // 가동 중인 음성 차단

      // 직전 아이디 저장 후 클리어
      const lastId = JSON.parse(localStorage.getItem("active_user"))?.id;
      if (lastId) {
        sessionStorage.setItem("last_logged_in_id", lastId);
      }

      localStorage.removeItem("active_user");

      welcomeSection.classList.add("hidden");
      welcomeSection.classList.remove("active");
      loginSection.classList.add("active");
      loginSection.classList.remove("hidden");

      if (studentIdInput) {
        studentIdInput.value = sessionStorage.getItem("last_logged_in_id") || "";
      }
    };
  }

  // 3. 선생님용 로그아웃 버튼 바인딩
  const btnTeacherLogout = document.getElementById("btn-teacher-logout");
  if (btnTeacherLogout) {
    btnTeacherLogout.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      const lastId = JSON.parse(localStorage.getItem("active_user"))?.id;
      if (lastId) {
        sessionStorage.setItem("last_logged_in_id", lastId);
      }

      localStorage.removeItem("active_user");

      const teacherSection = document.getElementById("teacher-section");
      if (teacherSection) {
        teacherSection.classList.add("hidden");
        teacherSection.classList.remove("active");
      }
      loginSection.classList.add("active");
      loginSection.classList.remove("hidden");

      if (studentIdInput) {
        studentIdInput.value = sessionStorage.getItem("last_logged_in_id") || "";
      }
    };
  }

  // 4. 달력 월 이전/다음 이동 버튼
  if (btnPrevMonth) {
    btnPrevMonth.onclick = (e) => {
      e.preventDefault();
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      updatePlannerUI();
    };
  }

  if (btnNextMonth) {
    btnNextMonth.onclick = (e) => {
      e.preventDefault();
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      updatePlannerUI();
    };
  }

  // 5. 단어 3D 뒤집기 플립 리스너 바인딩
  const flipCard = document.getElementById("translation-flip-card");
  if (flipCard) {
    flipCard.addEventListener("click", () => {
      flipCard.classList.toggle("flipped");
    });
  }

  // 6. 스피커 다시듣기 버튼 리스너 바인딩
  const btnSpeak = document.getElementById("btn-speak");
  if (btnSpeak) {
    btnSpeak.addEventListener("click", () => {
      if (currentStudyWords.length > 0 && currentWordIndex < currentStudyWords.length) {
        const currentWord = currentStudyWords[currentWordIndex];
        speakWordOnce(cleanWord(currentWord.word));
      }
    });
  }

  // 7. 단어 학습 이전(돌아가기)/다음(완료) 버튼 제어
  if (btnPrevWord) {
    btnPrevWord.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis(); // 기존 음성 소거

      if (currentWordIndex === 0) {
        // 학습 중지 후 메인 메뉴 복귀
        studySection.classList.add("hidden");
        studySection.classList.remove("active");
        welcomeSection.classList.remove("hidden");
        welcomeSection.classList.add("active");
        
        // 플래너 달력 상태 리로드
        const activeUser = JSON.parse(localStorage.getItem("active_user"));
        if (activeUser) {
          loadPlannerState(activeUser.id);
        }
      } else {
        currentWordIndex--;
        renderCurrentWord();
      }
    };
  }

  if (btnNextWord) {
    btnNextWord.onclick = async (e) => {
      e.preventDefault();
      resetSpeechSynthesis(); // 기존 음성 소거

      if (currentWordIndex === currentStudyWords.length - 1) {
        // 10단어 완료 분기 
        const globalLoader = document.getElementById("global-loading-overlay");
        if (globalLoader) {
          globalLoader.classList.remove("hidden");
          globalLoader.classList.add("active");
        }

        // 구글 및 로컬 스토리지에 출석/완료 마크
        await recordSessionProgress(currentSelectedDay, currentSelectedSession);

        if (globalLoader) {
          globalLoader.classList.remove("active");
          globalLoader.classList.add("hidden");
        }

        // 학습 완료 격려 페이지 전환
        studySection.classList.add("hidden");
        studySection.classList.remove("active");
        completionSection.classList.remove("hidden");
        completionSection.classList.add("active");
      } else {
        currentWordIndex++;
        renderCurrentWord();
      }
    };
  }

  // 8. 완료 화면 '메인 메뉴로' 복귀 버튼 바인딩
  if (btnGoMenu) {
    btnGoMenu.onclick = async (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      completionSection.classList.add("hidden");
      completionSection.classList.remove("active");
      welcomeSection.classList.remove("hidden");
      welcomeSection.classList.add("active");

      // 메인 달력 리로드로 지각/출석 뱃지 최신화
      const activeUser = JSON.parse(localStorage.getItem("active_user"));
      if (activeUser) {
        await loadPlannerState(activeUser.id);
      }
    };
  }

  // 9. 완료 화면 '학습 다시하기' 버튼 바인딩
  if (btnRetryStudy) {
    btnRetryStudy.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      // 학습 인덱스 리셋 및 동일 회차 재진입
      currentWordIndex = 0;

      completionSection.classList.add("hidden");
      completionSection.classList.remove("active");
      studySection.classList.remove("hidden");
      studySection.classList.add("active");

      renderCurrentWord();
    };
  }

  // [Comment Policy: 자동 로그인 세션 복구 및 학번 복원 자동완성]
  const activeUser = JSON.parse(localStorage.getItem("active_user"));
  const lastLoggedInId = sessionStorage.getItem("last_logged_in_id");

  if (activeUser) {
    showWelcomeScreen(activeUser);
  } else if (lastLoggedInId && studentIdInput) {
    studentIdInput.value = lastLoggedInId;
  }
});
