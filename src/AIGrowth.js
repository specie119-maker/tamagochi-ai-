/**
 * 🌱 AIGrowth — 다마AI의 심장: 성장은 시간이 아니라 "배움"으로.
 *
 * 원작(Tamaweb)의 펫은 시간이 지나면 자란다. 다마AI의 펫은
 * AI 공부의 마일스톤을 달성해야 자란다:
 *
 *   🥚 알   → 👶 아기   : 로컬 AI 연결 (모델 = 두뇌)          — Pet.js 부화 게이트
 *   👶 아기 → 🧒 어린이 : 대화 10번    (추론, inference)
 *   🧒 어린이 → 🧑 청소년 : 가르치기 5개 + 🎒 켜고 질문 5번 (RAG)
 *   🧑 청소년 → 🧓 어른  : 🧬 새기기   (파인튜닝)             — 다음 업데이트
 *
 * 조건이 차면 원작의 생일 파티(Activities.birthday)가 열리며 진화한다.
 */
const AIGrowth = {
    KEY: 'damaai-growth',
    counts: { chat: 0, teach: 0, ragAsk: 0 },
    evolvePending: false,

    /* 💤 외로움 시스템 — 대화가 생명줄. 숫자는 여기서 조절한다 */
    LONELY: { sulkDays: 1, warnDays: 3, sleepDays: 7 },
    lastChatAt: 0,          /* 마지막으로 대화한 시각 */
    lastLonelyWarnAt: 0,    /* 마지막 경고 시각 (하루 1회만 경고) */

    /* ── 저장 ── */
    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            if (raw) {
                const d = JSON.parse(raw);
                if (d.counts) {
                    this.counts = { ...this.counts, ...d.counts };
                    this.lastChatAt = d.lastChatAt || 0;
                    this.lastLonelyWarnAt = d.lastLonelyWarnAt || 0;
                } else {
                    this.counts = { ...this.counts, ...d };   /* 구버전 저장 형식 호환 */
                }
            }
        } catch (e) { /* 저장소 못 쓰면 메모리로만 */ }
    },
    save() {
        try {
            localStorage.setItem(this.KEY, JSON.stringify({
                counts: this.counts, lastChatAt: this.lastChatAt, lastLonelyWarnAt: this.lastLonelyWarnAt,
            }));
        } catch (e) { /* 무시 */ }
    },

    /* ── 💤 외로움 체크 (주기 실행) — 오래 방치하면 시무룩 → 경고 → 잠듦 ── */
    reviveGrace() { this.lastChatAt = Date.now(); this.lastLonelyWarnAt = 0; this.save(); },
    lonelinessTick() {
        try {
            if (!App?.pet || App.pet.stats.is_egg || App.pet.stats.is_dead) return;
            if (!this.lastChatAt) { this.lastChatAt = Date.now(); this.save(); return; } /* 첫 시작 유예 */
            const days = (Date.now() - this.lastChatAt) / 86400000;
            if (days >= this.LONELY.sleepDays) {
                App.pet.stats.is_dead = true;   /* 원작 흐름이 무덤·깨우기 화면을 처리한다 */
                return;
            }
            if (days >= this.LONELY.warnDays) {
                if (Date.now() - this.lastLonelyWarnAt > 86400000) {
                    this.lastLonelyWarnAt = Date.now(); this.save();
                    const leftDays = Math.max(1, this.LONELY.sleepDays - Math.floor(days));
                    App.displayPopup(`⚠️ <b>${App.petDefinition.name}</b>… 벌써 <b>${Math.floor(days)}일째</b> 아무 말도 못 들었어요.<br><b>${leftDays}일</b> 더 지나면 외로움에 잠들어 버려요 💤`, 10000);
                }
                return;
            }
            if (days >= this.LONELY.sulkDays && Math.random() < 0.08) {
                this.say('…심심해요. 말 걸어주세요 💬', 6000);
            }
        } catch (e) { /* 게임 준비 전이면 무시 */ }
    },

    /* ── 현재 단계의 성장 목표 ── */
    goal() {
        try {
            const LS = PetDefinition.LIFE_STAGE;
            const stage = App.petDefinition?.getLifeStage?.();
            if (stage === LS.baby) return {
                title: '어린이',
                needs: [{ key: 'chat', n: 10, label: '💬 대화' }],
                lesson: 'AI에게 묻고 답을 받는 게 "추론(inference)"이에요.',
            };
            if (stage === LS.child) return {
                title: '청소년',
                needs: [
                    { key: 'teach', n: 5, label: '📚 가르치기' },
                    { key: 'ragAsk', n: 5, label: '🎒 책가방 켜고 질문' },
                ],
                lesson: '가르친 걸 찾아서 답하는 게 "RAG"예요.',
            };
            if (stage === LS.teen) return {
                title: '어른',
                locked: '🧬 새기기(파인튜닝)로 어른이 될 수 있어요 — 🧠 메뉴에서!',
            };
        } catch (e) { /* 게임이 아직 준비 전 */ }
        return null;
    },

    remaining(goal) {
        return goal.needs
            .map(w => ({ ...w, left: Math.max(0, w.n - (this.counts[w.key] || 0)) }))
            .filter(w => w.left > 0);
    },

    /* UI 힌트·말풍선용 진행도 문구 */
    progressLine() {
        const g = this.goal();
        if (!g) return '';
        if (g.locked) return g.locked;
        const left = this.remaining(g);
        if (!left.length) return '';
        return `🌱 ${g.title}가 되려면: ` + left.map(w => `${w.label} ${w.left}번`).join(' · ');
    },

    /* 💰 공부 용돈 — 이 게임의 유일한 수입원. 공부하면 → 돈 벌고 → 밥 사준다.
       교육 콘텐츠라 돈 얘기는 화면에 절대 안 띄운다 — 조용히 쌓여서 밥값 걱정만 없앤다 */
    GOLD: { chat: 10, teach: 20, ragAsk: 0 /* 대화로 이미 받음 */ },

    /* ── 마일스톤 기록 (LocalAIUi에서 사용자 행동만 기록한다). 번 용돈을 돌려준다 ── */
    record(evt) {
        if (App?.pet?.stats?.is_egg) return 0;    /* 알은 아직 못 배운다 */
        if (!(evt in this.counts)) return 0;
        this.counts[evt]++;
        if (evt === 'chat') this.lastChatAt = Date.now();  /* 💤 대화 = 생명줄 갱신 */
        this.save();

        const pay = this.GOLD[evt] || 0;
        if (pay && App?.pet?.stats) App.pet.stats.gold += pay;

        const g = this.goal();
        if (!g || g.locked) return pay;
        if (!this.remaining(g).length) { this.evolve(g); return pay; }

        /* 절반 지점과 마지막 2번은 응원해 준다 */
        const w = g.needs.find(x => x.key === evt);
        if (w) {
            const leftN = w.n - this.counts[evt];
            if (leftN > 0 && (leftN <= 2 || this.counts[evt] === Math.ceil(w.n / 2))) {
                this.say(this.progressLine() + ' — 조금만 더!', 6000);
            }
        }
        return pay;
    },

    /* ── 🧬 새기기 의식: 청소년만 가능. 파인튜닝의 원리를 몸으로 배우고 어른이 된다 ── */
    ritual() {
        try {
            if (App.petDefinition?.getLifeStage?.() !== PetDefinition.LIFE_STAGE.teen) return false;
        } catch (e) { return false; }
        this.evolve({
            title: '어른',
            lesson: '몸에 새긴 지식은 🎒 없이도 안다 — 그게 파인튜닝이에요.',
        });
        return true;
    },

    /* ── 진화: 원작의 생일 파티를 연다 ── */
    evolve(g) {
        if (this.evolvePending) return;
        if (!App.canProceed('ai_growth_evolve', App.constants.ONE_MINUTE)) return;
        this.evolvePending = true;
        this.say(`어…? 몸이 반짝반짝해!! ✨\n${g.lesson || ''}\n나… 크는 것 같아!`, 5000);
        setTimeout(() => {
            App.queueEvent(() => {
                Activities.birthday();
                this.evolvePending = false;
                /* 파티가 끝날 즈음 다음 목표를 알려준다 */
                setTimeout(() => {
                    const next = this.progressLine();
                    if (next) this.say(next, 9000);
                }, 15000);
            }, 'ai_growth_evolution');
        }, 4000);
    },

    say(text, ms) {
        try {
            /* 말풍선 큐(단일 통로)로 보낸다 — 지금 풍선이 끝난 뒤 이어서 말해서 겹치지 않는다 */
            if (App?.handlers?.dama_say) { App.handlers.dama_say(text, ms, { queue: true }); return; }
            if (App?.pet?.say && !App.pet.stats.is_egg) { App.pet.say(text, ms || 7000); return; }
            App?.displayPopup?.(text, ms || 6000);
        } catch (e) { console.error('[다마AI]', e); }
    },
};

AIGrowth.load();
/* 💤 외로움 감시: 5분마다 확인 (시작 30초 뒤 첫 확인) */
setTimeout(() => AIGrowth.lonelinessTick(), 30000);
setInterval(() => AIGrowth.lonelinessTick(), 5 * 60 * 1000);
