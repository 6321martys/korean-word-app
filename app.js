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

// [신규] 모국어 선택 드롭다운 요소 캐싱
const languageSelect = document.getElementById("language-select");

/**
 * 페이지 초기화 시 자동 로그인 세션 복구 처리
 */
document.addEventListener("DOMContentLoaded", () => {
  const savedUser = JSON.parse(localStorage.getItem("active_user"));
  if (savedUser) {
    showWelcomeScreen(savedUser);
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

  // 화면 섹션 토글
  welcomeSection.classList.add("hidden");
  welcomeSection.classList.remove("active");
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

  const response = await fetch(requestUrl);
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  const result = await response.json();
  if (result && result.success) {
    return {
      name: result.name || studentId,
      role: result.role || "student"
    };
  }
  return null;
}

/**
 * 로그인 성공 시 화면을 환영 페이지로 전환하는 함수
 * @param {object} user 
 */
function showWelcomeScreen(user) {
  userDisplayId.textContent = user.name;

  // 선택한 모국어를 한글 이름으로 렌더링
  const userDisplayLang = document.getElementById("user-display-lang");
  if (userDisplayLang) {
    userDisplayLang.textContent = getLanguageName(user.lang);
  }

  // 유저 권한에 따라 웰컴 배지 스타일링 분기 처리
  userRoleBadge.className = "user-type-badge"; // 클래스 리셋
  if (user.role === "teacher") {
    userRoleBadge.textContent = "선생님 (관리자)";
    userRoleBadge.classList.add("teacher");
  } else {
    userRoleBadge.textContent = "학생";
    userRoleBadge.classList.add("student");
  }

  // 섹션 전환 애니메이션 클래스 토글
  loginSection.classList.add("hidden");
  loginSection.classList.remove("active");
  welcomeSection.classList.add("active");
  welcomeSection.classList.remove("hidden");
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
