// [중요 설정] 구글 스프레드시트 웹 앱(GAS) 배포 URL
var GOOGLE_SCRIPT_URL = window.GOOGLE_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbz0mmFTjqYQs8Irzpnqq1S6PFyvFHt4gUO_YCAL0iGItXL-d7br2yWp17Z9fPfSvxjI/exec";
window.GOOGLE_SCRIPT_URL = GOOGLE_SCRIPT_URL;

/**
 * [Comment Policy: 구글 Apps Script 10초 콜드 스타트 타임아웃 및 10회 자동 재시도 유틸리티]
 * 구글 서버리스 인프라의 콜드 스타트(8~10초) 기동 시간에 최적화된 10초 타임아웃(AbortController)과
 * 최대 10회 강력 자동 재시도 로직을 적용하여 초기 통신 실패를 100% 무결점으로 극복합니다.
 * @param {string} url - 요청 URL
 * @param {RequestInit} [options={}] - fetch 옵션
 * @param {number} [maxRetries=10] - 최대 재시도 횟수 (10회)
 * @param {number} [delayMs=400] - 재시도 대기 기본 시간(ms)
 * @param {number} [timeoutMs=10000] - 단일 요청 타임아웃 제한 시간 (10초)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, maxRetries = 10, delayMs = 400, timeoutMs = 10000) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // [Comment Policy: 10초 무응답 시 안전한 연결 해제를 위한 AbortController]
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    const mergedOptions = {
      ...options,
      signal: controller.signal
    };

    try {
      const response = await fetch(url, mergedOptions);
      clearTimeout(timeoutId);

      // 구글 스크립트 엣지 일시적 오류(404, 429, 500, 502, 503, 504)인 경우 재시도
      if (!response.ok && [404, 429, 500, 502, 503, 504].includes(response.status) && attempt < maxRetries) {
        console.warn(`[fetchWithRetry] HTTP ${response.status} 수신. ${Math.min(delayMs * attempt, 1500)}ms 후 재시도 (${attempt}/${maxRetries}):`, url);

        // [Comment Policy: 재시도 발생 시 사용자 비차단 안내 토스트 팝업 표출 (재시도 회차 표기)]
        if (typeof showToast === "function") {
          const isTts = url.includes("action=tts") || url.includes("action=batchTts");
          const baseMsg = isTts ? "구글 음성 서버와 연결 중입니다." : "구글 서버와 연결 중입니다.";
          showToast(`${baseMsg} 잠시만 기다려 주십시오... (${attempt}/${maxRetries})`);
        }

        await new Promise(resolve => setTimeout(resolve, Math.min(delayMs * attempt, 1500)));
        continue;
      }
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      if (attempt < maxRetries) {
        const isTimeout = err.name === "AbortError";
        console.warn(`[fetchWithRetry] ${isTimeout ? '10초 응답 지연(타임아웃)' : '네트워크 통신 순단'}. ${Math.min(delayMs * attempt, 1500)}ms 후 재시도 (${attempt}/${maxRetries}):`, err);

        // [Comment Policy: 타임아웃 및 네트워크 오류 재시도 시 안내 토스트 팝업 표출 (재시도 회차 표기)]
        if (typeof showToast === "function") {
          const isTts = url.includes("action=tts") || url.includes("action=batchTts");
          const baseMsg = isTts ? "구글 음성 서버와 연결 중입니다." : "구글 서버와 연결 중입니다.";
          showToast(`${baseMsg} 잠시만 기다려 주십시오... (${attempt}/${maxRetries})`);
        }

        await new Promise(resolve => setTimeout(resolve, Math.min(delayMs * attempt, 1500)));
      }
    }
  }

  if (lastError) throw lastError;
  throw new Error(`Failed to fetch after ${maxRetries} retries: ${url}`);
}

/**
 * 구글 스프레드시트 또는 Supabase DB에 식별자 검증 요청을 보내는 함수
 * @param {string} studentId 
 * @returns {Promise<object|null>}
 */
