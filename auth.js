/**
 * [Comment Policy: 사용자 식별 및 로그인 인증 모듈 (auth.js)]
 * 학생/선생님 계정 정보 매칭 및 최초 로그인 시 학습시작일/단어장 온보딩 선택 카드 분기를 통제합니다.
 * 구글 스프레드시트 단일 소스 원칙을 엄격히 준수합니다.
 */

/**
 * 구글 스프레드시트에 식별자 검증 요청을 보내는 함수
 * @param {string} studentId 
 * @returns {Promise<object|null>}
 */
async function verifyUserWithGoogleSheet(studentId) {
  // [Comment Policy: 클라이언트 현지 날짜 파라미터 전달]
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;

  // 캐시 방지를 위한 타임스탬프 파라미터 포함하여 요청 전송
  const requestUrl = `${GOOGLE_SCRIPT_URL}?id=${encodeURIComponent(studentId)}&clientDate=${localDateStr}&_=${Date.now()}`;

  try {
    showConnectionLoading();
    const response = await fetch(requestUrl);
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();
    if (result && result.success) {
      updateConnectionStatus(true);
      return {
        name: result.name || studentId,
        role: result.role || "student",
        level: result.level || "단어장-초급",
        isFirstLogin: !!result.isFirstLogin
      };
    }
  } catch (error) {
    updateConnectionStatus(false);
    throw error;
  } finally {
    hideConnectionLoading();
  }
  return null;
}

/**
 * [신규] 구글 스프레드시트에서 유효한 단어장 탭 목록을 비동기 조회하여 온보딩 드롭다운을 갱신합니다.
 * @param {string} defaultLevel 
 */
