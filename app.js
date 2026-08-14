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

// 1번 미니게임 (3x3 단어 매칭) 관련 DOM 캐싱
const minigame1Section = document.getElementById("minigame1-section");
const minigame1KoreanGrid = document.getElementById("minigame1-korean-grid");
const minigame1NativeGrid = document.getElementById("minigame1-native-grid");
const btnMinigame1Back = document.getElementById("btn-minigame1-back");
const btnMinigame1Next = document.getElementById("btn-minigame1-next");

// 2번 미니게임 (사지선다 객관식 퀴즈 10문제) 관련 DOM 캐싱
const minigame2Section = document.getElementById("minigame2-section");
const minigame2QuestionTitle = document.getElementById("minigame2-question-title");
const minigame2OptionsContainer = document.getElementById("minigame2-options-container");
const minigame2Feedback = document.getElementById("minigame2-feedback");
const btnMinigame2Back = document.getElementById("btn-minigame2-back");
const btnMinigame2Next = document.getElementById("btn-minigame2-next");

// 3번 미니게임 (한 글자 빈칸 타이핑 퀴즈 10문제) 관련 DOM 캐싱
const minigame3Section = document.getElementById("minigame3-section");
const minigame3WordContainer = document.getElementById("minigame3-word-container");
const minigame3NativeHint = document.getElementById("minigame3-native-hint");
const btnMinigame3Check = document.getElementById("btn-minigame3-check");
const minigame3Feedback = document.getElementById("minigame3-feedback");
const btnMinigame3Back = document.getElementById("btn-minigame3-back");
const btnMinigame3Next = document.getElementById("btn-minigame3-next");

// 4번 미니게임 (음성 청취 사지선다 객관식 퀴즈 10문제) 관련 DOM 캐싱
const minigame4Section = document.getElementById("minigame4-section");
const minigame4QuestionNum = document.getElementById("minigame4-question-num");
const minigame4SpeakBtn = document.getElementById("minigame4-speak-btn");
const minigame4OptionsContainer = document.getElementById("minigame4-options-container");
const minigame4Feedback = document.getElementById("minigame4-feedback");
const btnMinigame4Back = document.getElementById("btn-minigame4-back");
const btnMinigame4Next = document.getElementById("btn-minigame4-next");

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
  // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
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
  // [Comment Policy: 준비물 체크박스 필수 체크 검증]
  // 단어공책(chk-notebook)과 볼펜(chk-pen) 체크박스가 둘 다 체크되어 있는지 확인하고,
  // 하나라도 체크되어 있지 않다면 경고 토스트 팝업을 중앙에 표시하며 진행을 전면 차단합니다.
  const chkNotebook = document.getElementById("chk-notebook");
  const chkPen = document.getElementById("chk-pen");
  const isNotebookChecked = chkNotebook ? chkNotebook.checked : false;
  const isPenChecked = chkPen ? chkPen.checked : false;

  if (!isNotebookChecked || !isPenChecked) {
    if (typeof showToast === "function") {
      showToast("단어공책과 볼펜을 준비하고 체크 표시를 하십시오.");
    } else {
      alert("단어공책과 볼펜을 준비하고 체크 표시를 하십시오.");
    }
    return;
  }

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

  // [Comment Policy: 10단어 음성 일괄 프리로드 기동]
  // 단어 학습을 시작하는 시점에 10단어의 구글 TTS 음성을 백그라운드에 미리 버퍼링해 둡니다.
  if (typeof preloadSessionAudios === "function") {
    preloadSessionAudios(currentStudyWords);
  }

  currentWordIndex = 0;

  // 화면 전환 (캘린더 메뉴 숨기고 학습 창 열기)
  welcomeSection.classList.add("hidden");
  welcomeSection.classList.remove("active");
  if (completionSection) {
    completionSection.classList.add("hidden");
    completionSection.classList.remove("active");
  }
  if (minigame1Section) {
    minigame1Section.classList.add("hidden");
    minigame1Section.classList.remove("active");
  }
  if (minigame2Section) {
    minigame2Section.classList.add("hidden");
    minigame2Section.classList.remove("active");
  }
  if (minigame3Section) {
    minigame3Section.classList.add("hidden");
    minigame3Section.classList.remove("active");
  }
  if (minigame4Section) {
    minigame4Section.classList.add("hidden");
    minigame4Section.classList.remove("active");
  }
  studySection.classList.add("active");
  studySection.classList.remove("hidden");

  // 첫 단어 및 정답률 카운터 리셋
  resetAccuracyTracker();
  renderCurrentWord();
}

/**
 * 현재 단어 상태 렌더링
 */