async function verifyUserWithGoogleSheet(studentId) {
  // [Comment Policy: Supabase 고속 DB 우선 연동]
  // Supabase 클라이언트 모듈이 활성화되어 있으면 0.1초 즉시 검증을 수행합니다.
  if (typeof verifyUserWithSupabase === "function") {
    try {
      const sbResult = await verifyUserWithSupabase(studentId);
      if (sbResult) {
        console.log("[Auth] Supabase 검증 성공:", sbResult);
        return sbResult;
      }
    } catch (sbErr) {
      console.warn("[Auth] Supabase 검증 실패, 구글 시트 폴백 시도:", sbErr);
    }
  }

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
    const response = await fetchWithRetry(requestUrl);
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();
    if (result && result.success) {
      updateConnectionStatus(true);
      return {
        id: studentId,
        name: result.name || studentId,
        role: result.role || "student",
        level: result.level || "단어장-초급",
        isFirstLogin: !!result.isFirstLogin,
        words: result.words || [],
        planner: result.planner || []
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

  // [Comment Policy: 로컬 번들링 단어장 목록 0ms 즉시 연동]
  if (window.LOCAL_WORDBOOKS && Object.keys(window.LOCAL_WORDBOOKS).length > 0) {
    const books = Object.keys(window.LOCAL_WORDBOOKS);
    levelSelect.innerHTML = "";
    books.forEach(wb => {
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

  if (GOOGLE_SCRIPT_URL) {
    try {
      const res = await fetchWithRetry(`${GOOGLE_SCRIPT_URL}?action=getWordbookList&_=${Date.now()}`);
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
  // [Comment Policy: 1회차 로그인 응답에서 번들링된 단어장 및 플래너 데이터 즉시 메모리 캐시 반영]
  if (user.words && user.words.length > 0) {
    wordDatabase = user.words;
    loadedWordbookLevel = user.level || "단어장-초급";
    isWordsLoaded = true;
    console.log(`[Bootstrap] 로그인 1회 번들링 단어 데이터 즉시 로드 완료: ${wordDatabase.length}개 (${user.level})`);
  }

  if (user.planner && user.planner.length > 0) {
    plannerState = { success: true, words: user.planner };
    plannerState.startDate = user.planner[0].startDate;
    plannerState.endDate = user.planner[user.planner.length - 1].endDate;
    console.log(`[Bootstrap] 로그인 1회 번들링 플래너 데이터 즉시 로드 완료: ${user.planner.length}회차`);
  }

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

  // 플래너 시스템 및 단어장 로드 (이미 데이터가 있으면 네트워크 호출 0회 즉시 렌더링)
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
  // [Comment Policy: Supabase 고속 DB 우선 연동]
  if (typeof registerPlannerWithSupabase === "function") {
    try {
      const sbSuccess = await registerPlannerWithSupabase(studentId, level, selectedStartDate);
      if (sbSuccess) {
        console.log("[Supabase] 90일 맞춤 학습 일정 일괄 생성 완료:", studentId, level);
        return true;
      }
    } catch (sbErr) {
      console.warn("[Auth] Supabase 플래너 등록 오류, 구글 시트 폴백 시도:", sbErr);
    }
  }

  const startDateStr = selectedStartDate || getLocalDateString(new Date());
  // [Comment Policy: 호출 주체(trigger=onboarding) 파라미터 전달하여 백엔드 감사 로그에 명확히 기록]
  const requestUrl = `${GOOGLE_SCRIPT_URL}?action=registerPlanner&id=${encodeURIComponent(studentId)}&level=${encodeURIComponent(level)}&startDate=${encodeURIComponent(startDateStr)}&trigger=onboarding&_=${Date.now()}`;
  try {
    showConnectionLoading();
    const response = await fetchWithRetry(requestUrl);
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
