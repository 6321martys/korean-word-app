/**
 * [Comment Policy: 사용자 식별 및 로그인 인증 모듈 (auth.js)]
 * 학생/선생님 계정 정보 매칭 및 구글 스프레드시트 서버와의 API를 통한 90일 최초 일정 생성을 통제합니다.
 */

/**
 * 구글 스프레드시트에 식별자 검증 요청을 보내는 함수 (JSONP 또는 CORS 처리 대응)
 * @param {string} studentId 
 * @returns {Promise<object|null>}
 */
async function verifyUserWithGoogleSheet(studentId) {
  // 캐시 방지를 위한 타임스탬프 파라미터 포함하여 요청 전송
  const requestUrl = `${GOOGLE_SCRIPT_URL}?id=${encodeURIComponent(studentId)}&_=${Date.now()}`;

  try {
    showConnectionLoading(); // 구글 서버 통신 중 뱃지 로딩 시작
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
  } finally {
    hideConnectionLoading(); // 통신 완료 후 로딩 해제
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

  // [Comment Policy: 로그인한 학생의 이름 다중 바인딩 처리]
  // 신규 가이드 메시지 템플릿에 맞추어 두 군데의 이름 영역에 사용자의 이름을 동일하게 주입합니다.
  if (userDisplayId1) userDisplayId1.textContent = user.name;
  if (userDisplayId2) userDisplayId2.textContent = user.name;

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