function renderCurrentWord() {
  // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
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
    studyWordTranslation.textContent = getWordTranslation(currentWord, userLang);
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
 * [Comment Policy: 단어 객체와 사용자 모국어 코드를 매핑하여 번역 텍스트를 반환하는 범용 헬퍼]
 * @param {Object} wordObj
 * @param {string} userLang
 * @returns {string}
 */
function getWordTranslation(wordObj, userLang) {
  if (!wordObj) return "";
  if (userLang === "zh") return wordObj.zh || wordObj.en || "Translation not available";
  if (userLang === "vi") return wordObj.vi || wordObj.en || "Translation not available";
  if (userLang === "en") return wordObj.en || "Translation not available";
  return wordObj.en || wordObj.vi || wordObj.zh || "Translation not available";
}

// 전체 미니게임 (총 39문제) 1차 시도 정답률 추적 객체
const accuracyTracker = {
  totalQuestions: 39,
  firstTryCorrect: 0,
  currentQuestionFailed: false
};

/**
 * [Comment Policy: 정답률 추적 카운터 리셋]
 */
function resetAccuracyTracker() {
  accuracyTracker.firstTryCorrect = 0;
  accuracyTracker.currentQuestionFailed = false;
}

// 1번 미니게임 상태 관리 변수
let miniGame1Words = [];           // 1~9번 단어 (총 9개)
let miniGame1ShuffledNative = [];   // 아래쪽 3x3 그리드용 무작위 셔플된 모국어 단어 목록
let currentMiniGame1Index = 0;     // 현재 순서대로 맞춰야 하는 한국어 단어 인덱스 (0 ~ 8)
let isMiniGame1Animating = false;   // 오답 점멸 등 애니메이션 진행 중 중복 클릭 방지 플래그

/**
 * [Comment Policy: 1번 미니게임(3x3 한국어-모국어 단어 매칭 게임) 초기화 및 렌더링]
 * 10개 단어 중 1~9번 단어를 위쪽 3x3에 순서대로 배치하고,
 * 아래쪽 3x3에는 모국어 단어를 무작위로 뒤섞어 배치합니다.
 */
function initMiniGame1() {
  // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
  const userLang = activeUser?.lang || "vi";

  // 10개 단어 중 1~9번 단어 추출
  miniGame1Words = currentStudyWords.slice(0, 9).map(w => ({
    ...w,
    hasWrongAttempt: false // 1번 미니게임 단어별 1차 시도 오답 여부
  }));

  if (miniGame1Words.length === 0) {
    alert("미니게임을 진행할 단어 데이터가 부족합니다.");
    return;
  }

  currentMiniGame1Index = 0;
  isMiniGame1Animating = false;

  // 1~9번 모국어 단어 목록 생성
  miniGame1ShuffledNative = miniGame1Words.map((w, idx) => ({
    originalIndex: idx,
    wordObj: w,
    nativeText: getWordTranslation(w, userLang),
    isMatched: false
  }));

  // 모국어 단어 순서 무작위 셔플 (Fisher-Yates 알고리즘)
  for (let i = miniGame1ShuffledNative.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [miniGame1ShuffledNative[i], miniGame1ShuffledNative[j]] = [miniGame1ShuffledNative[j], miniGame1ShuffledNative[i]];
  }

  // 1. 위쪽 한국어 3x3 그리드 렌더링 (순서대로 1~9번)
  if (minigame1KoreanGrid) {
    minigame1KoreanGrid.innerHTML = "";
    miniGame1Words.forEach((w, idx) => {
      const cell = document.createElement("div");
      cell.className = `minigame-cell ${idx === 0 ? "cell-highlight" : ""}`;
      cell.id = `minigame1-ko-cell-${idx}`;
      cell.dataset.index = idx;

      // 주 텍스트 (한국어 단어)
      const mainText = document.createElement("span");
      mainText.className = "cell-main-text";
      mainText.textContent = cleanWord(w.word);

      // 보조 텍스트 (정답 시 노출될 모국어 번역)
      const subText = document.createElement("span");
      subText.className = "cell-sub-text";
      subText.textContent = getWordTranslation(w, userLang);

      cell.appendChild(mainText);
      cell.appendChild(subText);
      minigame1KoreanGrid.appendChild(cell);
    });
  }

  // 2. 아래쪽 모국어 3x3 그리드 렌더링 (무작위 셔플)
  if (minigame1NativeGrid) {
    minigame1NativeGrid.innerHTML = "";
    miniGame1ShuffledNative.forEach((item, slotIdx) => {
      const cell = document.createElement("div");
      cell.className = "minigame-cell";
      cell.id = `minigame1-native-cell-${slotIdx}`;
      cell.dataset.slotIndex = slotIdx;
      cell.dataset.originalIndex = item.originalIndex;

      // 주 텍스트 (모국어 단어)
      const mainText = document.createElement("span");
      mainText.className = "cell-main-text";
      mainText.textContent = item.nativeText;

      // 보조 텍스트 (정답 시 노출될 한국어 단어)
      const subText = document.createElement("span");
      subText.className = "cell-sub-text";
      subText.textContent = cleanWord(item.wordObj.word);

      cell.appendChild(mainText);
      cell.appendChild(subText);

      // 클릭 시 정답/오답 판정
      cell.onclick = () => handleMiniGame1NativeClick(cell, item);

      minigame1NativeGrid.appendChild(cell);
    });
  }

  // 3. 하단 '다음' 버튼 초기 비활성화
  if (btnMinigame1Next) {
    btnMinigame1Next.disabled = true;
  }

  // 4. 화면 전환: 단어 학습 카드 숨김 및 미니게임 섹션 활성화
  studySection.classList.add("hidden");
  studySection.classList.remove("active");
  completionSection.classList.add("hidden");
  completionSection.classList.remove("active");

  if (minigame1Section) {
    minigame1Section.classList.remove("hidden");
    minigame1Section.classList.add("active");
  }
}

/**
 * [Comment Policy: 1번 미니게임 모국어 셀 클릭 핸들러]
 * 하이라이트된 한국어 단어와 일치 여부에 따라 정답(연두색 변환 및 확장) 또는 오답(동시 붉은색 점멸) 처리합니다.
 * @param {HTMLElement} nativeCell
 * @param {Object} item
 */
function handleMiniGame1NativeClick(nativeCell, item) {
  // 이미 매칭 완료되었거나 오답 점멸 중이거나 전체 완료된 경우 클릭 무시
  if (item.isMatched || isMiniGame1Animating || currentMiniGame1Index >= miniGame1Words.length) {
    return;
  }

  const currentKoCell = document.getElementById(`minigame1-ko-cell-${currentMiniGame1Index}`);
  if (!currentKoCell) return;

  // [1-1. 정답인 경우] 클릭한 모국어의 원본 인덱스가 현재 한국어 순서와 일치
  if (item.originalIndex === currentMiniGame1Index) {
    item.isMatched = true;

    // 첫 시도에 바로 맞춘 경우 정답수 누적
    if (!miniGame1Words[currentMiniGame1Index].hasWrongAttempt) {
      accuracyTracker.firstTryCorrect++;
    }

    // 한국어 셀: 하이라이트 제거 및 정답 클래스 추가 (연두색 + 하단 모국어 노출)
    currentKoCell.classList.remove("cell-highlight");
    currentKoCell.classList.add("cell-correct");

    // 모국어 셀: 정답 클래스 추가 (연두색 + 하단 한국어 노출)
    nativeCell.classList.add("cell-correct");

    // 한국어 발음 1회 음성 출력
    speakWordOnce(cleanWord(miniGame1Words[currentMiniGame1Index].word));

    // 다음 순번 단어로 하이라이트 이동
    currentMiniGame1Index++;

    if (currentMiniGame1Index < miniGame1Words.length) {
      const nextKoCell = document.getElementById(`minigame1-ko-cell-${currentMiniGame1Index}`);
      if (nextKoCell) {
        nextKoCell.classList.add("cell-highlight");
      }
    } else {
      // 1~9번 단어 매칭 완료 시 '다음' 버튼 활성화
      if (btnMinigame1Next) {
        btnMinigame1Next.disabled = false;
      }
    }
  } else {
    // [1-2. 오답인 경우] 현재 단어 오답 발생 마크 및 하이라이트 한국어 셀과 클릭한 모국어 셀 동시 붉은색 점멸
    if (miniGame1Words[currentMiniGame1Index]) {
      miniGame1Words[currentMiniGame1Index].hasWrongAttempt = true;
    }

    isMiniGame1Animating = true;

    currentKoCell.classList.add("cell-wrong-flash");
    nativeCell.classList.add("cell-wrong-flash");

    setTimeout(() => {
      currentKoCell.classList.remove("cell-wrong-flash");
      nativeCell.classList.remove("cell-wrong-flash");
      isMiniGame1Animating = false;
    }, 450);
  }
}

// ==========================================================================
// [신규] 2번 미니게임 (사지선다 객관식 퀴즈 10문제) 상태 및 함수
// ==========================================================================

let miniGame2Questions = [];           // 10개 단어를 무작위로 섞은 문제 세트 배열
let currentMiniGame2QuizIndex = 0;     // 현재 풀고 있는 문제 인덱스 (0 ~ 9)
let isMiniGame2Animating = false;       // 오답 점멸 중 연타 방지 플래그
let isMiniGame2CurrentAnswered = false; // 현재 문제 정답 선택 완료 여부

/**
 * [Comment Policy: 2번 미니게임(사지선다 퀴즈 10문제) 초기화]
 * 현재 10개 학습 단어를 무작위 순서로 셔플하여 10개의 문제 세트를 준비하고 1번 문제를 렌더링합니다.
 */
function initMiniGame2() {
  if (currentStudyWords.length === 0) {
    alert("미니게임을 진행할 단어 데이터가 부족합니다.");
    return;
  }

  // 10개 단어 복사 후 무작위 셔플 (Fisher-Yates 알고리즘)
  miniGame2Questions = [...currentStudyWords];
  for (let i = miniGame2Questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [miniGame2Questions[i], miniGame2Questions[j]] = [miniGame2Questions[j], miniGame2Questions[i]];
  }

  currentMiniGame2QuizIndex = 0;

  // 화면 전환: 미니게임 1 숨김 및 미니게임 2 활성화
  if (minigame1Section) {
    minigame1Section.classList.add("hidden");
    minigame1Section.classList.remove("active");
  }
  if (completionSection) {
    completionSection.classList.add("hidden");
    completionSection.classList.remove("active");
  }
  if (minigame2Section) {
    minigame2Section.classList.remove("hidden");
    minigame2Section.classList.add("active");
  }

  renderMiniGame2Question();
}

/**
 * [Comment Policy: 2번 미니게임 현재 문제 및 4지선다 보기 렌더링]
 * 현재 차례 단어에 대한 정답 1개와 오답 3개를 구성하여 무작위 위치로 섞어 렌더링합니다.
 */
function renderMiniGame2Question() {
  // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
  const userLang = activeUser?.lang || "vi";

  if (!miniGame2Questions || miniGame2Questions.length === 0) return;
  const currentTargetWord = miniGame2Questions[currentMiniGame2QuizIndex];
  if (!currentTargetWord) return;

  isMiniGame2Animating = false;
  isMiniGame2CurrentAnswered = false;
  accuracyTracker.currentQuestionFailed = false; // 현재 문제 오답 여부 초기화

  // 1. 피드백 메시지 숨김 및 '다음' 버튼 비활성화
  if (minigame2Feedback) {
    minigame2Feedback.classList.add("hidden");
  }
  if (btnMinigame2Next) {
    btnMinigame2Next.disabled = true;
  }

  // 2. 문제 번호 및 한국어 단어 표시 (예: 1. 단어명)
  if (minigame2QuestionTitle) {
    const questionNumber = currentMiniGame2QuizIndex + 1;
    minigame2QuestionTitle.textContent = `${questionNumber}. ${cleanWord(currentTargetWord.word)}`;
  }

  // 3. 정답 모국어 단어
  const correctTranslation = getWordTranslation(currentTargetWord, userLang);

  // 4. 오답 모국어 3개 후보 추출 (중복 제거 및 정답 단어 제외)
  const candidateWords = (wordDatabase && wordDatabase.length >= 4) ? wordDatabase : currentStudyWords;
  const wrongOptions = [];
  const usedTranslations = new Set([correctTranslation]);

  // 후보 단어 셔플
  const shuffledCandidates = [...candidateWords].sort(() => Math.random() - 0.5);

  for (const w of shuffledCandidates) {
    const trans = getWordTranslation(w, userLang);
    if (trans && trans !== "Translation not available" && !usedTranslations.has(trans)) {
      usedTranslations.add(trans);
      wrongOptions.push(trans);
      if (wrongOptions.length === 3) break;
    }
  }

  // 만약 전체 DB 부족 시 기본 더미 보강 (비정상 방지)
  while (wrongOptions.length < 3) {
    const dummy = `오답 단어 ${wrongOptions.length + 1}`;
    wrongOptions.push(dummy);
  }

  // 5. 보기 4개 구성 (정답 1개 + 오답 3개) 및 무작위 셔플
  const options = [
    { isCorrect: true, text: correctTranslation },
    { isCorrect: false, text: wrongOptions[0] },
    { isCorrect: false, text: wrongOptions[1] },
    { isCorrect: false, text: wrongOptions[2] }
  ];

  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  // 6. 4지선다 DOM 렌더링 (①, ②, ③, ④)
  const numberSymbols = ["①", "②", "③", "④"];
  if (minigame2OptionsContainer) {
    minigame2OptionsContainer.innerHTML = "";
    options.forEach((opt, idx) => {
      const optionEl = document.createElement("div");
      optionEl.className = "quiz-option";
      optionEl.id = `minigame2-option-${idx}`;

      const numEl = document.createElement("span");
      numEl.className = "quiz-option-num";
      numEl.textContent = numberSymbols[idx] || `${idx + 1}.`;

      const textEl = document.createElement("span");
      textEl.className = "quiz-option-text";
      textEl.textContent = opt.text;

      optionEl.appendChild(numEl);
      optionEl.appendChild(textEl);

      // 보기 클릭 이벤트 바인딩
      optionEl.onclick = () => handleMiniGame2OptionClick(optionEl, opt.isCorrect, currentTargetWord);

      minigame2OptionsContainer.appendChild(optionEl);
    });
  }
}

/**
 * [Comment Policy: 2번 미니게임 객관식 보기 클릭 처리]
 * 오답 클릭 시 붉은색 점멸, 정답 클릭 시 연두색 활성화 및 '다음' 버튼 활성화
 * @param {HTMLElement} optionEl
 * @param {boolean} isCorrect
 * @param {Object} targetWord
 */
function handleMiniGame2OptionClick(optionEl, isCorrect, targetWord) {
  // 이미 정답을 맞춘 상태이거나 점멸 애니메이션 중이면 클릭 무시
  if (isMiniGame2CurrentAnswered || isMiniGame2Animating) return;

  if (isCorrect) {
    // [정답 처리]
    isMiniGame2CurrentAnswered = true;

    // 1차 시도에 바로 맞춘 경우 정답수 누적
    if (!accuracyTracker.currentQuestionFailed) {
      accuracyTracker.firstTryCorrect++;
    }

    // 보기 연두색 전환
    optionEl.classList.add("quiz-option-correct");

    // 정답 피드백 메시지 노출
    if (minigame2Feedback) {
      minigame2Feedback.textContent = "🎉 정답입니다!";
      minigame2Feedback.classList.remove("hidden");
    }

    // 한국어 단어 발음 1회 음성 재생
    speakWordOnce(cleanWord(targetWord.word));

    // 하단 '다음' 버튼 활성화
    if (btnMinigame2Next) {
      btnMinigame2Next.disabled = false;
    }
  } else {
    // [오답 처리] 오답 발생 마크 및 클릭한 보기 붉은색 점멸/진동
    accuracyTracker.currentQuestionFailed = true;
    isMiniGame2Animating = true;
    optionEl.classList.add("cell-wrong-flash");

    setTimeout(() => {
      optionEl.classList.remove("cell-wrong-flash");
      isMiniGame2Animating = false;
    }, 450);
  }
}

// ==========================================================================
// [신규] 3번 미니게임 (한 글자 빈칸 직접 타이핑 퀴즈 10문제) 상태 및 함수
// ==========================================================================

let miniGame3Questions = [];           // 10개 단어를 무작위로 섞은 문제 세트 배열
let currentMiniGame3QuizIndex = 0;     // 현재 풀고 있는 문제 인덱스 (0 ~ 9)
let miniGame3BlankInfo = { targetChar: "", blankIndex: 0, word: "", wordObj: null };
let isMiniGame3Answered = false;       // 현재 문제 정답 확인 완료 여부
let isMiniGame3WrongOccurred = false;  // 오답 발생 후 인풋 포커스 시 자동 클리어용 플래그
let isMiniGame3CheckAnimating = false; // 오답 점멸 중 중복 클릭 방지 플래그

/**
 * [Comment Policy: 3번 미니게임(한 글자 빈칸 타이핑 퀴즈) 초기화]
 * 현재 10개 학습 단어를 무작위 순서로 셔플하여 문제 세트를 구성하고 1번 문제를 로드합니다.
 */
function initMiniGame3() {
  if (currentStudyWords.length === 0) {
    alert("미니게임을 진행할 단어 데이터가 부족합니다.");
    return;
  }

  // 10개 단어 복사 후 무작위 셔플 (Fisher-Yates 알고리즘)
  miniGame3Questions = [...currentStudyWords];
  for (let i = miniGame3Questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [miniGame3Questions[i], miniGame3Questions[j]] = [miniGame3Questions[j], miniGame3Questions[i]];
  }

  currentMiniGame3QuizIndex = 0;

  // 화면 전환: 미니게임 2 숨김 및 미니게임 3 활성화
  if (minigame1Section) {
    minigame1Section.classList.add("hidden");
    minigame1Section.classList.remove("active");
  }
  if (minigame2Section) {
    minigame2Section.classList.add("hidden");
    minigame2Section.classList.remove("active");
  }
  if (completionSection) {
    completionSection.classList.add("hidden");
    completionSection.classList.remove("active");
  }
  if (minigame3Section) {
    minigame3Section.classList.remove("hidden");
    minigame3Section.classList.add("active");
  }

  renderMiniGame3Question();
}

/**
 * [Comment Policy: 3번 미니게임 현재 문제 렌더링]
 * 단어에서 1글자를 무작위로 선택하여 1자 제한 빈칸 인풋으로 치환하고, 하단에 모국어를 온전히 표시합니다.
 */
function renderMiniGame3Question() {
  // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
  const userLang = activeUser?.lang || "vi";

  if (!miniGame3Questions || miniGame3Questions.length === 0) return;
  const currentTargetWord = miniGame3Questions[currentMiniGame3QuizIndex];
  if (!currentTargetWord) return;

  isMiniGame3Answered = false;
  isMiniGame3WrongOccurred = false;
  isMiniGame3CheckAnimating = false;
  accuracyTracker.currentQuestionFailed = false; // 현재 문제 오답 여부 초기화

  // 1. 피드백 메시지 숨김 및 '다음' 버튼 비활성화
  if (minigame3Feedback) {
    minigame3Feedback.classList.add("hidden");
  }
  if (btnMinigame3Next) {
    btnMinigame3Next.disabled = true;
  }
  if (btnMinigame3Check) {
    btnMinigame3Check.disabled = false;
  }

  // 2. 단어 텍스트 정제 및 빈칸 글자 선정 (특수문자 및 맨 끝 '다' 제외)
  const cleanKo = cleanWord(currentTargetWord.word);
  
  // 1) 순수 한글 완성형 글자([가-힣]) 인덱스만 1차 수집 (특수문자, 괄호, 공백 등 자동 제외)
  const hangulCharIndices = [];
  for (let i = 0; i < cleanKo.length; i++) {
    const char = cleanKo[i];
    if (/[가-힣]/.test(char)) {
      hangulCharIndices.push(i);
    }
  }

  // 2) 단어 맨 끝의 '다' 어미 제외 필터링 (맞추는 의미를 보존하기 위해 '~하다', '~이다', '울리다' 등의 마지막 '다' 배제)
  let validCharIndices = [];
  if (hangulCharIndices.length > 0) {
    const lastHangulIdx = hangulCharIndices[hangulCharIndices.length - 1];
    validCharIndices = hangulCharIndices.filter(idx => {
      const isEndDa = (idx === lastHangulIdx && cleanKo[idx] === "다");
      return !isEndDa;
    });
  }

  // 3) 만약 후보가 없으면(예: "다" 단일 글자 등) 전체 한글 후보군 사용 (비정상 방지)
  if (validCharIndices.length === 0) {
    validCharIndices = hangulCharIndices.length > 0 ? hangulCharIndices : [0];
  }

  const chosenBlankIndex = validCharIndices[Math.floor(Math.random() * validCharIndices.length)] || 0;
  const targetChar = cleanKo[chosenBlankIndex];

  miniGame3BlankInfo = {
    targetChar: targetChar,
    blankIndex: chosenBlankIndex,
    word: cleanKo,
    wordObj: currentTargetWord
  };

  // 3. 문제 텍스트 및 인라인 인풋 DOM 렌더링
  if (minigame3WordContainer) {
    minigame3WordContainer.innerHTML = "";

    // 문제 번호
    const qNum = document.createElement("span");
    qNum.textContent = `${currentMiniGame3QuizIndex + 1}. `;
    minigame3WordContainer.appendChild(qNum);

    // 앞부분 텍스트
    const prefixText = cleanKo.substring(0, chosenBlankIndex);
    if (prefixText) {
      const prefixEl = document.createElement("span");
      prefixEl.textContent = prefixText;
      minigame3WordContainer.appendChild(prefixEl);
    }

    // 빈칸 1글자 입력 인풋
    const inputEl = document.createElement("input");
    inputEl.type = "text";
    inputEl.maxLength = 1;
    inputEl.className = "blank-input";
    inputEl.id = "minigame3-input";
    inputEl.autocomplete = "off";
    inputEl.autocapitalize = "off";
    inputEl.spellcheck = false;

    // [편의성 패치: 오답 확인 후 인풋 클릭 시 기존 입력 자동 삭제]
    inputEl.onfocus = () => {
      if (isMiniGame3WrongOccurred && !isMiniGame3Answered) {
        inputEl.value = "";
        isMiniGame3WrongOccurred = false;
      }
    };

    // 엔터 키 누르면 정답 확인 자동 트리거
    inputEl.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        checkMiniGame3Answer();
      }
    };

    minigame3WordContainer.appendChild(inputEl);

    // 뒷부분 텍스트
    const suffixText = cleanKo.substring(chosenBlankIndex + 1);
    if (suffixText) {
      const suffixEl = document.createElement("span");
      suffixEl.textContent = suffixText;
      minigame3WordContainer.appendChild(suffixEl);
    }

    // 렌더링 즉시 인풋에 자동 포커스
    setTimeout(() => {
      inputEl.focus();
    }, 100);
  }

  // 4. 하단 온전한 모국어 단어 힌트 렌더링
  if (minigame3NativeHint) {
    minigame3NativeHint.textContent = getWordTranslation(currentTargetWord, userLang);
  }
}

