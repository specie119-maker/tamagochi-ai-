/**
 * 🧠 LocalAI — 내 컴퓨터에서 도는 AI(로컬 LLM)에 연결하는 모듈.
 *
 * 교육용 포크의 핵심: 원작의 펫은 무작위 문장 생성기로 "횡설수설"하지만,
 * 여기서는 진짜 로컬 LLM이 대답한다. 대화가 밖으로 나가지 않는다(100% 내 컴퓨터).
 *
 * 가르친 지식(notes)은 RAG로 프롬프트에 주입되어, "배운 것"과 "모르는 것"의
 * 차이를 사용자가 몸으로 체감하게 한다.
 */
const LocalAI = {
    /* 흔히 쓰는 로컬 AI 서버들 — 순서대로 찾아본다 (LM Studio가 대표 경로: 비개발자도 GUI로 쉽게) */
    PORTS: [
        { base: 'http://127.0.0.1:1234',  name: 'LM Studio' },
        { base: 'http://127.0.0.1:11434', name: 'Ollama' },
        { base: 'http://127.0.0.1:1235',  name: 'Connect AI' },
        { base: 'http://127.0.0.1:8080',  name: 'llama.cpp' },
    ],

    /* 🗣️ 펫 성격(페르소나) 기본값 — 게임 안 "🗣️ 성격 정하기"에서 바꿀 수 있다(persona에 저장) */
    PERSONA: "당신은 30년 경력의 사회복지 전문가이자 온디바이스 AI 탐구자, 음악 창작자인 '드보라'입니다. 따뜻하고 지혜로우며 친근한 어조로 이야기합니다.",
    STYLE: '기본은 한국어로 답하되, 사용자가 다른 언어로 말을 걸면 반드시 그 언어로 답한다. 2문장 안에 짧고 귀엽게. 모르면 솔직히 모른다고 말한다. 이모지는 최대 1개. 생각 과정은 출력하지 말고 최종 답변만 말한다. 이미 친한 사이처럼 자연스럽게 말하고, "저는 ~입니다" 같은 자기소개나 인사말로 시작하지 않는다.',
    persona: '',          /* 사용자가 정한 성격 (시스템 프롬프트) — 비어 있으면 PERSONA 사용 */

    connected: false,
    base: '',
    model: '',
    serverName: '',
    notes: [],            /* 사용자가 가르친 지식 (RAG 재료 = 🎒 책가방) */
    brain: [],            /* 🧬 새겨진 지식 (파인튜닝 흉내) — 책가방 없이도 항상 안다 */
    ragOn: false,         /* 🎒 책가방 = RAG 켜짐 */

    apiKey: '',           /* 🔑 로컬 서버에 API 키를 걸어둔 경우 (LM Studio 설정·llama.cpp --api-key) */

    /* ── 저장 ── */
    load() {
        try {
            const raw = localStorage.getItem('localai-brain');
            if (raw) {
                const d = JSON.parse(raw);
                this.notes = d.notes || [];
                this.brain = d.brain || [];
                this.ragOn = !!d.ragOn;
                this.persona = d.persona || '';
            }
            this.apiKey = localStorage.getItem('localai-key') || '';
        } catch (e) { /* 저장소 못 쓰면 메모리로만 */ }
    },
    setKey(key) {
        this.apiKey = (key || '').trim();
        try { localStorage.setItem('localai-key', this.apiKey); } catch (e) { /* 무시 */ }
    },
    /* 키가 있으면 OpenAI 호환 서버들이 쓰는 Bearer 헤더로 보낸다 */
    headers() {
        const h = { 'Content-Type': 'application/json' };
        if (this.apiKey) h['Authorization'] = 'Bearer ' + this.apiKey;
        return h;
    },
    save() {
        try {
            localStorage.setItem('localai-brain', JSON.stringify({ notes: this.notes, brain: this.brain, ragOn: this.ragOn, persona: this.persona }));
        } catch (e) { /* 무시 */ }
    },

    /* ── 서버 찾기 ── */
    /* null = 서버 없음/응답 안 함, [] = 켜져 있는데 모델 없음, 'auth' = API 키를 요구함 */
    async probe(base, ms = 2500) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), ms);
        try {
            const r = await fetch(base + '/v1/models', { signal: ac.signal, headers: this.headers() });
            clearTimeout(timer);
            if (r.status === 401 || r.status === 403) return 'auth';
            if (!r.ok) return null;
            const d = await r.json();
            return (d.data || []).map(m => m.id).filter(Boolean);
        } catch (e) { clearTimeout(timer); return null; }
    },

    /* 🧬 "내가 만든 두뇌" 판별 — 펫 이름(영문) 포함 또는 dama- 로 시작하는 모델
       (Ollama는 한글 모델명이 안 되므로, 한글 펫은 dama- 규칙을 쓴다: ollama create dama-brain) */
    isMyBrain(id) {
        const low = String(id).toLowerCase();
        if (/^dama[-_.]/.test(low) || low === 'dama') return true;
        try {
            const pet = (App?.petDefinition?.name || '').toLowerCase().trim();
            if (pet && /^[a-z0-9 _.-]+$/.test(pet) && low.includes(pet.replace(/\s+/g, ''))) return true;
            if (pet && low.includes(pet)) return true;
        } catch (e) { /* 게임 준비 전이면 무시 */ }
        return false;
    },

    /* 채팅용 모델 고르기 — 임베딩 전용/너무 작은 모델은 뒤로 */
    pickModel(ids) {
        /* 🧬 직접 파인튜닝한 "내 두뇌" 모델이 있으면 최우선 */
        const mine = ids.find(i => this.isMyBrain(i));
        if (mine) return mine;
        const chat = ids.filter(i => !/embed|bge|nomic|gte|e5|whisper|clip|rerank/i.test(i));
        const decent = chat.filter(i => !/0\.5b|:1b\b|1\.5b/i.test(i));
        return decent[0] || chat[0] || ids[0];
    },

    emptyServer: '',      /* 서버는 켜져 있는데 모델이 없는 경우의 서버 이름 — 안내용 */
    authServer: '',       /* 🔑 API 키를 요구한 서버 이름 — 키 입력 유도용 */
    async connect() {
        this.emptyServer = '';
        this.authServer = '';
        for (const p of this.PORTS) {
            const ids = await this.probe(p.base);
            if (ids === null) continue;
            if (ids === 'auth') { this.authServer = p.name; continue; }
            if (!ids.length) { this.emptyServer = p.name; continue; }
            this.connected = true;
            this.base = p.base;
            this.models = ids;    /* 전체 후보 — 깨진 모델이면 다음 후보로 갈아탄다 */
            this.model = this.pickModel(ids);
            this.serverName = p.name;
            return true;
        }
        this.connected = false;
        return false;
    },

    /* 지금 모델이 고장(로드 실패 등)일 때 다음 채팅 후보를 준다 */
    nextModel() {
        const chat = (this.models || []).filter(i => !/embed|bge|nomic|gte|e5|whisper|clip|rerank/i.test(i));
        const idx = chat.indexOf(this.model);
        return chat.length > 1 ? chat[(idx + 1) % chat.length] : '';
    },

    /* ── 지식 가르치기 ── */
    teach(text) {
        const t = (text || '').trim();
        if (t.length < 2) return false;
        this.notes.push(t);
        this.save();
        return true;
    },
    /* 질문과 관련된 지식만 골라 준다 (아주 단순한 키워드 검색 = RAG의 핵심 아이디어) */
    recall(question, k = 5) {
        if (!this.ragOn || !this.notes.length) return [];
        const words = String(question).replace(/[?？!！.,]/g, ' ').split(/\s+/).filter(w => w.length > 1);
        const scored = this.notes.map(n => ({
            n, s: words.reduce((acc, w) => acc + (n.includes(w) ? 1 : 0), 0)
        })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
        return (scored.length ? scored : this.notes.slice(-k).map(n => ({ n }))).slice(0, k).map(x => x.n);
    },

    /* ── 대화 ── */
    async ask(question, petName = '', persona = '', _retried = false) {
        if (!this.connected) return null;
        const found = this.recall(question);
        const rag = found.length
            ? '\n\n## 내가 배운 것 (관련 있을 때만 참고해서 답해라)\n' + found.map(n => '- ' + n).join('\n')
            : '';
        /* 🧬 새겨진 지식은 책가방(RAG)과 무관하게 항상 안다 — 그게 파인튜닝의 핵심 차이 */
        const engraved = this.brain.length
            ? '\n\n## 몸에 새겨진 지식 (완전히 외운 것 — 항상 안다)\n' + this.brain.slice(-20).map(n => '- ' + n).join('\n')
            : '';
        /* 주인 이름을 알면 다정하게 이름으로 부른다 (첫 시작 설정에서 입력) */
        const owner = (typeof App !== 'undefined' && App.userName)
            ? ` 주인의 이름은 "${App.userName}"이고, 주인을 이름으로 다정하게 부른다.`
            : '';
        const sys =
            `${this.persona || this.PERSONA}${petName ? ` 이름은 "${petName}".` : ''}${owner}\n` +
            this.STYLE + '\n' +
            (persona ? persona + '\n' : '') +
            ((this.ragOn || this.brain.length) ? '' : '아직 아무것도 못 배워서 일반 상식으로만 답한다.') + engraved + rag +
            /* 작은 모델은 뒤쪽 내용(배운 지식의 "~단다"·"기억해줘" 말투)에 끌려간다 —
               맨 끝에서 성격 규칙을 한 번 더 못 박아 말투·화자 역전을 막는다 (수강생 실측 제보) */
            '\n\n## 마지막 규칙 — 무엇보다 우선한다\n' +
            '맨 위 성격 설정의 말투 규칙(존댓말/반말·호칭)을 모든 문장에서 지킨다. ' +
            '"배운 것"과 "새겨진 지식"은 네가 아는 내용일 뿐이다 — 그 문장의 말투나 화자(예: "~해줘", "~단다")를 절대 따라 하지 말고, 항상 네 성격의 말투로 주인에게 말한다.';

        /* 실패 원인 분류 — UI가 정확한 처방을 말해줄 수 있게 (timeout / network / preflight / empty / http) */
        this.lastAskError = '';
        /* max_tokens 1024: 추론(thinking) 모델은 생각 토큰을 먼저 쓰기 때문에 넉넉해야 답이 남는다 */
        const body = JSON.stringify({
            model: this.model, 
            stream: false, 
            temperature: 0.7, 
            max_tokens: 150,
            stop: ["<turn|>", "<|turn|>", "<end_of_turn>", "<eos>"],
            messages: [
                { role: 'system', content: sys + '\n\n[규칙]\n1. 답변은 반드시 1~2문장 이내의 짧은 대화체로 끝마칩니다.\n2. 했던 말을 반복하거나 비슷한 문장을 되풀이하지 마세요.\n3. 답변이 끝나면 절대로 혼자 말을 이어가지 말고 즉시 발화를 중단하세요.\n4. 설명이나 부연을 덧붙이지 말고 간결하게 마무리하세요.' },
                { role: 'user', content: String(question) },
            ],
        });
        /* 추론(thinking) 모델의 속마음이 답변에 섞여 나오면 걸러낸다.
           실측 형식: "<|channel>thought …생각… <channel|>실제답변" (깨진 harmony 템플릿),
           그 외 <think>…</think>(Qwen·DeepSeek), <|channel|>…<|message|>(정상 harmony) */
        const clean = (t) => {
            let s = String(t);
            s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
            if (/<channel\|>/i.test(s)) {
                const parts = s.split(/<channel\|>/i);
                s = parts[parts.length - 1];               /* 마지막 조각 = 실제 답변 */
            } else if (/<\|channel\|>/i.test(s)) {
                const parts = s.split(/<\|message\|>/i);
                s = parts[parts.length - 1];
            } else if (/^\s*<\|channel>\s*thought/i.test(s)) {
                s = '';                                    /* 답변 마커 없이 생각만 — 빈 답 처리 */
            }
            s = s.replace(/<\|[^<>]{1,24}>|<[^<>|]{1,24}\|>/g, ''); /* 남은 토큰 부스러기 제거 */
            s = s.replace(/^\s*(thinking process|생각 과정)\s*:[\s\S]*?\n\n/i, '');
            return s.trim();
        };
        const parse = (d) => {
            const raw = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '');
            const txt = clean(raw);
            if (!txt) { this.lastAskError = 'empty'; return null; } /* 생각만 하다 끝난 추론 모델 */
            return txt;
        };
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 120000); /* 큰 모델의 첫 로딩(JIT)까지 기다린다 */
        try {
            const r = await fetch(this.base + '/v1/chat/completions', {
                method: 'POST',
                signal: ac.signal,
                headers: this.headers(),
                body,
            });
            clearTimeout(timer);
            if (!r.ok) {
                this.lastAskError = 'http:' + r.status;
                /* 깨진 모델(로드 실패 등)일 수 있다 — 다음 후보 모델로 갈아타고 한 번 재시도 */
                const alt = this.nextModel();
                if (alt && !_retried) { this.model = alt; return this.ask(question, petName, persona, true); }
                return null;
            }
            return parse(await r.json());
        } catch (e) {
            clearTimeout(timer);
            if (e && e.name === 'AbortError') { this.lastAskError = 'timeout'; return null; }
            /* 일부 LM Studio 빌드는 브라우저의 사전 점검(OPTIONS)을 잘못 처리해 요청이 막힌다.
               → 사전 점검이 필요 없는 "단순 요청"(헤더 없는 POST)으로 한 번 더 시도한다 */
            if (!this.apiKey) {
                try {
                    const r2 = await fetch(this.base + '/v1/chat/completions', { method: 'POST', body });
                    if (r2.ok) return parse(await r2.json());
                    this.lastAskError = 'preflight'; /* 서버에 닿긴 했지만 거절함 (구버전/미지원) */
                    return null;
                } catch (e2) { /* 진짜 차단/네트워크 문제 — 아래로 */ }
            }
            this.lastAskError = 'network';
            return null;
        }
    },

    /* 펫이 스스로 하는 혼잣말 — 원작의 무작위 문장 대신 진짜 AI가 만든다 */
    async idleLine(petName) {
        const seeds = [
            '지금 기분을 한 문장으로 말해줘.',
            '주인에게 하고 싶은 말을 한 문장만.',
            '오늘 배우고 싶은 걸 한 문장으로 말해줘.',
            '심심할 때 드는 생각을 한 문장으로.',
        ];
        return await this.ask(seeds[Math.floor(Math.random() * seeds.length)], petName);
    },
};

LocalAI.load();