async function populateWordbookOptions(defaultLevel) {
  const levelSelect = document.getElementById("onboarding-level-select");
  if (!levelSelect) return;

  if (GOOGLE_SCRIPT_URL) {
    try {
      const res = await fetch(`${GOOGLE_SCRIPT_URL}?action=getWordbookList&_=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.wordbooks) && data.wordbooks.length > 0) {
          levelSelect.innerHTML = "";
          data.wordbooks.forEach(wb => {
            const opt = document.createElement("option");
            opt.value = wb;
            opt.textContent = wb;
            if (wb === defaultLevel) {
              opt.selected = true;
            }
            levelSelect.appendChild(opt);
          });
          return;
        }
      }
    } catch (err) {
      console.warn("단어장 목록 동적 조회 실패. 기본 옵션 유지:", err);
    }
  }

  // 폴백: 기본값 선택
  if (defaultLevel) {
    levelSelect.value = defaultLevel;
  }
}

/**
 * 로그인 성공 시 화면을 환영 페이지로 전환하는 함수
 * [개편] 최초 로그인 학생의 경우 '학습시작일 및 단어장 설정' 온보딩 카드로 먼저 진입합니다.
 * @param {object} user 
 */
async function showWelcomeScreen(user) {
  // [Comment Policy: 선생님 역할 로그인 세션 분기]
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

  // [Comment Policy: 최초 로그인 시 '학습시작일 및 단어장 설정' 전용 온보딩 카드 활성화]
  if (user.isFirstLogin) {
    loginSection.classList.add("hidden");
    loginSection.classList.remove("active");

    const startDateSection = document.getElementById("start-date-section");
    if (startDateSection) {
      startDateSection.classList.remove("hidden");
      startDateSection.classList.add("active");

      // 시작일 선택 달력 초기화
      initStartDatePicker();

      // [신규] 구글 시트의 단어장 목록 동적 로드 및 기본 레벨 선택
      populateWordbookOptions(user.level || "단어장-초급");

      // 시작일 및 단어장 확정 버튼 바인딩
      const btnConfirmStart = document.getElementById("btn-confirm-start-date");
      if (btnConfirmStart) {
        btnConfirmStart.onclick = async () => {
          btnConfirmStart.disabled = true;

          // 드롭다운에서 선택된 단어장(레벨) 읽기
          const levelSelect = document.getElementById("onboarding-level-select");
          const chosenLevel = (levelSelect && levelSelect.value) ? levelSelect.value : (user.level || "단어장-초급");

          const overlay = document.getElementById("bulk-register-overlay");
          if (overlay) {
            overlay.classList.remove("hidden");
            overlay.classList.add("active");
          }

          // 선택된 시작일(onboardingSelectedDate) 및 단어장(chosenLevel) 기준으로 90일 벌크 생성
          const registerSuccess = await registerPlannerWithGoogleSheet(user.id, chosenLevel, onboardingSelectedDate);

          if (overlay) {
            overlay.classList.remove("active");
            overlay.classList.add("hidden");
          }

          btnConfirmStart.disabled = false;

          if (!registerSuccess) {
            showError("학습 일정을 생성하지 못했습니다. 관리자에게 문의해 주세요.");
            return;
          }

          // 온보딩 완료 처리 및 선택된 레벨 반영
          user.level = chosenLevel;
          user.isFirstLogin = false;
          sessionStorage.setItem("active_user", JSON.stringify(user));

          // [Comment Policy: 온보딩에서 선택한 단어장 레벨로 단어 데이터 강제 리셋 및 재로드 준비]
          if (typeof isWordsLoaded !== "undefined") isWordsLoaded = false;
          if (typeof loadedWordbookLevel !== "undefined") loadedWordbookLevel = "";
          if (typeof wordDatabase !== "undefined") wordDatabase = [];

          // 시작일 카드 숨김 후 메인 웰컴 화면 진입
          startDateSection.classList.remove("active");
          startDateSection.classList.add("hidden");
          enterMainWelcomeScreen(user);
        };
      }
    }
    return;
  }

  // 기존 학생: 바로 메인 웰컴 화면 진입
  enterMainWelcomeScreen(user);
}

/**
 * 메인 웰컴 및 달력 대시보드 진입 헬퍼 함수
 * @param {object} user 
 */
function enterMainWelcomeScreen(user) {
  // 로그인한 학생의 이름 바인딩
  if (userDisplayId1) userDisplayId1.textContent = user.name;
  if (userDisplayId2) userDisplayId2.textContent = user.name;

  // 준비물 체크박스 초기화
  const chkNotebook = document.getElementById("chk-notebook");
  const chkPen = document.getElementById("chk-pen");
  if (chkNotebook) chkNotebook.checked = false;
  if (chkPen) chkPen.checked = false;

  // 배지 설정
  userRoleBadge.className = "user-type-badge";
  userRoleBadge.textContent = "학생";
  userRoleBadge.classList.add("student");

  // 플래너 시스템 및 단어장 로드
  initPlannerSystem(user.id);

  // 섹션 전환
  loginSection.classList.add("hidden");
  loginSection.classList.remove("active");
  welcomeSection.classList.add("active");
  welcomeSection.classList.remove("hidden");
}

/**
 * 최초 로그인 시 구글 시트에 90일 학습 일정을 벌크 생성하도록 백엔드에 요청합니다.
 * @param {string} studentId 
 * @param {string} level 
 * @param {string} selectedStartDate (YYYY-MM-DD)
 * @returns {Promise<boolean>}
 */
async function registerPlannerWithGoogleSheet(studentId, level, selectedStartDate) {
  const startDateStr = selectedStartDate || getLocalDateString(new Date());
  const requestUrl = `${GOOGLE_SCRIPT_URL}?action=registerPlanner&id=${encodeURIComponent(studentId)}&level=${encodeURIComponent(level)}&startDate=${encodeURIComponent(startDateStr)}&_=${Date.now()}`;
  try {
    showConnectionLoading();
    const response = await fetch(requestUrl);
    if (!response.ok) throw new Error("Network response not ok");
    const result = await response.json();
    console.log("[Google Sheets] registerPlanner API 응답 데이터:", result);
    return !!(result && result.success);
  } catch (error) {
    console.error("일괄 등록 요청 오류:", error);
    return false;
  } finally {
    hideConnectionLoading();
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
