(() => {
  const $ = id => document.getElementById(id);
  const files = new LocalFiles();
  const people = [];
  const documentRelations = [];
  const urls = new Set();
  let zoom = 1, demoMode = false, selectedId = null, selectedHandles = null;
  const imageCache = new Map();
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/[\s_\-·•]/g, '');
  const stem = path => path.split('/').at(-1).replace(/\.md$/i, '').trim();
  const setStatus = value => { $('status').textContent = value; };

  function parseDocument(path, content) {
    const lines = content.split(/\r?\n/);
    const headings = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^#\s+(.+?)\s*#*\s*$/);
      if (match) headings.push({ index:i, title:match[1].trim() });
    }
    const personHeadings = headings.filter(item => normalize(item.title) !== '관계');
    const sections = personHeadings.length ? personHeadings : [{ index:-1, title:stem(path) }];
    const result = [];
    sections.forEach((section, sectionIndex) => {
      const nextHeading = headings.find(item => item.index > section.index)?.index ?? lines.length;
      const start = section.index < 0 ? 0 : section.index + 1;
      const contentLines = lines.slice(start, nextHeading);
      const sectionText = contentLines.join('\n');
      const imageMatch = sectionText.match(/!\[[^\]]*\]\(([^)]+)\)/) || sectionText.match(/<img\b[^>]*src=["']([^"']+)["']/i);
      const aliases = new Set([section.title]);
      for (const line of contentLines) {
        const match = line.match(/(?:^|\s)(?:별명|이름|캐릭터명)\s*[:：]\s*(.+)/i);
        if (match) aliases.add(match[1].replace(/\*|`/g, '').trim());
      }
      if (sections.length === 1) aliases.add(stem(path));
      result.push({ id:`${path}#${sectionIndex}`, path, title:section.title, aliases:[...aliases].filter(Boolean), content:sectionText, fields:{}, relations:[], image:imageMatch?.[1]?.trim().replace(/^<|>$/g, '') || '', generation:0, excerpt:'' });
    });

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^#{2,6}\s+(.+?)\s*<->\s*(.+?)\s*$/);
      if (!match) continue;
      let end = i + 1;
      while (end < lines.length && !/^#{1,6}\s+/.test(lines[end])) end++;
      documentRelations.push({ left:match[1].trim(), right:match[2].trim(), notes:lines.slice(i + 1, end).join('\n'), heading:lines[i].replace(/^#+\s*/, '').trim(), path });
    }
    return result;
  }

  function mergePeople() {
    const merged = new Map();
    for (const person of [...people]) {
      const key = normalize(person.title);
      const existing = merged.get(key);
      if (!existing) { merged.set(key, person); continue; }
      for (const alias of person.aliases) if (!existing.aliases.includes(alias)) existing.aliases.push(alias);
      if (!existing.image && person.image) existing.image = person.image;
      existing.content += '\n' + person.content;
      if (existing.path.length > person.path.length) existing.path = person.path;
    }
    people.splice(0, people.length, ...merged.values());
  }

  function kinshipFor(left, right, notes) {
    const flat = normalize(notes).replace(/[^\p{L}\p{N}]/gu, '');
    const a = normalize(left.title), b = normalize(right.title);
    const childWords = '(?:첫째|둘째|셋째|막내)?(?:딸|아들|자녀|자식|아이)';
    const parentWords = '(?:엄마|아빠|어머니|아버지|부모|부친|모친)';
    if (new RegExp(`${escapeRegExp(a)}는${escapeRegExp(b)}의${childWords}`).test(flat)) return { type:'parent', child:left, parent:right, label:'부모 · 자녀' };
    if (new RegExp(`${escapeRegExp(b)}는${escapeRegExp(a)}의${childWords}`).test(flat)) return { type:'child', child:right, parent:left, label:'부모 · 자녀' };
    if (new RegExp(`${escapeRegExp(a)}는${escapeRegExp(b)}의${parentWords}`).test(flat)) return { type:'child', child:right, parent:left, label:'부모 · 자녀' };
    if (new RegExp(`${escapeRegExp(b)}는${escapeRegExp(a)}의${parentWords}`).test(flat)) return { type:'parent', child:left, parent:right, label:'부모 · 자녀' };
    if (/부부|배우자|남편|아내|와이프|결혼|허니|여보/.test(flat)) return { type:'spouse', label:'배우자' };
    if (/형제|자매|남매/.test(flat)) return { type:'sibling', label:'형제자매' };
    return { type:'related', label:'가족 관계' };
  }

  function recognizeRelations() {
    for (const person of people) person.relations = [];
    for (const record of documentRelations) {
      const find = name => people.find(person => person.aliases.some(alias => normalize(alias) === normalize(name)) || normalize(person.title) === normalize(name));
      const left = find(record.left), right = find(record.right);
      if (!left || !right || left === right) continue;
      const relation = kinshipFor(left, right, record.notes);
      const add = (person, target, type, label) => {
        if (!person.relations.some(item => item.targetId === target.id && item.type === type)) person.relations.push({ type, label, targetId:target.id, targetName:target.title, source:record.heading });
      };
      if (relation.type === 'parent') { add(relation.child, relation.parent, 'parent', relation.label); add(relation.parent, relation.child, 'child', relation.label); }
      else if (relation.type === 'child') { add(relation.child, relation.parent, 'parent', relation.label); add(relation.parent, relation.child, 'child', relation.label); }
      else { add(left, right, relation.type, relation.label); add(right, left, relation.type, relation.label); }
    }
    const parents = new Map(people.map(person => [person.id, new Set()]));
    for (const person of people) for (const relation of person.relations) {
      if (relation.type === 'parent') parents.get(person.id).add(relation.targetId);
      if (relation.type === 'child') parents.get(relation.targetId)?.add(person.id);
    }
    const visiting = new Set();
    const generationOf = (id, depth = 0) => {
      if (depth > people.length || visiting.has(id)) return 0;
      visiting.add(id);
      const generation = Math.max(0, ...[...(parents.get(id) || [])].map(parentId => generationOf(parentId, depth + 1) + 1));
      visiting.delete(id);
      return generation;
    };
    for (const person of people) person.generation = generationOf(person.id);
    // Keep partners and non-genealogical ties together at the same generation.
    for (const person of people) for (const relation of person.relations) if (relation.type === 'spouse') {
      const partner = people.find(item => item.id === relation.targetId);
      if (partner) { const level = Math.min(person.generation, partner.generation); person.generation = partner.generation = level; }
    }
  }

  function relatedTo(person) {
    return person.relations.map(relation => ({ ...relation, label:relation.type === 'parent' ? '부모' : relation.type === 'child' ? '자녀' : relation.label }));
  }

  async function resolvePortrait(person) {
    if (imageCache.has(person.id)) return imageCache.get(person.id);
    if (!person.image || /^https:\/\//i.test(person.image) || /^data:image\//i.test(person.image)) return person.image;
    const source = person.image.split(/[?#]/)[0];
    if (/^(?:[a-z]+:|\/\/)/i.test(source) || source.startsWith('/')) return '';
    const base = person.path.includes('/') ? person.path.slice(0, person.path.lastIndexOf('/') + 1) : '';
    const parts = [...base.split('/').filter(Boolean)];
    try {
      for (const piece of decodeURIComponent(source).replace(/\\/g, '/').split('/')) {
        if (piece === '.' || !piece) continue;
        if (piece === '..') parts.pop(); else parts.push(piece);
      }
      const blob = await (await files.file(parts.join('/'))).getFile();
      const url = URL.createObjectURL(blob); urls.add(url); imageCache.set(person.id, url); return url;
    } catch { return ''; }
  }

  function portraitHTML(person, cls) {
    return `<span class="${cls}" data-person-image="${escapeHTML(person.id)}">${escapeHTML(person.title.slice(0, 1) || '?')}</span>`;
  }

  function showRoster() {
    const query = normalize($('search').value);
    const list = $('people-list'); list.replaceChildren();
    const shown = people.filter(person => normalize(person.title).includes(query));
    for (const person of shown) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'person-row' + (person.id === selectedId ? ' selected' : '');
      button.innerHTML = `${portraitHTML(person, 'person-mini')}<span><strong>${escapeHTML(person.title)}</strong><small>${person.fields.가문 ? escapeHTML(person.fields.가문) + ' · ' : ''}${person.relations.length ? '관계 ' + person.relations.length + '건' : '관계 기록 없음'}</small></span>`;
      button.onclick = () => selectPerson(person.id); list.append(button);
    }
    $('count').textContent = String(people.length);
    $('map-count').textContent = `${people.length}명`;
    if (!shown.length && people.length) list.innerHTML = '<p class="no-results">검색 결과가 없습니다.</p>';
  }

  function renderDetail(person) {
    const links = relatedTo(person);
    const fields = Object.entries(person.fields).filter(([key]) => key !== '가족');
    const records = person.relations;
    $('detail').innerHTML = `<div class="profile-top">${portraitHTML(person, 'profile-portrait')}<h2>${escapeHTML(person.title)}</h2><p>${escapeHTML(person.fields.가문 || person.path)}</p></div>
      ${fields.length ? `<section class="detail-section"><h3>PROFILE</h3>${fields.map(([key,value]) => `<p><strong>${escapeHTML(key)}</strong> · ${escapeHTML(value)}</p>`).join('')}</section>` : ''}
      ${links.length ? `<section class="detail-section"><h3>FAMILY TIES</h3>${links.map(link => `<button class="relationship-chip" data-related="${escapeHTML(link.targetId)}">${escapeHTML(link.label)} · ${escapeHTML(link.targetName)}</button>`).join('')}</section>` : '<section class="detail-section"><h3>FAMILY TIES</h3><p>문서에서 확인된 가족 관계가 아직 없습니다.</p></section>'}
      ${records.length ? `<section class="detail-section"><h3>RELATION RECORDS</h3>${records.map(item => `<p>${escapeHTML(item.source)}</p>`).join('')}</section>` : ''}
      ${!demoMode ? `<p class="source-path">문서 · ${escapeHTML(person.path)}</p>` : ''}<a class="document-link" href="/editor/">Markdown 편집기 열기 ↗</a>`;
    $('detail').querySelectorAll('[data-related]').forEach(button => button.addEventListener('click', () => selectPerson(button.dataset.related)));
    const image = person.image;
    if (image) resolvePortrait(person).then(url => { if (url) applyImage(person.id, url); });
  }

  function applyImage(id, src) {
    document.querySelectorAll(`[data-person-image="${CSS.escape(id)}"]`).forEach(holder => {
      holder.replaceChildren(); const img = document.createElement('img'); img.alt = ''; img.src = src; holder.append(img);
    });
  }

  function selectPerson(id) {
    selectedId = id;
    const person = people.find(item => item.id === id); if (!person) return;
    showRoster(); renderDetail(person);
    document.querySelectorAll('.tree-person').forEach(node => node.classList.toggle('selected', node.dataset.id === id));
    document.querySelectorAll('.connections path').forEach(path => path.classList.toggle('active', path.dataset.from === id || path.dataset.to === id));
  }

  function renderTree() {
    $('empty').hidden = people.length > 0;
    $('tree-stage').hidden = people.length === 0;
    const root = $('generations'), svg = $('connections'); root.replaceChildren(); svg.replaceChildren();
    if (!people.length) return;
    const maxGeneration = Math.max(...people.map(person => person.generation));
    const generations = Array.from({ length: maxGeneration + 1 }, () => []);
    for (const person of people) generations[person.generation].push(person);
    generations.forEach((group, index) => {
      const column = document.createElement('section'); column.className = 'generation'; column.dataset.generation = String(index);
      const label = document.createElement('span'); label.className = 'generation-label'; label.textContent = index === 0 ? '1세대 · 시작' : `${index + 1}세대`;
      const cards = document.createElement('div'); cards.className = 'generation-people';
      for (const person of group) {
        const card = document.createElement('button'); card.type = 'button'; card.className = 'tree-person' + (person.id === selectedId ? ' selected' : ''); card.dataset.id = person.id;
        card.innerHTML = `${portraitHTML(person, 'portrait')}<span class="tree-person-copy"><strong>${escapeHTML(person.title)}</strong><small>${escapeHTML(person.fields.가문 || (person.relations.length ? '가족 관계 기록 있음' : '개인 기록'))}</small></span>`;
        card.onclick = () => selectPerson(person.id); cards.append(card);
      }
      column.append(label, cards); root.append(column);
    });
    $('tree-caption').textContent = documentRelations.length ? '문서의 인물 제목과 관계 제목에서 가족 연결을 구성했습니다.' : people.some(person => person.relations.length) ? '문서에 적힌 관계를 세대별로 배치했습니다.' : '인물을 클릭해 문서에 연결된 정보를 살펴보세요.';
    requestAnimationFrame(() => { drawConnections(); placeImages(); });
  }

  function drawConnections() {
    const stage = $('tree-stage'), svg = $('connections');
    const root = $('generations');
    const width = Math.max(stage.scrollWidth, $('tree-viewport').clientWidth), height = Math.max(stage.scrollHeight, 360);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('width', width); svg.setAttribute('height', height);
    const positions = new Map([...document.querySelectorAll('.tree-person')].map(card => [card.dataset.id, card]));
    const addPath = (from, to, spouse = false) => {
      const a = positions.get(from), b = positions.get(to); if (!a || !b) return;
      const x1 = root.offsetLeft + a.offsetLeft + a.offsetWidth / 2, y1 = root.offsetTop + a.offsetTop + a.offsetHeight / 2;
      const x2 = root.offsetLeft + b.offsetLeft + b.offsetWidth / 2, y2 = root.offsetTop + b.offsetTop + b.offsetHeight / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.dataset.from = from; path.dataset.to = to;
      path.setAttribute('d', spouse ? `M ${x1} ${y1} C ${x1 + (x2-x1)*.3} ${y1-32}, ${x2 - (x2-x1)*.3} ${y2-32}, ${x2} ${y2}` : `M ${x1} ${y1} C ${x1+45} ${y1}, ${x2-45} ${y2}, ${x2} ${y2}`);
      if (spouse) path.classList.add('spouse'); svg.append(path);
    };
    const seen = new Set();
    for (const person of people) for (const relation of person.relations) {
      const spouse = relation.type === 'spouse';
      const parentId = relation.type === 'parent' ? relation.targetId : person.id;
      const childId = relation.type === 'parent' ? person.id : relation.type === 'child' ? relation.targetId : null;
      const relatedId = relation.type === 'related' || relation.type === 'sibling' ? relation.targetId : null;
      if (spouse || childId || relatedId) {
        const key = spouse ? `s:${[person.id, relation.targetId].sort().join(':')}` : childId ? `p:${parentId}:${childId}` : `r:${[person.id, relatedId].sort().join(':')}`;
        if (!seen.has(key)) { seen.add(key); addPath(spouse ? person.id : childId ? parentId : person.id, spouse ? relation.targetId : childId ? childId : relatedId, spouse); }
      }
    }
  }

  async function placeImages() {
    for (const person of people) if (person.image) {
      const src = await resolvePortrait(person); if (src) applyImage(person.id, src);
    }
  }

  async function loadFolder() {
    if (demoMode) demoMode = false;
    setStatus('폴더를 선택하세요…');
    try {
      const name = await files.connect(); selectedHandles = null; await readFolder(); setStatus(`${name} · Markdown ${people.length}개`);
    } catch (error) {
      if (error.name !== 'AbortError') setStatus('폴더 연결 실패 · ' + error.message);
    }
  }

  async function readFolder() {
    for (const url of urls) URL.revokeObjectURL(url); urls.clear(); imageCache.clear(); people.splice(0); documentRelations.splice(0);
    const tree = await files.tree();
    for (const entry of tree.files) {
      try { const { content } = await files.read(entry.path); people.push(...parseDocument(entry.path, content)); }
      catch { /* A file removed during scanning is skipped. */ }
    }
    mergePeople();
    recognizeRelations(); selectedId = people[0]?.id || null;
    $('refresh').disabled = false; showRoster(); renderTree();
    if (selectedId) selectPerson(selectedId); else $('detail').innerHTML = '<div class="detail-placeholder"><span>✧</span><p>연결된 폴더에서 Markdown 문서를 찾지 못했습니다.</p></div>';
  }

  async function pickMarkdownFiles() {
    demoMode = false;
    try {
      if (window.showOpenFilePicker) {
        selectedHandles = await window.showOpenFilePicker({ multiple:true, types:[{ description:'Markdown 문서', accept:{ 'text/markdown':['.md','.markdown'] } }] });
        await readPickedHandles();
        $('refresh').disabled = false;
        setStatus(`선택한 파일 · Markdown ${people.length}개`);
      } else {
        const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = '.md,.markdown,text/markdown';
        input.onchange = async () => {
          selectedHandles = null;
          const picked = [];
          for (const file of input.files) if (/\.markdown?$/i.test(file.name)) picked.push({ path:file.name, content:await file.text() });
          await showPickedFiles(picked);
          $('refresh').disabled = true;
          setStatus(`선택한 파일 · Markdown ${people.length}개`);
        };
        input.click();
      }
    } catch (error) {
      if (error.name !== 'AbortError') setStatus('파일을 열지 못했습니다 · ' + error.message);
    }
  }

  async function readPickedHandles() {
    const picked = [];
    for (const handle of selectedHandles || []) {
      if (!/\.markdown?$/i.test(handle.name)) continue;
      try { picked.push({ path:handle.name, content:await (await handle.getFile()).text() }); } catch { /* Skip files that became unavailable. */ }
    }
    await showPickedFiles(picked);
  }

  async function showPickedFiles(picked) {
    for (const url of urls) URL.revokeObjectURL(url); urls.clear(); imageCache.clear(); people.splice(0); documentRelations.splice(0);
    for (const entry of picked) people.push(...parseDocument(entry.path, entry.content));
    mergePeople();
    recognizeRelations(); selectedId = people[0]?.id || null;
    showRoster(); renderTree();
    if (selectedId) selectPerson(selectedId); else $('detail').innerHTML = '<div class="detail-placeholder"><span>✧</span><p>선택한 파일에서 Markdown 문서를 찾지 못했습니다.</p></div>';
  }

  function showDemo() {
    demoMode = true;
    for (const url of urls) URL.revokeObjectURL(url); urls.clear(); imageCache.clear(); people.splice(0); documentRelations.splice(0);
    const examples = [
      ['Aoi Ito', '이토 가문', '시즈오카의 오래된 집과 작은 찻집을 지키는 가족.'],
      ['Ren Ito', '이토 가문', '바다와 오래된 필름 카메라를 좋아한다.'],
      ['Hana Ito', '이토 가문', '새로운 도시에서 자신만의 길을 찾는 중.'],
      ['Yuki Sato', '사토 가문', '꽃을 키우며 계절을 기록한다.'],
      ['Mio Ito', '이토 가문', '가족의 이야기를 사진으로 모은다.']
    ];
    examples.forEach(([name, family, excerpt], index) => people.push({ id:`demo-${index}`, path:`${name}.md`, title:name, aliases:[name], content:'', fields:{가문:family,...(index===0?{직업:'찻집 운영'}:{})}, relations:[], image:'', generation:0, excerpt }));
    const map = Object.fromEntries(people.map(person => [person.title, person]));
    const relation = (from, type, to, label) => map[from].relations.push({type,label,targetId:map[to].id,targetName:to,source:`${label}: @${to}`});
    relation('Ren Ito','parent','Aoi Ito','부모'); relation('Hana Ito','parent','Aoi Ito','부모'); relation('Mio Ito','parent','Hana Ito','부모'); relation('Aoi Ito','child','Ren Ito','자녀'); relation('Aoi Ito','child','Hana Ito','자녀'); relation('Hana Ito','child','Mio Ito','자녀'); relation('Hana Ito','spouse','Yuki Sato','배우자');
    recognizeDemoGenerations(); selectedId = 'demo-0'; $('refresh').disabled = true; setStatus('예시 가계도 · 원본 파일을 읽지 않았습니다'); showRoster(); renderTree(); selectPerson(selectedId);
  }
  function recognizeDemoGenerations() {
    const parents = new Map(people.map(p=>[p.id,new Set()]));
    for (const p of people) for (const r of p.relations) { if(r.type==='parent')parents.get(p.id).add(r.targetId); if(r.type==='child')parents.get(r.targetId).add(p.id); }
    const level=(id,seen=new Set())=>{if(seen.has(id))return 0;seen.add(id);const value=Math.max(0,...[...parents.get(id)].map(parent=>level(parent,seen)+1));seen.delete(id);return value;};
    for(const p of people)p.generation=level(p.id);
    for(const p of people)for(const r of p.relations)if(r.type==='spouse'){const other=people.find(x=>x.id===r.targetId);if(other){const value=Math.min(p.generation,other.generation);p.generation=other.generation=value;}}
  }

  function setZoom(value) { zoom = Math.min(1.5, Math.max(.65, value)); $('tree-stage').style.zoom = String(zoom); $('zoom-label').textContent = `${Math.round(zoom*100)}%`; requestAnimationFrame(drawConnections); }
  $('connect').addEventListener('click', loadFolder); $('empty-connect').addEventListener('click', loadFolder);
  $('pick-files').addEventListener('click', pickMarkdownFiles); $('empty-files').addEventListener('click', pickMarkdownFiles);
  $('demo').addEventListener('click', showDemo);
  $('refresh').addEventListener('click', () => (selectedHandles ? readPickedHandles() : readFolder()).then(() => setStatus(`새로 읽음 · Markdown ${people.length}개`)).catch(error => setStatus('다시 읽지 못했습니다 · '+error.message)));
  $('search').addEventListener('input', () => {
    showRoster(); const query = normalize($('search').value);
    document.querySelectorAll('.tree-person').forEach(card => {
      const person = people.find(item => item.id === card.dataset.id);
      card.classList.toggle('search-dimmed', Boolean(query) && !normalize(person?.title).includes(query));
    });
    document.querySelectorAll('.connections path').forEach(path => path.classList.toggle('active', path.dataset.from === selectedId || path.dataset.to === selectedId));
  });
  $('zoom-in').addEventListener('click', () => setZoom(zoom + .1)); $('zoom-out').addEventListener('click', () => setZoom(zoom - .1));
  $('fit').addEventListener('click', () => { setZoom(1); $('tree-viewport').scrollTo({left:0,top:0,behavior:'smooth'}); });
  window.addEventListener('resize', () => requestAnimationFrame(drawConnections));
  $('tree-viewport').addEventListener('scroll', () => {}, { passive:true });
  $('empty').hidden = false;
})();
