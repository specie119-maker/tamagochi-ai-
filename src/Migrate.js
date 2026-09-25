/**
 * 🧳 주소 이사 수신기 — 이전 주소(dama-ai.web.app 등)에서 #migrate= 로 들고 온
 * 세이브를 이 주소의 저장소(IndexedDB + localStorage)에 심는다.
 * 이미 여기서 키우는 펫이 있으면 절대 덮어쓰지 않는다.
 */
(function () {
    let m = null;
    try { m = location.hash.match(/migrate=([A-Za-z0-9\-_]+)/); } catch (e) { return; }
    if (!m) return;
    const clearHash = () => { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } };
    try {
        const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const data = JSON.parse(new TextDecoder().decode(bytes));
        const idb = data.idb || {};
        const ls = data.ls || {};

        const req = indexedDB.open('keyval-store');
        req.onupgradeneeded = () => { try { req.result.createObjectStore('keyval'); } catch (e) { } };
        req.onsuccess = () => {
            const db = req.result;
            let tx;
            try { tx = db.transaction('keyval', 'readwrite'); } catch (e) { clearHash(); return; }
            const store = tx.objectStore('keyval');
            const check = store.get('pet');
            check.onsuccess = () => {
                if (check.result) { clearHash(); return; }   /* 여기 펫이 이미 있음 — 보호 */
                Object.entries(idb).forEach(([k, v]) => { try { store.put(v, k); } catch (e) { } });
                Object.entries(ls).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { } });
                tx.oncomplete = () => { clearHash(); location.reload(); }; /* 이사 완료 — 새 세이브로 재부팅 */
            };
            check.onerror = clearHash;
        };
        req.onerror = clearHash;
    } catch (e) { clearHash(); }
})();
