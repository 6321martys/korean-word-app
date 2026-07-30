/**
 * [Comment Policy: 하이브리드 TTS 및 재생 제어 모듈 (speech.js)]
 * 구글 온라인 번역 오디오(1순위) 및 HTML5 내장 SpeechSynthesis(2순위 폴백)를
 * 사용해 단어 발음을 1회 낭독하며, 연타 락(Lock)과 시각 피드백을 관리합니다.
 */

// [Comment Policy: TTS 발음 반복 지연 및 구글 오디오 제어용 전역 상태]
let speechTimeoutIds = [];     // 자동 반복용 clearTimeout 대기 큐
let activeAudio = null;        // 현재 재생 중인 구글 TTS 폴백 오디오 객체

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
 * [Comment Policy: 하이브리드 발음 재생 함수 (구글 TTS 최우선)]
 * 일관성 있는 발음 전달을 위해 구글 온라인 발음(MP3)을 1순위로 1회 낭독하며, 
 * 오프라인 등의 오류로 로딩 실패 시 2순위 브라우저 내장 음성합성(SpeechSynthesis)으로 즉시 폴백(우회)합니다.
 */
function speakWord(wordText) {
  resetSpeechSynthesis(); // 진행 중인 소리 리셋
  if (!wordText) return;

  const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(wordText)}`;
  activeAudio = new Audio(googleUrl);

  setSpeakButtonActive(false); // 연타 방지 락 기동

  // 정상 재생 종료 시 락 해제
  activeAudio.onended = () => {
    setSpeakButtonActive(true);
  };

  activeAudio.onerror = () => {
    console.warn("[TTS] 구글 오디오 스트리밍 실패. 로컬 내장 SpeechSynthesis로 폴백 재생합니다.");
    speakNativeFallback(wordText);
  };

  activeAudio.play().catch(err => {
    console.warn("[TTS] 구글 오디오 자동 재생이 차단되었거나 실패했습니다. 로컬 TTS로 우회합니다.", err);
    speakNativeFallback(wordText);
  });
}

/**
 * [Comment Policy: 로컬 내장 SpeechSynthesis 음성 낭독 (2순위 폴백)]
 * 구글 온라인 오디오 재생이 유실되거나 실패 시 로컬 음성 합성 엔진으로 0.8배속 1회 재생합니다.
 * 이때 사용자에게 붉은색 깜빡임 피드백(fallback-active 클래스)을 결합 제공합니다.
 */
function speakNativeFallback(wordText) {
  const btnSpeak = document.getElementById("btn-speak");
  if (btnSpeak) {
    btnSpeak.classList.add("fallback-active"); // 빨간 경고색 점멸 클래스 주입
  }

  if (window.speechSynthesis) {
    const utterance = new SpeechSynthesisUtterance(wordText);
    utterance.lang = "ko-KR";
    utterance.rate = 0.8; // 천천히 따라 읽을 수 있게 0.8배속 지정

    utterance.onend = () => {
      setSpeakButtonActive(true); // 낭독 완료 후 락 해제
      if (btnSpeak) btnSpeak.classList.remove("fallback-active");
    };

    utterance.onerror = () => {
      setSpeakButtonActive(true);
      if (btnSpeak) btnSpeak.classList.remove("fallback-active");
    };

    window.speechSynthesis.speak(utterance);
  } else {
    // 음성 합성 마저 미지원 시 락 즉시 복구
    setSpeakButtonActive(true);
    if (btnSpeak) btnSpeak.classList.remove("fallback-active");
  }
}

/**
 * [Comment Policy: 단어 1회 단독 즉시 재생 함수]
 * 스피커 아이콘(🔊) 수동 클릭 시 구글 TTS를 우선하여 즉시 1회 낭독을 지시합니다.
 */
function speakWordOnce(wordText) {
  speakWord(wordText);
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
