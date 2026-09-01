/**
 * [Comment Policy: 구글 백엔드 프록시 기반 고품질 TTS 음성 재생 모듈 (speech.js)]
 * 브라우저의 CORS 및 ORB(Opaque Response Blocking) 차단을 완벽히 우회하기 위해
 * 구글 Apps Script 백엔드를 통해 구글 번역 고품질 오디오(MP3 Base64)를 받아와 재생합니다.
 * 10단어 일괄 프리로드 캐싱을 통해 재생 지연(0초) 및 연타 락을 안전하게 관리합니다.
 */

// 구글 Apps Script 백엔드 URL (app.js에 정의된 전역 변수를 우선 사용하며, 폴백 URL 제공)
const TTS_SCRIPT_URL = typeof GOOGLE_SCRIPT_URL !== "undefined" 
  ? GOOGLE_SCRIPT_URL 
  : "https://script.google.com/macros/s/AKfycbz0mmFTjqYQs8Irzpnqq1S6PFyvFHt4gUO_YCAL0iGItXL-d7br2yWp17Z9fPfSvxjI/exec";

// [Comment Policy: 재생 상태 및 오디오 캐시 전역 저장소]
let activeAudio = null;             // 현재 재생 중인 Audio 객체 인스턴스
let preloadedAudioCache = {};        // 단어 텍스트 -> Audio 객체 매핑 메모리 캐시
let speechTimeoutIds = [];          // 타이머 관리 큐

let isAudioBusy = false;            // 음성 요청 및 재생 중 연타 방지 전역 락 플래그

/**
 * [Comment Policy: 모든 스피커 버튼 재생 상태 활성/비활성화 제어 헬퍼]
 * 음성 통신(fetchWithRetry) 또는 오디오 재생 진행 동안
 * 메인 단어 스피커(#btn-speak), 미니게임 스피커(#minigame4-speak-btn), 퀴즈 오디오 버튼(.quiz-audio-btn, .btn-speak) 등
 * 화면 상의 모든 스피커 버튼을 일괄 비활성화하고 차단 마우스 커서를 적용하여 연타를 원천 차단합니다.
 */
function setSpeakButtonActive(isActive) {
  const speakButtons = document.querySelectorAll("#btn-speak, #minigame4-speak-btn, .btn-speak, .quiz-audio-btn");
  speakButtons.forEach(btn => {
    if (isActive) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.style.pointerEvents = "auto";
    } else {
      btn.disabled = true;
      btn.style.opacity = "0.4";
      btn.style.cursor = "not-allowed";
      btn.style.pointerEvents = "none";
    }
  });
}

/**
 * [Comment Policy: 음성 낭독 초기화 및 리셋]
 * 재생 중인 모든 오디오를 즉시 정지하고 연타 방지 락을 초기 상태로 복구합니다.
 */
function resetSpeechSynthesis() {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch (e) {
      // 무시
    }
    activeAudio = null;
  }

  // Web Speech API 잔여 발화가 있을 경우 정지
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  if (speechTimeoutIds && speechTimeoutIds.length > 0) {
    speechTimeoutIds.forEach(id => clearTimeout(id));
    speechTimeoutIds = [];
  }

  isAudioBusy = false; // 락 해제
  setSpeakButtonActive(true); // 모든 스피커 버튼 활성화
  const speakButtons = document.querySelectorAll("#btn-speak, #minigame4-speak-btn, .btn-speak, .quiz-audio-btn");
  speakButtons.forEach(btn => btn.classList.remove("fallback-active"));
}

/**
 * [Comment Policy: 구글 고품질 TTS 음성 재생 함수]
 * 프리로드 캐시에 저장된 고품질 구글 오디오를 즉시 재생하며,
 * 캐시가 없을 경우 Apps Script 백엔드 프록시를 호출하여 실시간으로 받아와 재생합니다.
 * 재생 완료 또는 통신/타임아웃 로직이 완전히 끝날 때까지 모든 스피커 버튼을 완벽히 잠급니다.
 * @param {string} wordText - 재생할 단어 문자열
 */
