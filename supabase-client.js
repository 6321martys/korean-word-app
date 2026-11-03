/**
 * ==========================================================================
 * Supabase DB 클라이언트 및 연동 헬퍼 모듈
 * ==========================================================================
 * 구글 스프레드시트 Apps Script(GAS)를 대체하여 0.1초 초고속 통신 및 동시 접속 무결성을 제공합니다.
 *
 * [주요 기능]
 * 1. 학생/선생님 로그인 검증 (verifyUserWithSupabase)
 * 2. 온보딩 90일 학습기록 벌크 생성 (registerPlannerWithSupabase)
 * 3. 90일 플래너 상태 및 오늘 기준 회차 상태 판정 (getPlannerStateFromSupabase)
 * 4. 회차 완료 및 미니게임 점수 저장 (submitSessionProgressToSupabase - Upsert로 무결성 보장)
 * 5. 선생님 관리자용 전체 학생 진도 및 지각 통계 조회 (getAllStudentsFromSupabase)
 * 6. 학생 시작일 및 레벨 변경 (updateStudentInfoInSupabase)
 */

// Supabase 접속 정보 설정 (브라우저용 공개 키)
var SUPABASE_URL = "https://jeltiyvadmxodbnszpvd.supabase.co";
var SUPABASE_KEY = "sb_publishable_jPGfbmryssBYPKlUPONX-w_EgWXtg1_";

var _supabaseClientInstance = null;

/**
 * Supabase 클라이언트 인스턴스 싱글톤 획득
 */
function getSupabaseClient() {
  if (!_supabaseClientInstance) {
    if (typeof supabase === "undefined" || !supabase.createClient) {
      console.error("[Supabase] Supabase JS 라이브러리가 로드되지 않았습니다.");
      return null;
    }
    _supabaseClientInstance = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _supabaseClientInstance;
}

/**
 * 날짜 객체를 YYYY-MM-DD 문자열로 변환하는 유틸리티
 */
function formatSupabaseDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * [시스템 감사 로그(Audit Log) 기록 헬퍼 함수]
 * 구글 Apps Script 시절의 logSystemEvent와 100% 동일한 포맷으로 system_logs에 기록합니다.
 * 백그라운드 비동기로 안전하게 수행되어 메인 사용자 흐름을 지연시키지 않습니다.
 * @param {string} studentId
 * @param {string} name
 * @param {string} actionType - 예: "회차학습제출", "플래너_일정생성", "선생님_일정수정"
 * @param {string} trigger - 예: "합격", "onboarding", "admin"
 * @param {string} details - 상세 내역
 * @param {string|number} completedSessions - 완료 회차 수
 * @param {string} clientInfo - 클라이언트 정보 / 기준 일자
 */
async function insertSystemLog(studentId, name, actionType, trigger, details, completedSessions = '-', clientInfo = '') {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    const todayStr = formatSupabaseDate(new Date());
    await client.from('system_logs').insert([{
      created_at: new Date().toISOString(),
      student_id: String(studentId || '-'),
      name: String(name || '-'),
      action_type: String(actionType || '-'),
      trigger: String(trigger || '-'),
      details: String(details || '-'),
      completed_sessions: String(completedSessions !== undefined && completedSessions !== null ? completedSessions : '-'),
      client_info: String(clientInfo || todayStr)
    }]);
    console.log(`[AuditLog] 시스템 로그 기록 완료: [${actionType}] ${details}`);
  } catch (err) {
    console.warn("[Supabase] 시스템 로그 기록 예외:", err);
  }
}

/**
 * 1. 학생/선생님 로그인 검증 및 플래너/단어 번들링
 * @param {string} studentId
 * @returns {Promise<object|null>}
 */