/**
 * [Comment Policy: 3번 미니게임 정답 확인 및 인터랙션 처리]
 * 정답 시 연두색 활성화 및 [다음] 버튼 활성화, 오답 시 [정답 확인] 버튼 붉은색 점멸
 */
function checkMiniGame3Answer() {
  if (isMiniGame3Answered || isMiniGame3CheckAnimating) return;

  const inputEl = document.getElementById("minigame3-input");
  if (!inputEl) return;

  const userChar = (inputEl.value || "").trim();

  // [정답 판정]
  if (userChar === miniGame3BlankInfo.targetChar) {
    isMiniGame3Answered = true;

    // 1차 시도에 바로 맞춘 경우 정답수 누적
    if (!accuracyTracker.currentQuestionFailed) {
      accuracyTracker.firstTryCorrect++;
    }

    // 입력창 연두색 활성화 및 읽기 전용 전환
    inputEl.classList.add("blank-input-correct");
    inputEl.readOnly = true;

    // 정답 피드백 메시지 노출
    if (minigame3Feedback) {
      minigame3Feedback.textContent = "🎉 정답입니다!";
      minigame3Feedback.classList.remove("hidden");
    }

    // 한국어 전체 단어 발음 1회 음성 재생
    speakWordOnce(miniGame3BlankInfo.word);

    // 하단 '다음' 버튼 활성화
    if (btnMinigame3Next) {
      btnMinigame3Next.disabled = false;
    }
  } else {
    // [오답 판정] [정답 확인] 버튼 붉은색 점멸 및 진동
    accuracyTracker.currentQuestionFailed = true;
    isMiniGame3WrongOccurred = true;
    isMiniGame3CheckAnimating = true;

    if (btnMinigame3Check) {
      btnMinigame3Check.classList.add("cell-wrong-flash");
    }

    setTimeout(() => {
      if (btnMinigame3Check) {
        btnMinigame3Check.classList.remove("cell-wrong-flash");
      }
      isMiniGame3CheckAnimating = false;
    }, 450);
  }
}