async function speakWord(wordText) {
  // 이미 다른 음성 통신 또는 재생이 진행 중이면 추가 클릭 차단
  if (isAudioBusy) {
    console.warn("[TTS] 이미 음성 요청 또는 재생이 진행 중입니다. 연타가 차단되었습니다.");
    return;
  }

  if (!wordText) return;

  const cleanedText = cleanWord(wordText);
  if (!cleanedText) return;

  isAudioBusy = true; // 락 가동
  setSpeakButtonActive(false); // 모든 스피커 버튼 비활성화 (마우스 커서 차단)

  // 1. 프리로드 캐시에 이미 오디오가 준비되어 있는 경우 (지연 시간 0초 즉시 재생)
  if (preloadedAudioCache[cleanedText]) {
    try {
      const audio = preloadedAudioCache[cleanedText];
      activeAudio = audio;
      activeAudio.currentTime = 0;

      activeAudio.onended = () => {
        isAudioBusy = false;
        setSpeakButtonActive(true);
        activeAudio = null;
      };

      activeAudio.onerror = (err) => {
        console.warn("[TTS] 캐시 오디오 재생 실패:", err);
        isAudioBusy = false;
        setSpeakButtonActive(true);
        activeAudio = null;
        showToast("음성 재생 중 오류가 발생했습니다.");
      };

      await activeAudio.play();
      return;
    } catch (playErr) {
      console.warn("[TTS] 캐시 오디오 자동재생 예외:", playErr);
      isAudioBusy = false;
      setSpeakButtonActive(true);
      return;
    }
  }

  // 2. 캐시가 없는 단어의 경우, Apps Script 프록시 API(action=tts)를 비동기로 호출 (10회 재시도/타임아웃 끝날 때까지 락 유지)
  if (typeof showConnectionLoading === "function") showConnectionLoading();

  try {
    const url = `${TTS_SCRIPT_URL}?action=tts&q=${encodeURIComponent(cleanedText)}`;
    const fetchFn = typeof fetchWithRetry === "function" ? fetchWithRetry : fetch;
    const response = await fetchFn(url);
    const result = await response.json();

    if (result && result.success && result.audio) {
      const audio = new Audio(result.audio);
      preloadedAudioCache[cleanedText] = audio; // 향후 재사용을 위해 캐싱
      activeAudio = audio;
      
      activeAudio.onended = () => {
        isAudioBusy = false;
        setSpeakButtonActive(true);
        activeAudio = null;
      };

      activeAudio.onerror = () => {
        isAudioBusy = false;
        setSpeakButtonActive(true);
        activeAudio = null;
        showToast("음성 재생에 실패했습니다.");
      };

      await activeAudio.play();
    } else {
      console.warn("[TTS] 백엔드 음원 수신 실패:", result);
      isAudioBusy = false;
      setSpeakButtonActive(true);
      showToast("구글 음성 서버와 연결에 실패했습니다.");
    }
  } catch (netErr) {
    console.error("[TTS] 음성 API 통신 에러:", netErr);
    isAudioBusy = false;
    setSpeakButtonActive(true);
    showToast("음성 서버 연결 중 네트워크 오류가 발생했습니다.");
  } finally {
    if (typeof hideConnectionLoading === "function") hideConnectionLoading();
  }
}

/**
 * [Comment Policy: 단어 1회 단독 즉시 재생 함수]
 * 스피커 아이콘(🔊) 수동 클릭 또는 화면 진입 시 즉시 1회 고품질 발음을 호출합니다.
 * @param {string} wordText 
 */
function speakWordOnce(wordText) {
  speakWord(wordText);
}

/**
 * [Comment Policy: 학습 세션 시작 시 10단어 고품질 음성 일괄(Batch) 백그라운드 프리로드]
 * 단어 학습 세션 진입 시 10개 단어를 1회의 Apps Script 백엔드 호출(action=batchTts)로 전달하여
 * 모든 고품질 음원을 Base64로 일괄 수집 및 Audio 객체 캐시로 생성해 둡니다.
 * @param {Array<object>} words - 현재 학습 세션 단어 객체 배열
 */
