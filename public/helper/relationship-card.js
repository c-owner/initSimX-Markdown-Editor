export const initial = () => ({
    kind: 'initsimx-relationship',
    version: 1,
    theme: 'general',
    date: '',
    relation: '오래된 친구',
    summary: '서로 다른 두 사람이 쌓아온 관계를 기록합니다.',
    change: '최근 두 사람 사이에 있었던 변화를 적어보세요.',
    memory: '함께 겪은 사건이나 기억에 남는 순간을 적어보세요.',
    unfinished: '앞으로 이어질 이야기를 적어보세요.',
    people: [{name: '하늘', role: '먼저 손을 내미는 사람', feeling: '오랜 시간을 함께 보내며 서로를 잘 이해한다.', photo: '', position: 50, x: 50, zoom: 1}, {name: '도윤', role: '묵묵히 곁을 지키는 사람', feeling: '필요할 때 편하게 의지할 수 있는 사람이다.', photo: '', position: 50, x: 50, zoom: 1}]
});
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const palettes = {
    general: ['#f1f2f3', '#292b30', '#777b84', '#687c91', '#dadddf'],
    love: ['#fff0f3', '#462832', '#926d78', '#c85c78', '#f0d5dc'],
    revenge: ['#211d1e', '#f1e8e1', '#b9a59b', '#bd573e', '#40302d'],
    family: ['#f0f4e8', '#303b2d', '#78866c', '#748957', '#d9e2cb']
};

export function validate(raw) {
    if (!raw || raw.kind !== 'initsimx-relationship' || raw.version !== 1 || !Array.isArray(raw.people) || raw.people.length !== 2) throw Error('관계 카드 작업 파일이 아닙니다.');
    const next = initial();
    for (const key of ['relation', 'summary', 'change', 'memory', 'unfinished', 'date']) {
        if (typeof raw[key] !== 'string' || raw[key].length > 4000) throw Error('텍스트 형식이나 길이를 확인하세요.');
        next[key] = raw[key];
    }
    if (next.date && (!/^\d{4}-\d{2}-\d{2}$/.test(next.date) || !Number.isFinite(Date.parse(next.date)))) throw Error('기록 날짜를 확인하세요.');
    next.theme = Object.hasOwn(palettes, raw.theme) ? raw.theme : 'general';
    next.people = raw.people.map(person => {
        if (!person || ['name', 'role', 'feeling', 'photo'].some(k => typeof person[k] !== 'string')) throw Error('인물 정보를 확인하세요.');
        if (person.name.length > 80 || person.role.length > 120 || person.feeling.length > 2000) throw Error('인물 정보가 너무 깁니다.');
        if (person.photo && (!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(person.photo) || person.photo.length > 4 * 1024 * 1024)) throw Error('지원하지 않는 사진 형식입니다.');
        return {name: person.name, role: person.role, feeling: person.feeling, photo: person.photo, position: Math.max(0, Math.min(100, Number(person.position) || 0)), x: Math.max(0, Math.min(100, Number(person.x) || 0)), zoom: Math.max(1, Math.min(5, Number(person.zoom) || 1))};
    });
    return next;
}