// ==========================================================================
// [신규] 4번 미니게임 (음성 청취 사지선다 객관식 퀴즈 10문제) 상태 및 함수
// ==========================================================================

let miniGame4Questions = [];           // 10개 단어를 무작위로 섞은 문제 세트 배열
let currentMiniGame4QuizIndex = 0;     // 현재 풀고 있는 문제 인덱스 (0 ~ 9)
let isMiniGame4Animating = false;       // 오답 점멸 중 중복 클릭 방지 플래그
let isMiniGame4CurrentAnswered = false; // 현재 문제 정답 선택 완료 여부

/**
 * [Comment Policy: 4번 미니게임(음성 청취 사지선다 퀴즈) 초기화]
 * 현재 10개 학습 단어를 무작위 순서로 셔플하여 문제 세트를 구성하고 1번 문제를 렌더링합니다.
 */
function initMiniGame4() {
  if (currentStudyWords.length === 0) {
    alert("미니게임을 진행할 단어 데이터가 부족합니다.");
    return;
  }

  // 10개 단어 복사 후 무작위 셔플 (Fisher-Yates 알고리즘)
  miniGame4Questions = [...currentStudyWords];
  for (let i = miniGame4Questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [miniGame4Questions[i], miniGame4Questions[j]] = [miniGame4Questions[j], miniGame4Questions[i]];
  }

  currentMiniGame4QuizIndex = 0;

  // 화면 전환: 미니게임 3 숨김 및 미니게임 4 활성화
  if (minigame1Section) {
    minigame1Section.classList.add("hidden");
    minigame1Section.classList.remove("active");
  }
  if (minigame2Section) {
    minigame2Section.classList.add("hidden");
    minigame2Section.classList.remove("active");
  }
  if (minigame3Section) {
    minigame3Section.classList.add("hidden");
    minigame3Section.classList.remove("active");
  }
  if (completionSection) {
    completionSection.classList.add("hidden");
    completionSection.classList.remove("active");
  }
  if (minigame4Section) {
    minigame4Section.classList.remove("hidden");
    minigame4Section.classList.add("active");
  }

  renderMiniGame4Question();
}