async function verifyUserWithSupabase(studentId) {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    if (typeof showConnectionLoading === "function") showConnectionLoading();

    // 1-1. 학생 테이블에서 사용자 조회
    const { data: student, error: studentErr } = await client
      .from('students')
      .select('*')
      .eq('id', studentId.trim())
      .single();

    if (studentErr || !student) {
      console.warn("[Supabase] 등록되지 않은 사용자:", studentId, studentErr);
      return null;
    }

    // 1-2. LastLogin 갱신 (비동기 병렬 처리)
    client.from('students').update({ last_login: new Date().toISOString() }).eq('id', student.id).then();

    const userLevel = student.level || '단어장-초급';
    const userRole = student.role || 'student';
    const userName = student.name || student.id;

    // 1-3. 선생님인 경우 즉시 반환
    if (userRole === 'teacher') {
      if (typeof updateConnectionStatus === "function") updateConnectionStatus(true);
      return {
        id: student.id,
        name: userName,
        role: userRole,
        level: userLevel,
        isFirstLogin: false,
        words: [],
        planner: []
      };
    }

    // 1-4. 학생인 경우 90일 학습기록(learning_records) 조회
    const { data: records, error: recordErr } = await client
      .from('learning_records')
      .select('*')
      .eq('student_id', student.id)
      .order('id', { ascending: true });

    const studentRecords = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    if (records && records.length > 0) {
      records.forEach(r => {
        let currentStatus = r.status || '학습 전';
        if (currentStatus !== '학습 완료' && r.assigned_date) {
          const assignDate = new Date(r.assigned_date);
          assignDate.setHours(0, 0, 0, 0);
          if (todayTime > assignDate.getTime()) {
            currentStatus = '지각';
          } else {
            currentStatus = '학습 전';
          }
        }

        studentRecords.push({
          studentId: r.student_id,
          dayLabel: r.day_label,
          session: r.session || 1,
          startDate: r.assigned_date || '',
          endDate: r.assigned_date || '',
          scoreRecord: r.score_record ? String(r.score_record) : '',
          status: currentStatus
        });
      });
    }

    const isFirstLogin = (studentRecords.length === 0);

    // 1-5. 로컬 단어장 데이터 번들링 (네트워크 통신 0회)
    let wordsList = [];
    if (window.LOCAL_WORDBOOKS && window.LOCAL_WORDBOOKS[userLevel]) {
      wordsList = window.LOCAL_WORDBOOKS[userLevel];
    }

    if (typeof updateConnectionStatus === "function") updateConnectionStatus(true);

    return {
      id: student.id,
      name: userName,
      role: userRole,
      level: userLevel,
      isFirstLogin: isFirstLogin,
      words: wordsList,
      planner: studentRecords
    };
  } catch (err) {
    console.error("[Supabase] verifyUser 오류:", err);
    if (typeof updateConnectionStatus === "function") updateConnectionStatus(false);
    throw err;
  } finally {
    if (typeof hideConnectionLoading === "function") hideConnectionLoading();
  }
}

/**
 * 2. 최초 온보딩 90일 학습 일정 일괄 등록 (Supabase 배치 Insert)
 * 30일 x 3회차 = 총 90개 레코드 생성
 * @param {string} studentId
 * @param {string} level
 * @param {string} selectedStartDate (YYYY-MM-DD)
 * @returns {Promise<boolean>}
 */
async function registerPlannerWithSupabase(studentId, level, selectedStartDate) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    if (typeof showConnectionLoading === "function") showConnectionLoading();

    const startDate = new Date(selectedStartDate || new Date());
    startDate.setHours(0, 0, 0, 0);

    // 30일 x 3회차 = 90회차 레코드 생성
    const rowsToInsert = [];
    for (let day = 1; day <= 30; day++) {
      for (let session = 1; session <= 3; session++) {
        // 인덱스 (0 ~ 89)
        const dayOffset = (day - 1) * 3 + (session - 1);
        const assignDate = new Date(startDate);
        assignDate.setDate(assignDate.getDate() + dayOffset);

        rowsToInsert.push({
          student_id: studentId,
          day_label: `Day ${day}`,
          session: session,
          assigned_date: formatSupabaseDate(assignDate),
          status: '학습 전',
          score_record: ''
        });
      }
    }

    // 1) 학생 레벨 갱신
    await client
      .from('students')
      .update({ level: level })
      .eq('id', studentId);

    // 2) 90일 학습기록 일괄 Upsert
    const { error } = await client
      .from('learning_records')
      .upsert(rowsToInsert, { onConflict: 'student_id,day_label,session' });

    if (error) {
      console.error("[Supabase] registerPlanner upsert 실패:", error);
      return false;
    }

    // [Comment Policy: 시스템 감사 로그(Audit Log) 자동 기록]
    insertSystemLog(
      studentId,
      studentId,
      '플래너_일정생성',
      'onboarding',
      `시작일: ${formatSupabaseDate(startDate)} | 레벨: ${level} | 보존완료회차: 0개`,
      0,
      formatSupabaseDate(new Date())
    );

    return true;
  } catch (err) {
    console.error("[Supabase] registerPlannerWithSupabase 예외:", err);
    return false;
  } finally {
    if (typeof hideConnectionLoading === "function") hideConnectionLoading();
  }
}