export function cardHTML(state) {
    const [bg, fg, muted, accent, line] = palettes[state.theme] || palettes.general;
    const e = escapeHTML, text = v => e(v).replace(/\n/g, '<br>');
    const name = p => '@' + p.name.replace(/^@+/, '');
    const portrait = p => `<div style="width:96px;height:112px;margin:0 auto 14px;border-radius:48px 48px 12px 12px;overflow:hidden;background:${line};display:flex;align-items:center;justify-content:center;color:${accent};font-size:32px;">${p.photo ? `<img src="${e(p.exported || p.photo)}" alt="${e(name(p))}" style="display:block;width:100%;height:100%;object-fit:cover;object-position:${p.exported ? '50% 50%' : `${p.x??50}% ${p.position}%`};transform-origin:${p.x??50}% ${p.position}%;transform:scale(${p.exported ? 1 : p.zoom??1});">` : e(p.name.replace(/^@+/, '').slice(0, 1) || '◇')}</div>`;
    const motif = state.theme === 'love' ? '♥' : state.theme === 'revenge' ? '⚡' : state.theme === 'family' ? '❋' : '↔';
    const connector = state.theme === 'general' ? `<div style="height:1px;flex:1;background:${accent};"></div><span style="color:${accent};font-size:15px;padding:0 8px;">↔</span><div style="height:1px;flex:1;background:${accent};"></div>` : `<div style="height:1px;flex:1;background:linear-gradient(90deg,transparent,${accent});"></div><span style="display:inline-grid;place-items:center;width:36px;height:36px;border:1px solid ${accent};border-radius:${state.theme === 'love' ? '50%' : state.theme === 'family' ? '12px' : '4px'};color:${accent};font-size:18px;transform:${state.theme === 'revenge' ? 'rotate(45deg)' : ''};">${motif}</span><div style="height:1px;flex:1;background:linear-gradient(90deg,${accent},transparent);"></div>`;
    const person = p => `<td style="width:46%;padding:20px 8px;text-align:center;vertical-align:top;">${portrait(p)}<div style="font-size:19px;font-weight:700;color:${fg};">${e(name(p))}</div><div style="font-size:12px;color:${muted};margin-top:6px;">${text(p.role)}</div></td>`;
    const sections = [[state.theme === 'revenge' ? '최근 국면' : '최근 변화', state.change], [state.theme === 'revenge' ? '충돌과 사건' : '함께 겪은 사건', state.memory], [state.theme === 'revenge' ? '남은 빚과 복수' : state.theme === 'family' ? '함께 지켜갈 것' : '앞으로의 이야기', state.unfinished]].filter(([, v]) => v.trim()).map(([label, value]) => `<div style="border-top:1px solid ${line};padding-top:18px;margin-top:18px;"><div style="font-size:11px;letter-spacing:1px;color:${accent};margin-bottom:7px;">${label}</div><div style="font-size:14px;color:${fg};">${text(value)}</div></div>`).join('');
    return `<div style="box-sizing:border-box;max-width:760px;margin:20px auto;padding:28px 22px;border:1px solid ${line};border-radius:${state.theme === 'love' ? '24px' : state.theme === 'revenge' ? '5px' : state.theme === 'family' ? '22px' : '16px'};background:${bg};color:${fg};font-family:'Malgun Gothic',sans-serif;line-height:1.8;overflow:hidden;overflow-wrap:anywhere;text-align:left;${state.theme === 'love' ? `background-image:radial-gradient(ellipse at 10% 0%,#d969851f,transparent 38%),radial-gradient(ellipse at 100% 50%,#e6a1ae20,transparent 35%);` : state.theme === 'revenge' ? `background-image:linear-gradient(135deg,transparent 0 47%,#bd573e12 47.2% 47.6%,transparent 47.8%),radial-gradient(ellipse at 100% 0%,#bd573e1c,transparent 45%);` : state.theme === 'family' ? `background-image:radial-gradient(ellipse at 0% 0%,#93aa662b,transparent 42%),radial-gradient(ellipse at 100% 100%,#7489571b,transparent 40%);` : ''}">
<div style="font-size:10px;letter-spacing:2px;color:${accent};">${state.theme === 'revenge' ? 'RIVALRY & REVENGE' : state.theme === 'love' ? 'LOVE & AFFECTION' : state.theme === 'family' ? 'FAMILY BONDS' : 'RELATIONSHIP RECORD'}${state.date ? ' · ' + e(state.date) : ''}</div>
<div style="font-family:Georgia,'Batang',serif;font-size:28px;line-height:1.4;margin:14px 0 10px;color:${fg};">${text(state.relation)}</div><div style="font-size:14px;color:${muted};">${text(state.summary)}</div>
<table role="presentation" style="width:100%;table-layout:fixed;border-collapse:collapse;margin:20px 0;background:transparent;border:0;"><tbody><tr>${state.people.map(person).join('')}</tr></tbody></table>
<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin:-14px auto 14px;max-width:260px;">${connector}</div>
${state.people.map((p, i) => `<div style="background:${line};border-radius:10px;padding:15px 17px;margin-top:10px;"><div style="font-size:11px;color:${accent};margin-bottom:5px;">${e(name(p))} → ${e(name(state.people[1 - i]))}</div><div style="font-size:14px;color:${fg};">${text(p.feeling)}</div></div>`).join('')}
${sections}<div style="margin-top:26px;font-size:9px;letter-spacing:2px;text-align:center;color:${muted};">${state.theme === 'revenge' ? '갈등은 끝나지 않았다' : state.theme === 'love' ? '서로에게 특별한 두 사람' : state.theme === 'family' ? '함께 만든 울타리' : '두 사람의 관계'}</div></div>`;
}