/**
 * [Comment Policy: 4번 미니게임 현재 문제 렌더링 및 음성 자동 재생]
 * 텍스트 힌트 없이 스피커 버튼과 4지선다 보기를 제공하며, 문제가 열릴 때 한국어 발음을 1회 자동 재생합니다.
 */
function renderMiniGame4Question() {
  // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
  const userLang = activeUser?.lang || "vi";

  if (!miniGame4Questions || miniGame4Questions.length === 0) return;
  const currentTargetWord = miniGame4Questions[currentMiniGame4QuizIndex];
  if (!currentTargetWord) return;

  isMiniGame4Animating = false;
  isMiniGame4CurrentAnswered = false;
  accuracyTracker.currentQuestionFailed = false; // 현재 문제 오답 여부 초기화

  // 1. 피드백 메시지 숨김 및 '다음' 버튼 비활성화
  if (minigame4Feedback) {
    minigame4Feedback.classList.add("hidden");
  }
  if (btnMinigame4Next) {
    btnMinigame4Next.disabled = true;
  }

  // 2. 문제 번호 표시 (예: 1.)
  if (minigame4QuestionNum) {
    minigame4QuestionNum.textContent = `${currentMiniGame4QuizIndex + 1}.`;
  }

  // 3. 스피커 듣기 버튼 클릭 이벤트 및 로드 시 1회 자동 음성 재생
  const cleanWordText = cleanWord(currentTargetWord.word);
  if (minigame4SpeakBtn) {
    minigame4SpeakBtn.onclick = () => {
      speakWordOnce(cleanWordText);
    };
  }

  // 문제 화면 진입 즉시 1회 자동 발음 재생
  setTimeout(() => {
    speakWordOnce(cleanWordText);
  }, 250);

  // 4. 정답 모국어 단어
  const correctTranslation = getWordTranslation(currentTargetWord, userLang);

  // 5. 오답 모국어 3개 후보 추출 (중복 제거 및 정답 단어 제외)
  const candidateWords = (wordDatabase && wordDatabase.length >= 4) ? wordDatabase : currentStudyWords;
  const wrongOptions = [];
  const usedTranslations = new Set([correctTranslation]);

  const shuffledCandidates = [...candidateWords].sort(() => Math.random() - 0.5);

  for (const w of shuffledCandidates) {
    const trans = getWordTranslation(w, userLang);
    if (trans && trans !== "Translation not available" && !usedTranslations.has(trans)) {
      usedTranslations.add(trans);
      wrongOptions.push(trans);
      if (wrongOptions.length === 3) break;
    }
  }

  while (wrongOptions.length < 3) {
    const dummy = `오답 단어 ${wrongOptions.length + 1}`;
    wrongOptions.push(dummy);
  }

  // 6. 보기 4개 구성 (정답 1개 + 오답 3개) 및 무작위 셔플
  const options = [
    { isCorrect: true, text: correctTranslation },
    { isCorrect: false, text: wrongOptions[0] },
    { isCorrect: false, text: wrongOptions[1] },
    { isCorrect: false, text: wrongOptions[2] }
  ];

  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  // 7. 4지선다 DOM 렌더링 (①, ②, ③, ④)
  const numberSymbols = ["①", "②", "③", "④"];
  if (minigame4OptionsContainer) {
    minigame4OptionsContainer.innerHTML = "";
    options.forEach((opt, idx) => {
      const optionEl = document.createElement("div");
      optionEl.className = "quiz-option";
      optionEl.id = `minigame4-option-${idx}`;

      const numEl = document.createElement("span");
      numEl.className = "quiz-option-num";
      numEl.textContent = numberSymbols[idx] || `${idx + 1}.`;

      const textEl = document.createElement("span");
      textEl.className = "quiz-option-text";
      textEl.textContent = opt.text;

      optionEl.appendChild(numEl);
      optionEl.appendChild(textEl);

      // 보기 클릭 이벤트 바인딩
      optionEl.onclick = () => handleMiniGame4OptionClick(optionEl, opt.isCorrect, currentTargetWord);

      minigame4OptionsContainer.appendChild(optionEl);
    });
  }
}

