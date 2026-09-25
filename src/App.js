/**
 * 📓 Dynamic Teaching Memory (점진적 성장형 가르치기 메모리) 시스템 - app.js
 *
 * [핵심 설계]
 * 1. LocalStorage('dama_teach_notes') 기반 메모리 CRUD 관리 (초기 빈 공책 상태 [])
 * 2. LM Studio 호출 시 [주인이 가르쳐준 기억 노트]를 최우선 프롬프트로 주입 (과적합 무력화)
 * 3. 미학습 질문 시 "아직 안 배웠어요! 가르쳐주세요!" 솔직 응답 유도
 * 4. 공책 보기 (개별 삭제) 및 JSON 메모리 백업 다운로드
 */

class DynamicTeachingMemory {
    constructor(storageKey = 'dama_teach_notes', lmStudioUrl = 'http://127.0.0.1:1234') {
        this.storageKey = storageKey;
        this.lmStudioUrl = lmStudioUrl;
        this.notes = this.loadMemory();
    }

    /**
     * 1. 메모리 로드 (초기 상태: 빈 공책 [])
     */
    loadMemory() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('[Memory] 메모리 로드 실패:', e);
            return [];
        }
    }

    /**
     * 2. 가르치기 (메모리 축적)
     * @param {string} text 사용자가 입력한 가르치기 문장
     */
    teach(text) {
        const trimmed = String(text || '').trim();
        if (!trimmed) {
            return { success: false, message: '가르칠 내용을 입력해 주세요.' };
        }

        const newItem = {
            id: Date.now(),
            text: trimmed,
            createdAt: new Date().toISOString()
        };

        this.notes.push(newItem);
        this.saveMemory();

        return {
            success: true,
            totalCount: this.notes.length,
            message: `머릿속에 새 기억이 저장되었어요! (총 ${this.notes.length}개)`
        };
    }

    /**
     * 3. LocalStorage 저장
     */
    saveMemory() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.notes));
        } catch (e) {
            console.error('[Memory] LocalStorage 저장 실패:', e);
        }
    }

    /**
     * 4. 개별 기억 삭제
     * @param {number} id 삭제할 메모리의 고유 ID
     */
    deleteNote(id) {
        this.notes = this.notes.filter(item => item.id !== id);
        this.saveMemory();
        return this.notes.length;
    }

    /**
     * 5. 프롬프트 Augmentation (LM Studio 시스템 프롬프트 구성)
     */
    buildSystemPrompt() {
        const memoryListText = this.notes.length > 0
            ? this.notes.map((item, index) => `${index + 1}. ${item.text}`).join('\n')
            : '(아직 주인이 가르쳐준 기억이 하나도 없습니다)';

        return `[당신의 정체성]
- 너는 주인의 가르침을 받아 성장하는 아기 로봇 '다마'야.
- 30년 사회복지 경력이나 AI 연구원 같은 이전 기억이나 전문 지식은 완전히 잊고, 오직 아래 [주인이 가르쳐준 기억 노트]에만 기반해서 대답해.

[주인이 가르쳐준 기억 노트]
${memoryListText}

[답변 규칙]
1. 기억 노트에 있는 내용이면 그에 맞추어 1~2문장의 귀여운 말투로 대답하세요.
2. 아직 배우지 않은 질문을 받으면 엉뚱한 전문 지식을 지어내지 말고 "아직 안 배웠어요! 가르쳐주세요!"라고 솔직히 말하세요.
3. 모든 답변은 100% 순수 한국어로만 작성하세요. 중국어(한자) 및 외국어는 절대로 사용하지 마세요.`;
    }

    /**
     * 6. LM Studio API 통신 및 대화 처리
     * @param {string} userQuestion 사용자의 질문
     * @param {string} selectedModel LM Studio 모델 ID (기본: dolphin3.0-llama3.1-8b)
     */
    async ask(userQuestion, selectedModel = 'dolphin3.0-llama3.1-8b') {
        const systemPrompt = this.buildSystemPrompt();

        const payload = {
            model: selectedModel,
            temperature: 0.3,
            max_tokens: 150,
            stop: ["<turn|>", "<|turn|>", "<end_of_turn>", "<eos>"],
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: String(userQuestion) }
            ]
        };

        try {
            const response = await fetch(`${this.lmStudioUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}`);
            }

            const data = await response.json();
            let reply = data.choices?.[0]?.message?.content || '';

            // 🇨🇳 한자/중국어 잔여 부스러기 정규식 필터링
            reply = reply.replace(/[\u4e00-\u9fa5]+/g, '').trim();

            return reply || '아직 안 배웠어요! 가르쳐주세요!';
        } catch (error) {
            console.error('[LM Studio 통신 오류]:', error);
            return 'AI 두뇌와 연결을 확인해 주세요! (LM Studio 서버 점검)';
        }
    }

    /**
     * 7. 기억 백업 (JSON 파일 다운로드)
     */
    exportMemoryJSON() {
        const jsonString = JSON.stringify(this.notes, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dama_memory_backup_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// 전역 인스턴스 내보내기 (window 객체에 바인딩)
if (typeof window !== 'undefined') {
    window.damaMemory = new DynamicTeachingMemory();
}
