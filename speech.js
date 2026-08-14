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
 * [Comment Policy: 구글 온라인 고품질 음성 재생 함수 (로컬 저품질 TTS 미사용)]
 * 사용자 요청에 따라 저품질 로컬 SpeechSynthesis 폴백을 완전히 배제하고,
 * 오직 구글 온라인 발음 스트리밍(MP3)만을 사용하여 일관성 있는 고품질 발음을 전달합니다.
 */
function speakWord(wordText) {
  resetSpeechSynthesis(); // 진행 중인 소리 리셋
  if (!wordText) return;

  // [Comment Policy: 구글 TTS 클라이언트 속성 변경]
  // client를 tw-ob 대신 더 범용적이고 호환성이 높은 gtx로 변경하여 외부 사이트 스트리밍 시 CORS 유실을 완화합니다.
  const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=gtx&q=${encodeURIComponent(wordText)}`;
  activeAudio = new Audio(googleUrl);

  setSpeakButtonActive(false); // 재생 연타 방지 락 기동

  // 정상 재생 종료 시 락 해제
  activeAudio.onended = () => {
    setSpeakButtonActive(true);
  };

  // 구글 오디오 스트리밍 실패 시, 저품질 폴백을 태우지 않고 락만 해제합니다.
  activeAudio.onerror = () => {
    console.warn("[TTS] 구글 오디오 스트리밍에 실패하여 재생을 중단합니다. (로컬 TTS 폴백 적용 안 됨)");
    setSpeakButtonActive(true);
  };

  activeAudio.play().catch(err => {
    console.warn("[TTS] 구글 오디오 자동 재생이 차단되었거나 실패했습니다.", err);
    setSpeakButtonActive(true);
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
 * 단어 표기에서 부수적인 고유번호 및 불필요한 문장 부호 정제
 * 예: "-가13" -> "가", "가난01" -> "가난"
 * @param {string} rawWord 
 * @returns {string}
 */
function cleanWord(rawWord) {
  if (!rawWord) return "";
  return rawWord.replace(/^-/, '').replace(/[0-9]+$/, '').trim();
}