/**
 * [Comment Policy: 4번 미니게임 객관식 보기 클릭 처리]
 * 오답 클릭 시 붉은색 점멸, 정답 클릭 시 연두색 활성화 및 '다음' 버튼 활성화
 * @param {HTMLElement} optionEl
 * @param {boolean} isCorrect
 * @param {Object} targetWord
 */
function handleMiniGame4OptionClick(optionEl, isCorrect, targetWord) {
  // 이미 정답을 맞춘 상태이거나 점멸 애니메이션 중이면 클릭 무시
  if (isMiniGame4CurrentAnswered || isMiniGame4Animating) return;

  if (isCorrect) {
    // [정답 처리]
    isMiniGame4CurrentAnswered = true;

    // 1차 시도에 바로 맞춘 경우 정답수 누적
    if (!accuracyTracker.currentQuestionFailed) {
      accuracyTracker.firstTryCorrect++;
    }

    // 보기 연두색 전환
    optionEl.classList.add("quiz-option-correct");

    // 정답 피드백 메시지 노출
    if (minigame4Feedback) {
      minigame4Feedback.textContent = "🎉 정답입니다!";
      minigame4Feedback.classList.remove("hidden");
    }

    // 한국어 단어 발음 1회 음성 재생
    speakWordOnce(cleanWord(targetWord.word));

    // 하단 '다음' 버튼 활성화
    if (btnMinigame4Next) {
      btnMinigame4Next.disabled = false;
    }
  } else {
    // [오답 처리] 오답 발생 마크 및 클릭한 보기 붉은색 점멸/진동
    accuracyTracker.currentQuestionFailed = true;
    isMiniGame4Animating = true;
    optionEl.classList.add("cell-wrong-flash");

    setTimeout(() => {
      optionEl.classList.remove("cell-wrong-flash");
      isMiniGame4Animating = false;
    }, 450);
  }
}

/**
 * [Comment Policy: 정답률 계산 및 완료 화면 메시지/버튼 분기 렌더링]
 * 90~100%: '오늘 단어 학습 성공!!'
 * 80%대: '안타깝습니다. 다시 할까요? 그만 할까요?'
 * 70%대: '안타깝습니다. 다시 해야 합니다.'
 * 70% 미만: '처음부터 다시 해야 합니다.' + '메인 메뉴로' 버튼 비활성화 (학습 다시하기만 허용)
 */
