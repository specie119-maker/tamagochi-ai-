/**
 * 🧠 LocalAIUi — AI 기능을 게임 "네이티브" 메뉴로 제공한다.
 *
 * 바깥에 떠 있던 웹 패널을 없애고, 게임 메인 메뉴의 🧠 아이콘
 * → 게임 자체 다이얼로그(displayList/displayPrompt)로 흡수했다.
 *   🔌 연결(자동) → 💬 대화 → 📚 가르치기 → 🎒 책가방(RAG) → 🌱 성장
 */
(function () {
    /* ── 말풍선 시스템: 원작 다마고치처럼 "한 번에 하나, 순서대로" ──
       주의: App은 전역 let이라 window.App으로는 안 잡힌다 — typeof로 검사해야 한다 */
    function closeBubbles() {
        try {
            document.querySelectorAll('.message-bubble').forEach(b => {
                let n = b;
                while (n && typeof n.close !== 'function') n = n.parentElement;
                if (n) n.close(); else b.remove();
            });
        } catch (e) { /* 무시 */ }
    }
    function rawSay(text, ms) {
        try {
            if (typeof App === 'undefined') { alert(text); return; }
            const isEgg = App.pet && App.pet.stats && App.pet.stats.is_egg;
            if (!isEgg && App.pet && typeof App.pet.say === 'function') { App.pet.say(text, ms || 8000); return; }
            if (typeof App.displayPopup === 'function') { App.displayPopup(text, ms || 6000); return; }
            alert(text);
        } catch (e) { console.error('[다마AI]', e); try { alert(text); } catch (e2) { /* 최후 */ } }
    }

    let bubbleUntil = 0, bubbleTimer = null;
    const speechQueue = [];
    function showNow(text, ms) {
        closeBubbles();
        rawSay(text, ms);
        bubbleUntil = Date.now() + (ms || 7000);
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(pumpQueue, (ms || 7000) + 300);
    }
    function pumpQueue() {
        if (Date.now() < bubbleUntil) return;
        const next = speechQueue.shift();
        if (next) showNow(next.text, next.ms);
    }
    /* 기본: 지금 풍선을 교체하고 바로 말한다. {queue:true}: 지금 풍선이 끝나면 이어서 말한다 */
    function petSay(text, ms, opts) {
        if (opts && opts.queue && Date.now() < bubbleUntil) { speechQueue.push({ text, ms }); return; }
        speechQueue.length = 0;
        showNow(text, ms);
    }
    const petName = () => { try { return App.petDefinition?.name || ''; } catch (e) { return ''; } };
    const lifeStage = () => { try { return App.petDefinition?.getLifeStage?.(); } catch (e) { return undefined; } };

    /* ── 🔌 연결 ── */
    let connecting = false;
    async function doConnect(quiet) {
        if (connecting || LocalAI.connected) return LocalAI.connected;
        connecting = true;
        if (!quiet) App.displayPopup('🔍 내 컴퓨터에서 AI를 찾는 중…', 3000);
        const ok = await LocalAI.connect();
        connecting = false;
        if (ok) {
            const isEgg = App.pet?.stats?.is_egg;
            /* 🧬 사용자가 직접 파인튜닝한 "내 두뇌" 모델(펫 이름 또는 dama- 규칙)이면 — 최고의 보상 */
            if (LocalAI.isMyBrain(LocalAI.model)) {
                petSay(`잠깐… 이 모델(${LocalAI.model})…\n이거 제 두뇌잖아요?! 직접 만들어 주셨군요!! 🧬✨`, 12000);
            } else {
                petSay(isEgg
                    ? `🧠 두뇌가 연결됐어요! (${LocalAI.serverName})\n알이 곧 깨어나요… 🐣`
                    : `🧠 연결됐어요! (${LocalAI.serverName} · ${LocalAI.model})\n이제 진짜로 대화할 수 있어요 💬`, 8000);
            }
        } else if (!quiet) {
            /* 🔑 서버가 API 키를 요구하면 키를 물어본다 (LM Studio 설정·llama.cpp --api-key) */
            if (LocalAI.authServer) { openKeyPrompt(LocalAI.authServer); return ok; }
            /* 🌐 온라인(https) 버전: 브라우저가 로컬 연결을 막을 수 있다 — 허용 방법 안내 */
            if (location.protocol === 'https:') {
                App.displayPopup(
                    `🌐 온라인 버전은 브라우저가 <b>로컬 AI 연결을 차단</b>할 수 있어요.<br><small>크롬: 주소창 자물쇠 🔒 → 사이트 설정 → <b>로컬 네트워크 기기 접근 허용</b><br>권한 팝업이 뜨면 <b>허용</b>을 눌러 주세요. (LM Studio도 켜져 있어야 해요!)</small>`, 12000);
                return ok;
            }
            /* LM Studio가 켜져 있는데 모델만 안 실린 경우를 구분해서 알려준다 */
            App.displayPopup(LocalAI.emptyServer
                ? `<b>${LocalAI.emptyServer}</b>는 켜져 있어요! 그런데 <b>모델이 로드 안 됐어요</b>.<br><small>${LocalAI.emptyServer}에서 모델을 선택(로드)한 뒤 다시 시도해 주세요.</small>`
                : 'AI를 못 찾았어요 😅<br><b>LM Studio</b>를 켜 주세요:<br><small>개발자 탭 → 서버 시작 (CORS 켜기)<br>Ollama도 돼요: <b>OLLAMA_ORIGINS=* ollama serve</b></small>', 10000);
        }
        return ok;
    }

    /* ── 🔑 API 키 입력 — 키를 걸어둔 로컬 서버용 ── */
    function openKeyPrompt(serverName) {
        App.displayPrompt(
            `🔑 <b>${serverName}</b>가 API 키를 요구해요.<br><small>서버에 설정해 둔 키를 넣어 주세요. 키는 내 브라우저에만 저장돼요.</small>`,
            [
                {
                    name: '저장하고 연결',
                    onclick: (v) => {
                        if (!v || !v.trim()) return true;
                        LocalAI.setKey(v.trim());
                        doConnect();
                        return false;
                    }
                },
                { name: '취소', class: 'back-btn', onclick: () => {} },
            ],
            LocalAI.apiKey
        );
    }

    /* ── 💬 대화 ── */
    function openChatPrompt() {
        App.displayPrompt(
            `💬 무슨 얘기를 할까요?` + (LocalAI.ragOn
                ? `<br><small>🎒 책가방 켜짐 — 배운 걸 찾아서 답해요</small>`
                : `<br><small>아직 배운 건 몰라요 — 일반 상식으로 답해요</small>`),
            [
                { name: '물어보기', onclick: (v) => { if (v && v.trim()) askPet(v.trim()); return false; } },
                { name: '취소', class: 'back-btn', onclick: () => {} },
            ]
        );
    }
    /* 생각 중 멘트 — 매번 다르게, 로딩 안내는 세션 첫 질문에만 */
    let firstAsk = true;
    const THINKING_LINES = [
        '음… 생각 중이에요 🤔',
        '흠흠… 좋은 질문인데요?',
        '두뇌 풀가동! ⚡',
        '잠깐만요, 곰곰이…',
        '오, 그건 말이죠…',
        '생각을 모으는 중… 🌀',
    ];
    async function askPet(q) {
        try {
        App.closeAllDisplays();
        const think = THINKING_LINES[Math.floor(Math.random() * THINKING_LINES.length)]
            + (firstAsk ? '\n(첫 질문은 두뇌를 깨우느라 오래 걸릴 수 있어요!)' : '');
        firstAsk = false;
        petSay(think, 120000);
        const a = await LocalAI.ask(q, petName());
        /* 실패하면 원인별로 정확한 처방을 말해준다 */
        let msg = a;
        if (!a) {
            if (LocalAI.lastAskError === 'timeout') {
                msg = '모델이 아직 잠에서 덜 깼어요… ⏳\n큰 모델은 첫 로딩이 오래 걸려요. 조금 뒤에 다시 물어봐 주세요!';
            } else if (LocalAI.lastAskError === 'empty') {
                msg = '생각만 하다가 답을 놓쳤어요 😅\n한 번만 다시 물어봐 주세요!';
            } else if (LocalAI.lastAskError === 'preflight') {
                msg = '지금 LM Studio 버전이 웹 접속을 잘 처리하지 못해요 😢\nLM Studio를 업데이트하거나, Ollama로 켜 주세요:\nOLLAMA_ORIGINS=* ollama serve';
            } else if (LocalAI.lastAskError === 'network' && location.protocol === 'https:') {
                msg = '🌐 브라우저가 로컬 AI로 가는 길을 막았어요!\n주소창 🔒 → 사이트 설정 → "로컬 네트워크 기기" 허용으로 바꿔주세요.\nOllama라면 이렇게 켜야 해요: OLLAMA_ORIGINS=* ollama serve';
            } else if (LocalAI.lastAskError === 'network') {
                msg = '앗, AI 서버와 연결이 끊겼어요.\nLM Studio 서버가 켜져 있는지 확인해 주세요! (CORS도 켜기)';
            } else {
                msg = `앗, 서버가 대답을 거절했어요 (${LocalAI.lastAskError}).\nLM Studio에서 모델이 로드돼 있는지 확인해 주세요.`;
            }
        }
        petSay(msg, a ? 12000 : 15000);
        /* 🌱 성장 기록: 사용자의 진짜 행동만 센다 (펫 혼잣말은 안 셈).
           💰 대화하면 코인이 생긴다 — 그 돈으로 밥·간식을 사준다 (대화→코인→밥→건강 루프) */
        if (a && typeof AIGrowth !== 'undefined') {
            AIGrowth.record('chat');   /* 코인은 조용히 적립 — 화면엔 돈 얘기 없음 */
            if (LocalAI.ragOn && LocalAI.notes.length) AIGrowth.record('ragAsk');
        }
        /* 💬 대화 = 재미 충전 (+30). 장난감·오락실을 숨겼으니 대화가 재미를 채우는 유일한 방법 —
           하루 2~3번은 말을 걸어야 시무룩해지지 않는다 (죽음 조건은 원작 그대로: 4개 스탯 전부 0) */
        if (a) {
            try {
                App.pet.stats.current_fun = Math.min(App.pet.stats.max_fun || 100, App.pet.stats.current_fun + 30);
            } catch (e) { /* 펫 준비 전이면 무시 */ }
        }
        } catch (e) {
            /* 실패는 시끄럽게 — 조용히 죽지 않는다 */
            console.error('[다마AI] 대화 오류:', e);
            try { App.displayPopup('❌ 대화 중 오류가 났어요:<br><small>' + (e?.message || e) + '</small>', 8000); } catch (e2) { alert('대화 오류: ' + e); }
        }
    }

    /* ── 📚 가르치기 ── */
    function openTeachPrompt() {
        App.displayPrompt(
            `📚 무엇을 가르칠까요?<br><small>지금까지 <b>${LocalAI.notes.length}개</b> 배웠어요</small>`,
            [
                {
                    name: '가르치기',
                    onclick: (v) => {
                        if (!v || !v.trim()) return true;
                        LocalAI.teach(v.trim());
                        App.closeAllDisplays();
                        /* 먼저 말하고, 그다음 기록 — 응원 풍선이 큐로 뒤에 이어진다 */
                        petSay(`배웠어요! 🧠 (지금까지 ${LocalAI.notes.length}개)\n${LocalAI.ragOn ? '' : '🎒 책가방을 켜야 이걸 써먹어요!'}`, 7000);
                        if (typeof AIGrowth !== 'undefined') AIGrowth.record('teach'); /* 코인 조용히 적립 */
                        return false;
                    }
                },
                { name: '취소', class: 'back-btn', onclick: () => {} },
            ]
        );
    }

    /* ── 🎒 배운 것 보기 — RAG 재료를 눈으로 확인·삭제 ── */
    function openNotesList() {
        const backToAi = () => App.handlers.open_ai_menu();
        if (!LocalAI.notes.length && !LocalAI.brain.length) { petSay('아직 배운 게 없어요! 📚 로 먼저 가르쳐 주세요.', 5000); return; }
        App.displayList([
            /* 🧬 새긴 지식은 지울 수 없다 — 가중치에 새긴 건 잊게 하기 어렵다는 것도 교육 */
            ...(LocalAI.brain.length ? [{ type: 'text', name: `<small>🧬 몸에 새겨진 지식 <b>${LocalAI.brain.length}개</b> — 새긴 건 잊을 수 없어요</small>` }] : []),
            { type: 'text', name: `<small>🎒 책가방 속 지식 <b>${LocalAI.notes.length}개</b> — 누르면 지울 수 있어요</small>` },
            ...LocalAI.notes.map((n, i) => ({
                name: n,
                onclick: () => {
                    App.displayConfirm(`이 지식을 잊게 할까요?<br><small>"${n}"</small>`, [
                        {
                            name: '잊기',
                            onclick: () => {
                                LocalAI.notes.splice(i, 1);
                                LocalAI.save();
                                if (!LocalAI.notes.length && LocalAI.ragOn) { LocalAI.ragOn = false; LocalAI.save(); }
                                openNotesList();
                            }
                        },
                        { name: '취소', class: 'back-btn', onclick: () => openNotesList() },
                    ]);
                    return false;
                }
            })),
        ], backToAi);
    }

    /* ── 🧬 새기기 (파인튜닝) — 책가방 지식을 몸에 새기고 어른으로 진화 ── */
    function openEngraveConfirm() {
        if (!LocalAI.notes.length) { petSay('새길 게 없어요! 📚 가르치기로 먼저 지식을 모아 주세요.', 6000); return; }
        App.displayConfirm(
            `🎒 책가방 지식 <b>${LocalAI.notes.length}개</b>를 몸에 새길까요?<br><small>새기면 책가방을 <b>벗어도</b> 알아요.<br>진짜 파인튜닝(LoRA)이 두뇌 회로(가중치)에 지식을 새기는 것과 같은 원리예요.<br><b>한 번 새기면 잊게 할 수 없어요!</b></small>`,
            [
                {
                    name: '🧬 새기기',
                    onclick: () => {
                        LocalAI.brain.push(...LocalAI.notes);
                        LocalAI.notes = [];
                        LocalAI.ragOn = false;
                        LocalAI.save();
                        App.closeAllDisplays();
                        if (typeof AIGrowth !== 'undefined') AIGrowth.ritual();
                        /* 파티가 끝날 즈음, 결정적 체험을 하도록 유도한다 */
                        setTimeout(() => {
                            petSay('🎒 없이 아까 배운 걸 물어보세요 — 이제 그냥 알아요!\n그게 파인튜닝이에요 🧬', 12000);
                        }, 25000);
                    }
                },
                { name: '아직', class: 'back-btn', onclick: () => {} },
            ]
        );
    }

    /* ── 📤 학습 데이터 내보내기 — 가르친 지식을 JSONL로. 진짜 파인튜닝의 첫걸음 ── */
    function exportBrain() {
        const rows = [...LocalAI.brain, ...LocalAI.notes].map(n => JSON.stringify({ text: n }));
        if (!rows.length) { petSay('내보낼 지식이 없어요! 📚 로 먼저 가르쳐 주세요.', 5000); return; }
        try {
            const blob = new Blob([rows.join('\n')], { type: 'application/jsonl' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `damaai_brain_${petName() || 'pet'}.jsonl`;
            a.click();
            URL.revokeObjectURL(a.href);
            App.displayPopup(`📤 학습 데이터 <b>${rows.length}줄</b>(JSONL)을 내려받았어요!<br><small>이 파일이 진짜 파인튜닝(LoRA)의 재료예요.<br>학습된 모델 이름을 <b>dama-</b>로 시작하게 지으면(예: dama-brain)<br>펫이 자기 두뇌를 알아봐요 🧬</small>`, 10000);
        } catch (e) { console.error('[다마AI]', e); App.displayPopup('내보내기에 실패했어요 😢', 4000); }
    }

    /* ── 🗣️ 성격 정하기 — 이 한 문장이 곧 "시스템 프롬프트"라는 걸 몸으로 배운다 ── */
    function openPersonaPrompt() {
        App.displayPrompt(
            `🗣️ 어떤 성격으로 만들까요?<br><small>이 문장이 <b>시스템 프롬프트</b>가 돼요 — AI의 정체성을 정하는 지시문.<br>다 지우고 저장하면 기본 성격으로 돌아가요.</small>`,
            [
                {
                    name: '저장',
                    onclick: (v) => {
                        LocalAI.persona = (v || '').trim();
                        LocalAI.save();
                        App.closeAllDisplays();
                        petSay(LocalAI.persona
                            ? '성격이 바뀌었어요! 🗣️\n"넌 누구야?"라고 다시 물어보세요 — 답이 달라져요!'
                            : '기본 성격으로 돌아왔어요!', 8000);
                        return false;
                    }
                },
                { name: '취소', class: 'back-btn', onclick: () => {} },
            ],
            LocalAI.persona || LocalAI.PERSONA
        );
    }

    /* ── 🎒 책가방(RAG) 토글 ── */
    function toggleRag() {
        if (!LocalAI.notes.length) { petSay('아직 가르친 게 없어요! 📚 로 먼저 알려주세요.', 5000); return; }
        LocalAI.ragOn = !LocalAI.ragOn; LocalAI.save();
        petSay(LocalAI.ragOn
            ? '🎒 책가방을 멨어요! 이제 배운 걸 찾아서 답해요.\n같은 질문을 다시 해보세요 — 답이 달라져요!'
            : '🎒 책가방을 벗었어요. 다시 아무것도 모르는 상태예요.', 8000);
    }

    /* AIGrowth 등 다른 모듈도 같은 말풍선 큐를 쓰게 공개 — 겹침 방지의 단일 통로 */
    App.handlers.dama_say = petSay;

    /* ── 🧠 AI 메뉴 (게임 네이티브) ── */
    App.handlers.open_ai_menu = function () {
        const status = LocalAI.connected
            ? `🟢 <b>${LocalAI.serverName}</b> · ${LocalAI.model}<br><small>대화는 밖으로 나가지 않아요</small>`
            : `⚪ 연결 안 됨<br><small>Ollama·LM Studio를 켜면 자동으로 연결돼요</small>`;
        const growth = (typeof AIGrowth !== 'undefined' && AIGrowth.progressLine()) || '';
        return App.displayList([
            { type: 'text', name: `<small>${status}</small>` },
            {
                name: '💬 대화하기',
                onclick: () => {
                    /* 미연결이면: 연결부터 하고, 성공하면 바로 대화창을 열어준다 */
                    if (!LocalAI.connected) {
                        doConnect().then(ok => { if (ok) openChatPrompt(); });
                        return false;
                    }
                    openChatPrompt(); return false;
                }
            },
            {
                name: '📚 가르치기',
                onclick: () => { openTeachPrompt(); return false; }
            },
            {
                _mount: (e) => e.innerHTML = `🎒 책가방(RAG): <i>${LocalAI.ragOn ? '켜짐 ✅' : '꺼짐'}</i>`,
                onclick: (e) => { toggleRag(); e._mount(); return true; }
            },
            {
                name: `🎒 배운 것 보기 (${LocalAI.notes.length}개)`,
                onclick: () => { openNotesList(); return false; }
            },
            {
                name: `🗣️ 성격 정하기${LocalAI.persona ? ' ✏️' : ''}`,
                onclick: () => { openPersonaPrompt(); return false; }
            },
            /* 🧬 새기기: 청소년만 (진화 의식이라 서사 게이트 유지) */
            ...(lifeStage() === PetDefinition.LIFE_STAGE.teen ? [{
                name: '🧬 새기기 (파인튜닝)',
                onclick: () => { openEngraveConfirm(); return false; }
            }] : []),
            /* 📤 내보내기: 가르친 지식이 있으면 언제든 — 유틸리티는 숨기지 않는다 */
            ...((LocalAI.notes.length || LocalAI.brain.length) ? [{
                name: '📤 학습 데이터 만들기',
                onclick: () => { exportBrain(); return false; }
            }] : []),
            ...(LocalAI.connected ? [] : [{
                name: '🔌 다시 연결해 보기',
                onclick: () => { doConnect(); return false; }
            }]),
            ...(growth ? [{ type: 'text', name: `<small style="color:#3f9b7f">${growth}</small>` }] : []),
        ]);
    };

    /* ── 자동 연결: 시작할 때 + 연결될 때까지 15초마다 조용히 재시도 ── */
    window.addEventListener('load', () => {
        /* 🇰🇷 시간 표현 한국어화 — "3 days ago" → "3일 전", "August 10" → "8월 10일" */
        try {
            if (typeof moment !== 'undefined') {
                moment.locale('ko', {
                    months: '1월_2월_3월_4월_5월_6월_7월_8월_9월_10월_11월_12월'.split('_'),
                    monthsShort: '1월_2월_3월_4월_5월_6월_7월_8월_9월_10월_11월_12월'.split('_'),
                    weekdays: '일요일_월요일_화요일_수요일_목요일_금요일_토요일'.split('_'),
                    weekdaysShort: '일_월_화_수_목_금_토'.split('_'),
                    weekdaysMin: '일_월_화_수_목_금_토'.split('_'),
                    relativeTime: {
                        future: '%s 후', past: '%s 전',
                        s: '몇 초', ss: '%d초', m: '1분', mm: '%d분',
                        h: '1시간', hh: '%d시간', d: '하루', dd: '%d일',
                        M: '한 달', MM: '%d달', y: '1년', yy: '%d년',
                    },
                });
            }
        } catch (e) { console.error('[다마AI]', e); }
        doConnect(true);
        const timer = setInterval(() => {
            if (LocalAI.connected) { clearInterval(timer); return; }
            doConnect(true);
        }, 15000);
    });
})();