async function preloadSessionAudios(words) {
  if (!words || words.length === 0) return;

  // 캐시에 아직 없는 단어들만 필터링
  const wordsToFetch = [];
  words.forEach(item => {
    const cleaned = cleanWord(item.word);
    if (cleaned && !preloadedAudioCache[cleaned]) {
      wordsToFetch.push(cleaned);
    }
  });

  if (wordsToFetch.length === 0) {
    console.log("[TTS] 세션 내 모든 단어의 고품질 음성이 이미 캐시되어 있습니다.");
    return;
  }

  // 통신 로딩 인디케이터 기동
  if (typeof showConnectionLoading === "function") showConnectionLoading();

  try {
    const wordsParam = encodeURIComponent(wordsToFetch.join(","));
    const url = `${TTS_SCRIPT_URL}?action=batchTts&words=${wordsParam}`;
    const fetchFn = typeof fetchWithRetry === "function" ? fetchWithRetry : fetch;
    const response = await fetchFn(url);
    const result = await response.json();

    if (result && result.success && result.audios) {
      Object.keys(result.audios).forEach(word => {
        const audioDataUrl = result.audios[word];
        const audio = new Audio(audioDataUrl);
        audio.preload = "auto";
        preloadedAudioCache[word] = audio;
      });
      console.log(`[TTS] 총 ${Object.keys(result.audios).length}개 단어의 고품질 구글 음성 일괄 프리로드 완료.`);
    }
  } catch (err) {
    console.warn("[TTS] 일괄 프리로드 중 오류 발생 (단일 재생 모드로 자동 전환):", err);
  } finally {
    if (typeof hideConnectionLoading === "function") hideConnectionLoading();
  }
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
 * [Comment Policy: 음성 오류 및 시스템 안내 토스트 팝업]
 * 사용자의 모바일 뷰 화면 정중앙에 3초 동안 경고 메시지를 노출하고 부드럽게 소거하는 팝업 시스템입니다.
 * 테마에 맞추어 premium 글래스모피즘(반투명 남색 바탕, 은은한 테두리, 블러 효과) 디자인으로 동적 드롭인 렌더링을 처리합니다.
 * @param {string} message 
 */
function showToast(message) {
  // 기존에 활성화된 경고창이 있다면 즉시 제거하여 팝업 겹침을 방지합니다.
  const existingToast = document.getElementById("tts-error-toast");
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement("div");
  toast.id = "tts-error-toast";
  toast.textContent = message;

  // 프리미엄 다크 글래스모피즘 디자인 레이아웃 속성을 자바스크립트로 명시적 바인딩 (화면 정중앙 배치)
  toast.style.position = "fixed";
  toast.style.top = "50%";
  toast.style.left = "50%";
  toast.style.transform = "translate(-50%, -50%) scale(0.9)";
  toast.style.background = "rgba(13, 20, 38, 0.88)"; // 카드 디자인과 통일성을 이루는 짙은 남색 반투명
  toast.style.border = "1.5px solid var(--color-border)";
  toast.style.color = "var(--color-text-primary)";
  toast.style.padding = "12px 24px";
  toast.style.borderRadius = "12px";
  toast.style.fontSize = "0.95rem";
  toast.style.fontWeight = "600";
  toast.style.boxShadow = "0 8px 30px rgba(0, 0, 0, 0.5)";
  toast.style.backdropFilter = "blur(8px)";
  toast.style.webkitBackdropFilter = "blur(8px)";
  toast.style.zIndex = "9999";
  toast.style.opacity = "0";
  toast.style.transition = "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
  toast.style.pointerEvents = "none";
  toast.style.textAlign = "center";
  toast.style.minWidth = "280px";

  document.body.appendChild(toast);

  // 강제 리플로우 유도하여 트랜지션 애니메이션 기동
  void toast.offsetWidth;
  toast.style.transform = "translate(-50%, -50%) scale(1)";
  toast.style.opacity = "1";

  // 3초간 메시지를 화면에 보여준 후 부드럽게 축소 및 페이드 아웃시키며 완전 소거합니다.
  setTimeout(() => {
    toast.style.transform = "translate(-50%, -50%) scale(0.95)";
    toast.style.opacity = "0";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}
window.showToast = showToast;