function renderCompletionScreen() {
  const total = accuracyTracker.totalQuestions || 39;
  const correct = accuracyTracker.firstTryCorrect;
  const accuracyPercent = Math.min(100, Math.max(0, Math.round((correct / total) * 100)));

  const completionIcon = document.getElementById("completion-icon");
  const completionTitle = document.getElementById("completion-title");
  const completionMsg = document.getElementById("completion-message");
  const accuracyText = document.getElementById("accuracy-percent-text");

  if (accuracyText) {
    accuracyText.textContent = `${accuracyPercent}% (${correct}/${total}문제)`;
  }

  // 완료 카드 경고 테마 클래스 초기화
  if (completionSection) {
    completionSection.classList.remove("warning-score");
  }

  if (accuracyPercent >= 90) {
    // 90 ~ 100%
    if (completionIcon) completionIcon.textContent = "🏆";
    if (completionTitle) completionTitle.textContent = "오늘 단어 학습 성공!!";
    if (completionMsg) {
      completionMsg.innerHTML = "축하합니다! 훌륭한 성적으로 오늘의 10개 단어를 완벽하게 마스터했습니다.<br>매일 꾸준히 학습하면 한국어 실력이 더욱 향상됩니다.";
    }
    if (btnGoMenu) btnGoMenu.disabled = false;
  } else if (accuracyPercent >= 80) {
    // 80 ~ 89%
    if (completionIcon) completionIcon.textContent = "✨";
    if (completionTitle) completionTitle.textContent = "안타깝습니다. 다시 할까요? 그만 할까요?";
    if (completionMsg) {
      completionMsg.innerHTML = "아쉽게 몇 문제를 놓쳤습니다.<br>복습을 원하시면 '학습 다시하기'를, 완료하려면 '메인 메뉴로'를 누르세요.";
    }
    if (btnGoMenu) btnGoMenu.disabled = false;
  } else if (accuracyPercent >= 70) {
    // 70 ~ 79%
    if (completionIcon) completionIcon.textContent = "💪";
    if (completionTitle) completionTitle.textContent = "안타깝습니다. 다시 해야 합니다.";
    if (completionMsg) {
      completionMsg.innerHTML = "목표 정답률(80% 이상)에 도달하지 못했습니다.<br>더 나은 실력을 위해 다시 한번 학습해보는 것을 강력히 권장합니다.";
    }
    if (btnGoMenu) btnGoMenu.disabled = false;
  } else {
    // 70% 미만 (< 70%)
    if (completionSection) completionSection.classList.add("warning-score");
    if (completionIcon) completionIcon.textContent = "⚠️";
    if (completionTitle) completionTitle.textContent = "처음부터 다시 해야 합니다.";
    if (completionMsg) {
      completionMsg.innerHTML = "정답률이 70% 미만입니다.<br>단어를 더 확실히 암기하기 위해 처음부터 다시 학습을 완료해야 합니다.";
    }
    // '메인 메뉴로' 버튼 비활성화 (다시하기만 강제)
    if (btnGoMenu) {
      btnGoMenu.disabled = true;
    }
  }

  // 화면 전환: 미니게임 4 숨김 및 완료 섹션 활성화
  if (minigame4Section) {
    minigame4Section.classList.add("hidden");
    minigame4Section.classList.remove("active");
  }
  if (completionSection) {
    completionSection.classList.remove("hidden");
    completionSection.classList.add("active");
  }
}

/**
 * 학습을 완료한 회차 세션의 진척도를 서버와 로컬에 저장합니다.
 * @param {string} dayLabel
 * @param {number} session
 */