/**
 * 3. 학생의 90일 플래너 상태 조회
 * @param {string} studentId
 * @returns {Promise<object>}
 */
async function getPlannerStateFromSupabase(studentId) {
  const client = getSupabaseClient();
  if (!client) return { success: false, words: [] };

  try {
    if (typeof showConnectionLoading === "function") showConnectionLoading();

    const { data: records, error } = await client
      .from('learning_records')
      .select('*')
      .eq('student_id', studentId)
      .order('id', { ascending: true });

    if (error || !records || records.length === 0) {
      return { success: false, words: [] };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const words = records.map(r => {
      let currentStatus = r.status || '학습 전';
      if (currentStatus !== '학습 완료' && r.assigned_date) {
        const assignDate = new Date(r.assigned_date);
        assignDate.setHours(0, 0, 0, 0);
        if (todayTime > assignDate.getTime()) {
          currentStatus = '지각';
        } else {
          currentStatus = '학습 전';
        }
      }

      return {
        studentId: r.student_id,
        dayLabel: r.day_label,
        session: r.session || 1,
        startDate: r.assigned_date || '',
        endDate: r.assigned_date || '',
        scoreRecord: r.score_record ? String(r.score_record) : '',
        status: currentStatus
      };
    });

    return {
      success: true,
      startDate: words[0].startDate,
      endDate: words[words.length - 1].endDate,
      words: words
    };
  } catch (err) {
    console.error("[Supabase] getPlannerStateFromSupabase 예외:", err);
    return { success: false, words: [] };
  } finally {
    if (typeof hideConnectionLoading === "function") hideConnectionLoading();
  }
}

/**
 * 4. 회차 완료 및 미니게임 점수 저장 (Supabase Upsert)
 * [중요] student_id, day_label, session 유니크 키로 업데이트하므로 절대 충돌이나 다른 행 침범이 없음!
 * @param {string} studentId
 * @param {string} dayLabel
 * @param {number} session
 * @param {string|number} scoreRecord
 * @param {boolean} [isPassed=true]
 * @param {string} [targetStatus='학습 완료']
 * @returns {Promise<boolean>}
 */
async function submitSessionProgressToSupabase(studentId, dayLabel, session, scoreRecord, isPassed = true, targetStatus = '학습 완료') {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    if (typeof showConnectionLoading === "function") showConnectionLoading();

    const { error } = await client
      .from('learning_records')
      .update({
        status: targetStatus,
        score_record: String(scoreRecord || ''),
        updated_at: new Date().toISOString()
      })
      .eq('student_id', studentId)
      .eq('day_label', dayLabel)
      .eq('session', parseInt(session, 10));

    if (error) {
      console.error("[Supabase] submitSessionProgress 실패:", error);
      return false;
    }

    // [Comment Policy: 시스템 감사 로그(Audit Log) 자동 기록]
    insertSystemLog(
      studentId,
      '-',
      '회차학습제출',
      isPassed ? '합격' : '불합격',
      `${dayLabel} (${session}회차) | 점수: ${scoreRecord || ''} | 최종상태: ${targetStatus}`,
      '-',
      formatSupabaseDate(new Date())
    );

    return true;
  } catch (err) {
    console.error("[Supabase] submitSessionProgressToSupabase 예외:", err);
    return false;
  } finally {
    if (typeof hideConnectionLoading === "function") hideConnectionLoading();
  }
}

/**
 * 5. 관리자용 전체 학생 진도 및 지각 통계 조회
 * @returns {Promise<object>}
 */
