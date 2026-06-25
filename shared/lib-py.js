/* ============================================================
   파이썬 엔진 (VZ.PY — Python 멘탈 모델)
   "파이썬, 눈으로 보기" 전용 렌더러. 순수 함수(상태→SVG 문자열),
   전부 방어적(빈 배열·0 division·음수·NaN 가드). 베이스 lib.js
   (VZ.AL 스텝 플레이어 + heatColor + VZ.LA.tween + linePlot) 재사용.
   - svg / codeLine / chip / arrow : 기본
   - nameLabel(이름표) / objBox(객체 상자: 가변/불변) / ref(이름→객체 화살표)
   - namespace(이름→객체 방) / scopes(LEGB 스코프 층)
   - seq(이터레이터 커서·소진) / genFrame(제너레이터 일시정지 상태)
   - wrap(데코레이터 감싸기) / card(비교) / rng(결정적)
   색: name=청록(--q) mutable=초록(--good) immutable=보라(--v)
       alias/focus=앰버(--hot) dead/소진=코랄(--dead) builtin=슬레이트
   ============================================================ */
(function (global) {
  'use strict';
  const VZ = global.VZ;
  const LA = VZ.LA, AL = VZ.AL, clamp = VZ.clamp;

  const C = {
    name: 'var(--q)', mut: 'var(--good)', immut: 'var(--v)', hot: 'var(--hot)',
    dead: 'var(--dead)', builtin: 'var(--slate)', ink: 'var(--ink)', muted: 'var(--muted)',
    faint: 'var(--faint)', line: 'var(--line)', pink: 'var(--pink)', blue: 'var(--blue)', q: 'var(--q)', v: 'var(--v)', good: 'var(--good)',
  };
  const num = (v, d = 0) => (isFinite(v) ? v : d);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function svg(W, H, inner, aria) {
    return `<svg viewBox="0 0 ${num(W, 100)} ${num(H, 100)}" width="100%" role="img" aria-label="${esc(aria) || '파이썬 그림'}" style="max-width:100%;display:block;background:var(--panel-2);border:1px solid var(--line);border-radius:12px">${inner || ''}</svg>`;
  }
  function rng(seed) { let s = (seed >>> 0) || 1; return function () { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- 코드 한 줄 (시각화 대상) ----
  function codeLine(x, y, text, opts = {}) {
    const w = opts.w || (String(text).length * 7.4 + 20), h = opts.h || 26, col = opts.color || C.ink;
    let g = `<rect x="${x}" y="${y}" width="${w.toFixed ? w.toFixed(1) : w}" height="${h}" rx="7" fill="var(--bg)" stroke="${opts.dim ? C.line : col}" stroke-width="1.2" opacity="${opts.dim ? 0.5 : 1}"/>`;
    g += `<text x="${x + 12}" y="${y + h / 2 + 4}" font-size="${opts.fs || 12.5}" font-family="JetBrains Mono" fill="${col}">${esc(text)}</text>`;
    return g;
  }
  function chip(cx, cy, text, opts = {}) {
    const col = opts.color || C.q, w = Math.max(opts.minW || 30, String(text).length * 7.2 + 14), h = opts.h || 20;
    return `<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="6" fill="${opts.fill || 'var(--panel)'}" stroke="${col}" stroke-width="1.2"${opts.dim ? ' opacity="0.45"' : ''}/>` +
      `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="${opts.fs || 10.5}" font-family="JetBrains Mono" font-weight="700" fill="${col}">${esc(text)}</text>`;
  }
  function arrow(x1, y1, x2, y2, opts = {}) {
    const col = opts.color || C.line;
    if (opts.dash) return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${opts.lw || 1.6}" stroke-dasharray="${opts.dash}"${opts.dim ? ' opacity="0.4"' : ''}/>`;
    return LA.arrowPx(x1, y1, x2, y2, col, { lw: opts.lw || 1.8 });
  }

  // ---- 이름표 (이름 바인딩) ----
  // nameLabel(x,y,name,opts) opts:{color,w,h,dim,detached(점선=del/언바운드)}
  function nameLabel(x, y, name, opts = {}) {
    const w = opts.w || Math.max(46, String(name).length * 8.5 + 20), h = opts.h || 28, col = opts.color || C.name;
    const dash = opts.detached ? ' stroke-dasharray="3 3"' : '';
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="var(--panel)" stroke="${col}" stroke-width="1.6"${dash} opacity="${opts.dim ? 0.45 : 1}"/>`;
    // 꼬리표 핀
    g += `<circle cx="${x + w - 7}" cy="${y + 7}" r="2.4" fill="${col}"/>`;
    g += `<text x="${x + w / 2 - 2}" y="${y + h / 2 + 4.5}" text-anchor="middle" font-size="${opts.fs || 13}" font-family="JetBrains Mono" font-weight="700" fill="${opts.dim ? C.muted : col}">${esc(name)}</text>`;
    return g;
  }

  // ---- 객체 상자 ----
  // objBox(x,y,opts) opts:{type, value, id, mutable(bool), w, h, hl, dim, refs(들어오는 이름표 수 표시 안함)}
  function objBox(x, y, opts = {}) {
    const w = opts.w || 110, h = opts.h || 56;
    const mutable = !!opts.mutable;
    const col = opts.color || (mutable ? C.mut : C.immut);
    const dash = mutable ? '' : ' stroke-dasharray="6 3"'; // 불변=점선 테두리(자물쇠 느낌)
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${opts.hl ? col : 'var(--panel)'}" opacity="${opts.dim ? 0.4 : (opts.hl ? 0.16 : 1)}" stroke="${col}" stroke-width="${opts.hl ? 2.4 : 1.6}"${dash}/>`;
    // 타입 배지
    if (opts.type != null) g += `<text x="${x + 10}" y="${y + 16}" font-size="9.5" font-family="JetBrains Mono" font-weight="700" fill="${col}">${esc(opts.type)}</text>`;
    // 가변/불변 표시
    g += `<text x="${x + w - 8}" y="${y + 16}" text-anchor="end" font-size="8" font-family="JetBrains Mono" fill="${mutable ? C.mut : C.immut}">${mutable ? '가변' : '불변 🔒'}</text>`;
    // 값
    if (opts.value != null) g += `<text x="${x + w / 2}" y="${y + h / 2 + 9}" text-anchor="middle" font-size="${opts.vfs || 14}" font-family="JetBrains Mono" font-weight="700" fill="${C.ink}">${esc(opts.value)}</text>`;
    // id
    if (opts.id != null) g += `<text x="${x + w / 2}" y="${y + h - 6}" text-anchor="middle" font-size="8" font-family="JetBrains Mono" fill="${C.faint}">id ${esc(opts.id)}</text>`;
    return g;
  }
  // 이름표 → 객체 화살표
  function ref(x1, y1, x2, y2, opts = {}) { return arrow(x1, y1, x2, y2, { color: opts.color || C.name, lw: opts.lw || 1.8, dash: opts.dash }); }

  // ---- 네임스페이스 (이름→객체 매핑 방) ----
  // namespace(x,y,opts) opts:{title, rows:[{name,val,hl}], w, color}
  function namespace(x, y, opts = {}) {
    const rows = opts.rows || [], w = opts.w || 180, col = opts.color || C.q, rh = 24, h = 30 + rows.length * rh;
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="var(--panel)" stroke="${col}" stroke-width="1.5"/>`;
    g += `<text x="${x + 12}" y="${y + 19}" font-size="11" font-family="JetBrains Mono" font-weight="700" fill="${col}">${esc(opts.title || '네임스페이스')}</text>`;
    rows.forEach((r, i) => {
      const ry = y + 30 + i * rh;
      if (r.hl) g += `<rect x="${x + 5}" y="${ry - 3}" width="${w - 10}" height="${rh - 2}" rx="6" fill="${C.hot}" opacity="0.13"/>`;
      g += `<text x="${x + 14}" y="${ry + 13}" font-size="11.5" font-family="JetBrains Mono" font-weight="700" fill="${r.hl ? C.hot : C.name}">${esc(r.name)}</text>`;
      g += `<text x="${x + w / 2 + 4}" y="${ry + 13}" font-size="10.5" font-family="JetBrains Mono" fill="${C.faint}">→</text>`;
      g += `<text x="${x + w - 12}" y="${ry + 13}" text-anchor="end" font-size="11" font-family="JetBrains Mono" fill="${C.ink}">${esc(r.val)}</text>`;
    });
    return g;
  }

  // ---- LEGB 스코프 층 ----
  // scopes(x,y,opts) opts:{layers:[{label,names,hl,found}], w}  (layers: 안→밖 순서가 아니라 위=Local)
  function scopes(x, y, opts = {}) {
    const layers = opts.layers || [], w = opts.w || 240, lh = opts.lh || 40, gap = 8;
    let g = '';
    layers.forEach((L, i) => {
      const ly = y + i * (lh + gap), found = L.found, hl = L.hl;
      const col = found ? C.good : (hl ? C.hot : C.line);
      g += `<rect x="${x}" y="${ly}" width="${w}" height="${lh}" rx="10" fill="${found ? 'rgba(52,211,153,.12)' : (hl ? 'rgba(251,191,36,.10)' : 'var(--panel)')}" stroke="${col}" stroke-width="${found || hl ? 2 : 1.2}"/>`;
      g += `<text x="${x + 12}" y="${ly + lh / 2 - 3}" font-size="10.5" font-family="JetBrains Mono" font-weight="700" fill="${found ? C.good : (hl ? C.hot : C.muted)}">${esc(L.label)}</text>`;
      g += `<text x="${x + 12}" y="${ly + lh / 2 + 12}" font-size="9.5" font-family="JetBrains Mono" fill="${C.faint}">${esc(L.names || '')}</text>`;
      if (found) g += `<text x="${x + w - 12}" y="${ly + lh / 2 + 4}" text-anchor="end" font-size="11" font-family="JetBrains Mono" font-weight="700" fill="${C.good}">✓ 찾음</text>`;
      else if (hl) g += `<text x="${x + w - 12}" y="${ly + lh / 2 + 4}" text-anchor="end" font-size="10" font-family="JetBrains Mono" fill="${C.hot}">없음 ↓</text>`;
    });
    return g;
  }

  // ---- 이터레이터: 시퀀스 + 커서 + 소진 ----
  // seq(x,y,items,opts) opts:{cursor(index, -1=시작전, len=소진), consumedTo(index), title, cw}
  function seq(x, y, items, opts = {}) {
    const arr = items || [], cw = opts.cw || 40, ch = opts.ch || 36, cur = opts.cursor == null ? -1 : opts.cursor;
    let g = opts.title != null ? `<text x="${x}" y="${y - 8}" font-size="10" font-family="JetBrains Mono" font-weight="700" fill="${C.muted}">${esc(opts.title)}</text>` : '';
    arr.forEach((it, i) => {
      const cx = x + i * (cw + 4), consumed = (opts.consumedTo != null && i <= opts.consumedTo), active = (i === cur);
      const col = active ? C.hot : (consumed ? C.dead : C.q);
      g += `<rect x="${cx}" y="${y}" width="${cw}" height="${ch}" rx="7" fill="${active ? C.hot : 'var(--panel)'}" opacity="${consumed ? 0.35 : (active ? 0.9 : 1)}" stroke="${col}" stroke-width="${active ? 2.4 : 1.3}"/>`;
      g += `<text x="${cx + cw / 2}" y="${y + ch / 2 + 4.5}" text-anchor="middle" font-size="13" font-family="JetBrains Mono" font-weight="700" fill="${active ? '#0b0e14' : (consumed ? C.dead : C.ink)}">${esc(it)}</text>`;
    });
    // 커서 화살표
    if (cur >= 0 && cur < arr.length) { const cx = x + cur * (cw + 4) + cw / 2; g += `<text x="${cx}" y="${y - 6}" text-anchor="middle" font-size="11" fill="${C.hot}">▼</text>`; }
    if (cur >= arr.length && arr.length) g += `<text x="${x + arr.length * (cw + 4) + 6}" y="${y + ch / 2 + 4}" font-size="10.5" font-family="JetBrains Mono" fill="${C.dead}">소진(StopIteration)</text>`;
    return g;
  }

  // ---- 제너레이터 프레임 (일시정지 상태) ----
  // genFrame(x,y,opts) opts:{lines:[str], at(현재 yield 줄 index), locals:[{k,v}], state('paused'|'running'|'done'), w}
  function genFrame(x, y, opts = {}) {
    const lines = opts.lines || [], w = opts.w || 230, lh = 20, at = opts.at == null ? -1 : opts.at;
    const h = 34 + lines.length * lh + (opts.locals ? 24 : 0);
    const stCol = opts.state === 'done' ? C.dead : (opts.state === 'running' ? C.good : C.hot);
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="var(--panel)" stroke="${stCol}" stroke-width="1.6"/>`;
    g += `<text x="${x + 12}" y="${y + 18}" font-size="10" font-family="JetBrains Mono" font-weight="700" fill="${stCol}">제너레이터 ${opts.state === 'done' ? '· 끝남' : opts.state === 'running' ? '· 실행중' : '· 멈춤(yield에서)'}</text>`;
    lines.forEach((ln, i) => {
      const ly = y + 30 + i * lh, here = (i === at);
      if (here) g += `<rect x="${x + 6}" y="${ly}" width="${w - 12}" height="${lh - 2}" rx="5" fill="${C.hot}" opacity="0.16"/>`;
      g += `<text x="${x + 24}" y="${ly + 14}" font-size="11" font-family="JetBrains Mono" fill="${here ? C.hot : C.ink}">${esc(ln)}</text>`;
      if (here) g += `<text x="${x + 12}" y="${ly + 14}" font-size="11" fill="${C.hot}">▸</text>`;
    });
    if (opts.locals) {
      const ly = y + 30 + lines.length * lh + 4;
      g += `<text x="${x + 12}" y="${ly + 12}" font-size="9.5" font-family="JetBrains Mono" fill="${C.faint}">기억된 상태: ${(opts.locals || []).map(l => esc(l.k) + '=' + esc(l.v)).join('  ')}</text>`;
    }
    return g;
  }

  // ---- 데코레이터 감싸기 ----
  // wrap(x,y,opts) opts:{inner(label), outer(label), before, after, w, h, active('in'|'inner'|'out')}
  function wrap(x, y, opts = {}) {
    const w = opts.w || 280, h = opts.h || 130, a = opts.active;
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="rgba(192,132,252,.06)" stroke="${C.v}" stroke-width="1.6"/>`;
    g += `<text x="${x + 14}" y="${y + 18}" font-size="10.5" font-family="JetBrains Mono" font-weight="700" fill="${C.v}">${esc(opts.outer || '감싼 함수(wrapper)')}</text>`;
    if (opts.before) g += `<text x="${x + w / 2}" y="${y + 38}" text-anchor="middle" font-size="10.5" font-family="JetBrains Mono" fill="${a === 'in' ? C.hot : C.muted}">▸ ${esc(opts.before)}</text>`;
    // inner
    const iw = w - 60, ih = 38, ix = x + 30, iy = y + 48;
    g += `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="10" fill="${a === 'inner' ? C.good : 'var(--panel)'}" opacity="${a === 'inner' ? 0.18 : 1}" stroke="${C.good}" stroke-width="1.6"/>`;
    g += `<text x="${ix + iw / 2}" y="${iy + ih / 2 + 4.5}" text-anchor="middle" font-size="12" font-family="JetBrains Mono" font-weight="700" fill="${C.good}">${esc(opts.inner || '원래 함수')}</text>`;
    if (opts.after) g += `<text x="${x + w / 2}" y="${y + h - 14}" text-anchor="middle" font-size="10.5" font-family="JetBrains Mono" fill="${a === 'out' ? C.hot : C.muted}">▸ ${esc(opts.after)}</text>`;
    return g;
  }

  // ---- 비교 카드 ----
  function card(x, y, w, title, rows, opts = {}) {
    const r = rows || [], h = opts.h || (28 + r.length * 18), col = opts.color || C.q;
    let g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="var(--panel)" stroke="${col}" stroke-width="1.6"/>`;
    g += `<text x="${x + 12}" y="${y + 19}" font-size="12" font-family="'Pretendard'" font-weight="700" fill="${col}">${esc(title)}</text>`;
    r.forEach((row, i) => { const ry = y + 36 + i * 18; g += `<text x="${x + 12}" y="${ry}" font-size="9.5" font-family="JetBrains Mono" fill="${C.muted}">${esc(row[0])}</text><text x="${x + w - 12}" y="${ry}" text-anchor="end" font-size="9.5" font-family="JetBrains Mono" fill="${C.ink}">${esc(row[1])}</text>`; });
    return g;
  }

  VZ.PY = { C, svg, rng, num, esc, codeLine, chip, arrow, nameLabel, objBox, ref, namespace, scopes, seq, genFrame, wrap, card, heat: AL.heatColor };
})(window);