async function recordSessionProgress(dayLabel, session) {
  // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
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
          // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
          sessionStorage.setItem("active_user", JSON.stringify(authResult));
          sessionStorage.setItem("last_logged_in_id", studentId); // 자동완성용 백업
          // [Comment Policy: 로그인 성공 즉시 세션 시작/마지막 활동 시간을 로컬스토리지에 저장]
          localStorage.setItem("session_last_active", Date.now().toString());

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
      // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
      const lastId = JSON.parse(sessionStorage.getItem("active_user"))?.id;
      if (lastId) {
        sessionStorage.setItem("last_logged_in_id", lastId);
      }

      // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
      sessionStorage.removeItem("active_user");
      // [Comment Policy: 로그아웃 시 타임아웃 검증용 세션 활동 시간 초기화]
      localStorage.removeItem("session_last_active");

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

      // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
      const lastId = JSON.parse(sessionStorage.getItem("active_user"))?.id;
      if (lastId) {
        sessionStorage.setItem("last_logged_in_id", lastId);
      }

      // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
      sessionStorage.removeItem("active_user");
      // [Comment Policy: 로그아웃 시 타임아웃 검증용 세션 활동 시간 초기화]
      localStorage.removeItem("session_last_active");

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
        // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
        const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
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
        // [Comment Policy: 10개 단어 학습 완료 시 바로 1번 미니게임으로 진입]
        initMiniGame1();
      } else {
        currentWordIndex++;
        renderCurrentWord();
      }
    };
  }

  // [신규] 1번 미니게임 '돌아가기' 버튼 바인딩 (단어 학습 카드로 복귀)
  if (btnMinigame1Back) {
    btnMinigame1Back.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      if (minigame1Section) {
        minigame1Section.classList.add("hidden");
        minigame1Section.classList.remove("active");
      }
      if (studySection) {
        studySection.classList.remove("hidden");
        studySection.classList.add("active");
      }
      renderCurrentWord();
    };
  }

  // [신규] 1번 미니게임 '다음' 버튼 바인딩 (1번 완료 후 2번 미니게임 진입)
  if (btnMinigame1Next) {
    btnMinigame1Next.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      // 1번 미니게임 완료 -> 2번 미니게임(사지선다 퀴즈 10문제)으로 전환
      initMiniGame2();
    };
  }

  // [신규] 2번 미니게임 '돌아가기' 버튼 바인딩 (1번 미니게임으로 복귀)
  if (btnMinigame2Back) {
    btnMinigame2Back.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      if (minigame2Section) {
        minigame2Section.classList.add("hidden");
        minigame2Section.classList.remove("active");
      }
      if (minigame1Section) {
        minigame1Section.classList.remove("hidden");
        minigame1Section.classList.add("active");
      }
    };
  }

  // [신규] 2번 미니게임 '다음' 버튼 바인딩 (다음 문제 이동 및 10문제 완료 시 3번 미니게임으로 전환)
  if (btnMinigame2Next) {
    btnMinigame2Next.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      currentMiniGame2QuizIndex++;

      // 10문제 중 아직 문제가 남은 경우 다음 문제 출제
      if (currentMiniGame2QuizIndex < miniGame2Questions.length) {
        renderMiniGame2Question();
      } else {
        // 2번 미니게임 10문제 완료 -> 3번 미니게임(한 글자 빈칸 타이핑)으로 전환
        initMiniGame3();
      }
    };
  }

  // [신규] 3번 미니게임 '정답 확인' 버튼 바인딩
  if (btnMinigame3Check) {
    btnMinigame3Check.onclick = (e) => {
      e.preventDefault();
      checkMiniGame3Answer();
    };
  }

  // [신규] 3번 미니게임 '돌아가기' 버튼 바인딩 (2번 미니게임으로 복귀)
  if (btnMinigame3Back) {
    btnMinigame3Back.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      if (minigame3Section) {
        minigame3Section.classList.add("hidden");
        minigame3Section.classList.remove("active");
      }
      if (minigame2Section) {
        minigame2Section.classList.remove("hidden");
        minigame2Section.classList.add("active");
      }
    };
  }

  // [신규] 3번 미니게임 '다음' 버튼 바인딩 (다음 문제 이동 및 10문제 완료 시 4번 미니게임으로 전환)
  if (btnMinigame3Next) {
    btnMinigame3Next.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      currentMiniGame3QuizIndex++;

      // 10문제 중 아직 문제가 남은 경우 다음 문제 출제
      if (currentMiniGame3QuizIndex < miniGame3Questions.length) {
        renderMiniGame3Question();
      } else {
        // 3번 미니게임 10문제 완료 -> 4번 미니게임(음성 청취 사지선다)으로 전환
        initMiniGame4();
      }
    };
  }

  // [신규] 4번 미니게임 '돌아가기' 버튼 바인딩 (3번 미니게임으로 복귀)
  if (btnMinigame4Back) {
    btnMinigame4Back.onclick = (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      if (minigame4Section) {
        minigame4Section.classList.add("hidden");
        minigame4Section.classList.remove("active");
      }
      if (minigame3Section) {
        minigame3Section.classList.remove("hidden");
        minigame3Section.classList.add("active");
      }
    };
  }

  // [신규] 4번 미니게임 '다음' 버튼 바인딩 (다음 문제 이동 및 10문제 완료 시 최종 세션 저장 및 축하 카드 전환)
  if (btnMinigame4Next) {
    btnMinigame4Next.onclick = async (e) => {
      e.preventDefault();
      resetSpeechSynthesis();

      currentMiniGame4QuizIndex++;

      // 10문제 중 아직 문제가 남은 경우 다음 문제 출제
      if (currentMiniGame4QuizIndex < miniGame4Questions.length) {
        renderMiniGame4Question();
      } else {
        // 4번 미니게임까지 모두 완료! 정답률 산출 및 완료 화면 렌더링
        const total = accuracyTracker.totalQuestions || 39;
        const correct = accuracyTracker.firstTryCorrect;
        const accuracyPercent = Math.min(100, Math.max(0, Math.round((correct / total) * 100)));

        // 70% 이상 달성 시 세션 진도 및 출석 정상 저장
        if (accuracyPercent >= 70) {
          const globalLoader = document.getElementById("global-loading-overlay");
          if (globalLoader) {
            globalLoader.classList.remove("hidden");
            globalLoader.classList.add("active");
          }

          await recordSessionProgress(currentSelectedDay, currentSelectedSession);

          if (globalLoader) {
            globalLoader.classList.remove("active");
            globalLoader.classList.add("hidden");
          }
        }

        // 정답률 기반 완료 화면 렌더링 (메시지 분기 및 버튼 제어)
        renderCompletionScreen();
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
      // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
      const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
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

      // 학습 인덱스 및 정답률 카운터 리셋
      resetAccuracyTracker();
      currentWordIndex = 0;

      completionSection.classList.add("hidden");
      completionSection.classList.remove("active");
      studySection.classList.remove("hidden");
      studySection.classList.add("active");

      renderCurrentWord();
    };
  }

  // [Comment Policy: 비활동 및 앱 종료 감지를 위한 시간 기반 세션 만료 시스템]
  // 모바일 브라우저의 백그라운드 탭 복원(세션스토리지 유지) 특성을 우회하기 위해,
  // 60분(60 * 60 * 1000 ms) 동안 아무런 활동이 없거나 앱 종료 후 60분이 지난 경우 세션을 만료시킵니다.
  const SESSION_TIMEOUT_MS = 60 * 60 * 1000;

  function checkSessionTimeout() {
    const user = sessionStorage.getItem("active_user");
    if (!user) return;

    const lastActive = localStorage.getItem("session_last_active");
    const now = Date.now();

    if (lastActive && (now - parseInt(lastActive, 10) > SESSION_TIMEOUT_MS)) {
      // 세션 만료 시 데이터 삭제 후 화면 갱신으로 로그인 상태 해제 유도
      sessionStorage.removeItem("active_user");
      localStorage.removeItem("session_last_active");
      window.location.reload();
    } else {
      localStorage.setItem("session_last_active", now.toString());
    }
  }

  // 활동 시간 갱신 헬퍼
  function updateActiveTime() {
    if (sessionStorage.getItem("active_user")) {
      localStorage.setItem("session_last_active", Date.now().toString());
    }
  }

  // 공부하는 도중 비활동 만료되는 문제를 예방하기 위해 화면이 켜져 있는 동안 15초 간격으로 시간 갱신
  setInterval(() => {
    if (document.visibilityState === "visible") {
      updateActiveTime();
    }
  }, 15000);

  // 사용자 터치, 클릭, 스크롤, 키다운 등의 이벤트 시 즉시 갱신
  ["click", "touchstart", "keydown", "scroll"].forEach(event => {
    document.addEventListener(event, updateActiveTime, { passive: true });
  });

  // 백그라운드에서 다시 웹 화면으로 복귀 시 만료 여부 판정
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkSessionTimeout();
    }
  });

  // 1. 초기 실행 시 세션 만료 체크
  checkSessionTimeout();

  // 2. [Comment Policy: 자동 로그인 세션 복구 및 학번 복원 자동완성]
  // [Comment Policy: active_user 보관소를 sessionStorage로 변경]
  const activeUser = JSON.parse(sessionStorage.getItem("active_user"));
  const lastLoggedInId = sessionStorage.getItem("last_logged_in_id");

  if (activeUser) {
    showWelcomeScreen(activeUser);
  } else if (lastLoggedInId && studentIdInput) {
    studentIdInput.value = lastLoggedInId;
  }
});