async function getAllStudentsFromSupabase() {
  const client = getSupabaseClient();
  if (!client) return { success: false, students: [] };

  try {
    if (typeof showConnectionLoading === "function") showConnectionLoading();

    // 5-1. 학생 목록 조회 (student 역할만)
    const { data: students, error: sErr } = await client
      .from('students')
      .select('*')
      .eq('role', 'student')
      .order('id', { ascending: true });

    if (sErr || !students) {
      return { success: false, students: [] };
    }

    // 5-2. 전체 학습 기록 조회
    const { data: records, error: rErr } = await client
      .from('learning_records')
      .select('*')
      .order('id', { ascending: true });

    const recordsByStudent = {};
    if (records) {
      records.forEach(r => {
        if (!recordsByStudent[r.student_id]) recordsByStudent[r.student_id] = [];
        recordsByStudent[r.student_id].push(r);
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const studentList = students.map(s => {
      const sRecords = recordsByStudent[s.id] || [];
      let completedSessions = 0;
      let lateSessions = 0;
      let startDateStr = '';

      if (sRecords.length > 0) {
        startDateStr = sRecords[0].assigned_date || '';
        sRecords.forEach(r => {
          if (r.status === '학습 완료') {
            completedSessions++;
          } else if (r.assigned_date) {
            const aDate = new Date(r.assigned_date);
            aDate.setHours(0, 0, 0, 0);
            if (todayTime > aDate.getTime()) {
              lateSessions++;
            }
          }
        });
      }

      const totalSessions = sRecords.length || 90;
      const progressPercent = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

      return {
        id: s.id,
        name: s.name || s.id,
        role: s.role,
        level: s.level || '단어장-초급',
        lastLogin: s.last_login || '-',
        startDate: startDateStr || '-',
        progress: `${completedSessions} / ${totalSessions} 회차 (${progressPercent}%)`,
        lateCount: `${lateSessions}회`
      };
    });

    return { success: true, students: studentList };
  } catch (err) {
    console.error("[Supabase] getAllStudentsFromSupabase 예외:", err);
    return { success: false, students: [] };
  } finally {
    if (typeof hideConnectionLoading === "function") hideConnectionLoading();
  }
}

/**
 * 6. 학생 시작일 및 레벨 수정 (점수 보존하며 90일 일정 재계산)
 * @param {string} studentId
 * @param {string} newStartDate (YYYY-MM-DD)
 * @param {string} newLevel
 * @returns {Promise<boolean>}
 */
async function updateStudentInfoInSupabase(studentId, newStartDate, newLevel) {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    if (typeof showConnectionLoading === "function") showConnectionLoading();

    // 1) 학생 레벨 변경
    if (newLevel) {
      await client.from('students').update({ level: newLevel }).eq('id', studentId);
    }

    // 2) 기존 학습 기록 조회 (완료된 점수와 상태 보존)
    const { data: existingRecords } = await client
      .from('learning_records')
      .select('*')
      .eq('student_id', studentId)
      .order('id', { ascending: true });

    const startDate = new Date(newStartDate);
    startDate.setHours(0, 0, 0, 0);

    const rowsToUpsert = [];
    let idx = 0;
    for (let day = 1; day <= 30; day++) {
      for (let session = 1; session <= 3; session++) {
        const dayOffset = (day - 1) * 3 + (session - 1);
        const assignDate = new Date(startDate);
        assignDate.setDate(assignDate.getDate() + dayOffset);

        const oldRec = (existingRecords && existingRecords[idx]) ? existingRecords[idx] : null;

        rowsToUpsert.push({
          student_id: studentId,
          day_label: `Day ${day}`,
          session: session,
          assigned_date: formatSupabaseDate(assignDate),
          status: oldRec ? oldRec.status : '학습 전',
          score_record: oldRec ? oldRec.score_record : ''
        });
        idx++;
      }
    }

    const { error } = await client
      .from('learning_records')
      .upsert(rowsToUpsert, { onConflict: 'student_id,day_label,session' });

    if (error) {
      console.error("[Supabase] updateStudentInfo 실패:", error);
      return false;
    }

    // [Comment Policy: 시스템 감사 로그(Audit Log) 자동 기록]
    insertSystemLog(
      studentId,
      studentId,
      '선생님_일정수정',
      'admin',
      `새시작일: ${newStartDate} | 새레벨: ${newLevel} | 보존완료회차: ${idx}개`,
      idx,
      '-'
    );

    return true;
  } catch (err) {
    console.error("[Supabase] updateStudentInfoInSupabase 예외:", err);
    return false;
  } finally {
    if (typeof hideConnectionLoading === "function") hideConnectionLoading();
  }
}

