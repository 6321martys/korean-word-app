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

/**
 * [Comment Policy: 스피커 버튼 재생 상태 활성/비활성화 제어 헬퍼]
 * 음성 재생 도중 사용자의 연속 연타(음원 섞임)를 방지하기 위해
 * 재생 진행 동안 스피커 버튼을 비활성화하고 차단 마우스 커서를 표현합니다.
 */
function setSpeakButtonActive(isActive) {
  const btnSpeak = document.getElementById("btn-speak");
  if (!btnSpeak) return;
  if (isActive) {
    btnSpeak.disabled = false;
    btnSpeak.style.opacity = "1";
    btnSpeak.style.cursor = "pointer";
    btnSpeak.style.pointerEvents = "auto";
  } else {
    btnSpeak.disabled = true;
    btnSpeak.style.opacity = "0.4";
    btnSpeak.style.cursor = "not-allowed";
    btnSpeak.style.pointerEvents = "none";
  }
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
  setSpeakButtonActive(true); // 버튼 재생 락 해제
  const btnSpeak = document.getElementById("btn-speak");
  if (btnSpeak) {
    btnSpeak.classList.remove("fallback-active");
  }
}

/**
 * [Comment Policy: 구글 고품질 TTS 음성 재생 함수]
 * 프리로드 캐시에 저장된 고품질 구글 오디오를 즉시 재생하며,
 * 캐시가 없을 경우 Apps Script 백엔드 프록시를 호출하여 실시간으로 받아와 재생합니다.
 * @param {string} wordText - 재생할 단어 문자열
 */
async function speakWord(wordText) {
  resetSpeechSynthesis(); // 진행 중인 소리 리셋
  if (!wordText) return;

  const cleanedText = cleanWord(wordText);
  if (!cleanedText) return;

  // 1. 프리로드 캐시에 이미 오디오가 준비되어 있는 경우 (지연 시간 0초 즉시 재생)
  if (preloadedAudioCache[cleanedText]) {
    try {
      const audio = preloadedAudioCache[cleanedText];
      activeAudio = audio;
      activeAudio.currentTime = 0;
      setSpeakButtonActive(false); // 연타 방지 락

      activeAudio.onended = () => {
        setSpeakButtonActive(true);
        activeAudio = null;
      };

      activeAudio.onerror = (err) => {
        console.warn("[TTS] 캐시 오디오 재생 실패:", err);
        setSpeakButtonActive(true);
        activeAudio = null;
        showToast("음성 재생 중 오류가 발생했습니다.");
      };

      await activeAudio.play();
      return;
    } catch (playErr) {
      console.warn("[TTS] 캐시 오디오 자동재생 예외:", playErr);
      setSpeakButtonActive(true);
      return;
    }
  }

  // 2. 캐시가 없는 단어의 경우, Apps Script 프록시 API(action=tts)를 비동기로 호출
  setSpeakButtonActive(false); // 로딩 중 버튼 락
  if (typeof showConnectionLoading === "function") showConnectionLoading();

  try {
    const url = `${TTS_SCRIPT_URL}?action=tts&q=${encodeURIComponent(cleanedText)}`;
    const response = await fetch(url);
    const result = await response.json();

    if (result && result.success && result.audio) {
      const audio = new Audio(result.audio);
      preloadedAudioCache[cleanedText] = audio; // 향후 재사용을 위해 캐싱
      activeAudio = audio;
      
      activeAudio.onended = () => {
        setSpeakButtonActive(true);
        activeAudio = null;
      };

      activeAudio.onerror = () => {
        setSpeakButtonActive(true);
        activeAudio = null;
        showToast("음성 재생에 실패했습니다.");
      };

      await activeAudio.play();
    } else {
      console.warn("[TTS] 백엔드 음원 수신 실패:", result);
      setSpeakButtonActive(true);
      showToast("구글 음성 서버와 연결에 실패했습니다.");
    }
  } catch (netErr) {
    console.error("[TTS] 음성 API 통신 에러:", netErr);
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
    const response = await fetch(url);
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
