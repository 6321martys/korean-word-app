/**
 * [Comment Policy: 하이브리드 TTS 및 재생 제어 모듈 (speech.js)]
 * 구글 온라인 번역 오디오(1순위) 및 HTML5 내장 SpeechSynthesis(2순위 폴백)를
 * 사용해 단어 발음을 1회 낭독하며, 연타 락(Lock)과 시각 피드백을 관리합니다.
 */

// [Comment Policy: TTS 발음 반복 지연 및 구글 오디오 제어용 전역 상태]
let speechTimeoutIds = [];     // 자동 반복용 clearTimeout 대기 큐
let activeAudio = null;        // 현재 재생 중인 구글 TTS 폴백 오디오 객체
// [Comment Policy: 10단어 오디오 객체 프리로드 캐시 전역 저장소]
let preloadedAudioCache = {};   // 단어 텍스트 -> Audio 객체 매핑

/**
 * [Comment Policy: 스피커 버튼 재생 상태 활성/비활성화 제어 헬퍼]
 * 음성 재생 도중 사용자의 연속 연타(음원 섞임)를 원천 차단하기 위해
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
 * 가동 중이거나 로딩 중인 구글 TTS 오디오 객체 재생을 정지하고, 
 * 백업용 SpeechSynthesis의 가동을 완전히 차단합니다.
 * 또한 재생 방지 락을 강제 해제하고 경고 클래스를 소거합니다.
 */
function resetSpeechSynthesis() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if (speechTimeoutIds && speechTimeoutIds.length > 0) {
    speechTimeoutIds.forEach(id => clearTimeout(id));
    speechTimeoutIds = [];
  }
  setSpeakButtonActive(true); // 버튼 재생 락 해제
  const btnSpeak = document.getElementById("btn-speak");
  if (btnSpeak) {
    btnSpeak.classList.remove("fallback-active"); // 붉은색 경고 점멸 소거
  }
}

/**
 * [Comment Policy: 구글 온라인 고품질 음성 재생 함수 (로컬 저품질 TTS 미사용)]
 * 사용자 요청에 따라 저품질 로컬 SpeechSynthesis 폴백을 완전히 배제하고,
 * 오직 구글 온라인 발음 스트리밍(MP3)만을 사용하여 일관성 있는 고품질 발음을 전달합니다.
 */
function speakWord(wordText) {
  resetSpeechSynthesis(); // 진행 중인 소리 리셋
  if (!wordText) return;

  const cleanedText = cleanWord(wordText);
  const cachedAudio = preloadedAudioCache[cleanedText];

  if (cachedAudio) {
    console.log("[TTS] 프리로드 캐시된 오디오를 재생합니다:", cleanedText);
    activeAudio = cachedAudio;
    // 재생 위치를 처음으로 초기화
    activeAudio.currentTime = 0;
  } else {
    console.log("[TTS] 프리로드 캐시가 없어 신규 오디오를 호출합니다:", cleanedText);
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=gtx&q=${encodeURIComponent(cleanedText)}`;
    activeAudio = new Audio(googleUrl);
  }

  setSpeakButtonActive(false); // 재생 연타 방지 락 기동

  // 정상 재생 종료 시 락 해제
  activeAudio.onended = () => {
    setSpeakButtonActive(true);
  };

  // 구글 오디오 스트리밍 실패 시, 저품질 폴백을 태우지 않고 락만 해제하며 오류 토스트를 3초간 출력합니다.
  activeAudio.onerror = () => {
    console.warn("[TTS] 구글 오디오 스트리밍에 실패하여 재생을 중단합니다. (로컬 TTS 폴백 적용 안 됨)");
    setSpeakButtonActive(true);
    showToast("구글 음성 서버와 연결에 문제가 발생했습니다.");
  };

  activeAudio.play().catch(err => {
    console.warn("[TTS] 구글 오디오 자동 재생이 차단되었거나 실패했습니다.", err);
    setSpeakButtonActive(true);
    // 브라우저 기본 정책인 Autoplay 차단(NotAllowedError)인 경우 안내창을 띄우지 않고, 그 외의 실제 연결/로딩 에러일 때만 노출합니다.
    if (err && err.name !== "NotAllowedError") {
      showToast("구글 음성 서버와 연결에 문제가 발생했습니다.");
    }
  });
}

/**
 * [Comment Policy: 단어 1회 단독 즉시 재생 함수]
 * 스피커 아이콘(🔊) 수동 클릭 시 구글 TTS를 우선하여 즉시 1회 낭독을 지시합니다.
 */
function speakWordOnce(wordText) {
  speakWord(wordText);
}

/**
 * [Comment Policy: 학습 세션 시작 시 10단어 음성 일괄 백그라운드 프리로드]
 * 단어 학습 시작 시점(달력 클릭)에 배정된 10개 단어의 구글 TTS 음성 파일(MP3)을 
 * 브라우저 백그라운드에 미리 버퍼링(Preload)받아두고 재생할 때 캐시에서 꺼내 씁니다.
 * @param {Array<object>} words 
 */
function preloadSessionAudios(words) {
  // 이전 캐시 강제 소거 및 초기화 (가비지 컬렉터 유도)
  preloadedAudioCache = {};
  if (!words || words.length === 0) return;

  words.forEach(item => {
    const cleaned = cleanWord(item.word);
    if (!cleaned) return;

    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=gtx&q=${encodeURIComponent(cleaned)}`;
    
    const audio = new Audio();
    audio.src = googleUrl;
    audio.preload = "auto";
    
    // 오디오 리소스 오류 발생 시 락 오동작을 미연에 방지하기 위해 로딩 에러 리스너 추가
    audio.onerror = () => {
      console.warn(`[TTS Preload] 단어 프리로드 로딩 실패: ${cleaned}`);
    };

    // 백그라운드 로드 명령을 강제 기동하여 버퍼링 진행
    audio.load();

    preloadedAudioCache[cleaned] = audio;
  });
  console.log(`[TTS] 총 ${Object.keys(preloadedAudioCache).length}개 단어의 고품질 음성 백그라운드 프리로드 완료.`);
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
 * [Comment Policy: 구글 음성 서버 장애 및 네트워크 오류 안내 토스트 팝업]
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
