(() => {
    const cover = document.querySelector('#story-cover');
    const workspace = document.querySelector('#workspace');
    const sessionKey = 'initsimx-story-entered';
    if (!cover || !workspace || typeof cover.showModal !== 'function') return;
    try {
        if (sessionStorage.getItem(sessionKey)) return;
    } catch { /* The cover also works when browser storage is unavailable. */ }

    let entering = false;
    const enter = (immediate = false) => {
        if (entering) return;
        entering = true;
        try { sessionStorage.setItem(sessionKey, '1'); } catch { /* Optional preference. */ }
        const finish = () => {
            if (cover.open) cover.close();
            document.documentElement.style.overflow = previousOverflow;
            workspace.classList.add('workspace-entering');
            workspace.focus({ preventScroll: true });
            setTimeout(() => workspace.classList.remove('workspace-entering'), 1000);
        };
        if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
            finish();
        } else {
            cover.classList.add('is-leaving');
            setTimeout(finish, 550);
        }
    };
    const previousOverflow = document.documentElement.style.overflow;
    cover.showModal();
    document.documentElement.style.overflow = 'hidden';
    document.querySelector('#enter-story').addEventListener('click', () => enter());
    document.querySelector('#skip-cover').addEventListener('click', () => enter(true));
    cover.addEventListener('cancel', (event) => {
        event.preventDefault();
        enter(true);
    });
})();
