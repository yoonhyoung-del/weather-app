const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ICAL_URLS = [
  'https://calendar.google.com/calendar/ical/yoonhyoung%40gmail.com/private-d76d5f1d87fe89a39a80db438d3aaea1/basic.ics',
  'https://calendar.google.com/calendar/ical/potvcl6u09grq23hunpfne4a00%40group.calendar.google.com/private-534fe178151329fb53bb39d84243b518/basic.ics',
];
const PORT = 3000;

function todayKST() {
  const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function parseTime(dtstr, isUTC) {
  // dtstr 예: "20260417T080000" or "20260417T080000Z"
  const clean = dtstr.replace('Z', '');
  const h = parseInt(clean.substring(9, 11));
  const min = parseInt(clean.substring(11, 13));
  if (isUTC || dtstr.endsWith('Z')) {
    // UTC → KST (+9)
    const totalMin = h * 60 + min + 540;
    return { h: Math.floor(totalMin / 60) % 24, min: totalMin % 60 };
  }
  return { h, min };
}

function pad(n) { return String(n).padStart(2, '0'); }

function parseIcal(text, targetDate) {
  // iCal 줄 접기 처리
  text = text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');

  const events = [];
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  while ((match = veventRegex.exec(text)) !== null) {
    const block = match[1];

    const get = (key) => {
      const m = block.match(new RegExp(`${key}[^:\n]*:([^\n]+)`));
      return m ? m[1].trim() : null;
    };

    const summary = (get('SUMMARY') || '(제목 없음)').replace(/\\n/g, ' ').trim();
    const dtstart = get('DTSTART');
    const dtend   = get('DTEND');
    if (!dtstart) continue;

    const isAllDay = !dtstart.includes('T');
    const dateStr  = dtstart.replace(/[TZ].*/, '').replace(/-/g, '').substring(0, 8);

    // 종일 이벤트는 날짜 비교, 시간 이벤트는 시작 날짜 기준
    const eventDate = isAllDay
      ? dateStr
      : dtstart.replace(/[TZ].*/, '').replace(/-/g, '').substring(0, 8);

    // UTC 이벤트는 날짜가 달라질 수 있어 KST 날짜로 보정
    if (!isAllDay && dtstart.endsWith('Z')) {
      const t = parseTime(dtstart, true);
      // 날짜 보정은 간단히 KST offset으로 처리
      const baseDate = new Date(
        parseInt(dtstart.substring(0, 4)),
        parseInt(dtstart.substring(4, 6)) - 1,
        parseInt(dtstart.substring(6, 8)),
        parseInt(dtstart.substring(9, 11)),
        parseInt(dtstart.substring(11, 13))
      );
      baseDate.setMinutes(baseDate.getMinutes() + 540); // UTC→KST
      const kstDate = `${baseDate.getFullYear()}${pad(baseDate.getMonth()+1)}${pad(baseDate.getDate())}`;
      if (kstDate !== targetDate) continue;
    } else {
      if (eventDate !== targetDate) continue;
    }

    let timeStr;
    if (isAllDay) {
      timeStr = '종일';
    } else {
      const s = parseTime(dtstart, false);
      const e = dtend ? parseTime(dtend, false) : null;
      timeStr = e
        ? `${pad(s.h)}:${pad(s.min)}–${pad(e.h)}:${pad(e.min)}`
        : `${pad(s.h)}:${pad(s.min)}`;
    }

    events.push({ summary, timeStr, allDay: isAllDay });
  }

  // 종일 이벤트 먼저, 이후 시간 순
  events.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return a.timeStr.localeCompare(b.timeStr);
  });

  return events;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.ics':  'text/calendar',
};

const server = http.createServer((req, res) => {
  if (req.url === '/api/calendar') {
    const target = todayKST();
    const fetches = ICAL_URLS.map(url => new Promise((resolve) => {
      https.get(url, (icsRes) => {
        let raw = '';
        icsRes.on('data', c => raw += c);
        icsRes.on('end', () => resolve(parseIcal(raw, target)));
      }).on('error', () => resolve([]));
    }));

    Promise.all(fetches).then(results => {
      const all = results.flat();
      all.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return a.timeStr.localeCompare(b.timeStr);
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(all));
    });
    return;
  }

  const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`✅ http://localhost:${PORT}`));
