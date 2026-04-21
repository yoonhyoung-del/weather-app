const https = require('https');

const ICAL_URLS = [
  'https://calendar.google.com/calendar/ical/yoonhyoung%40gmail.com/private-d76d5f1d87fe89a39a80db438d3aaea1/basic.ics',
  'https://calendar.google.com/calendar/ical/potvcl6u09grq23hunpfne4a00%40group.calendar.google.com/private-534fe178151329fb53bb39d84243b518/basic.ics',
];

function todayKST() {
  const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, '0');
  const d = String(kst.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function parseTime(dtstr) {
  const clean = dtstr.replace('Z', '');
  let h = parseInt(clean.substring(9, 11));
  let min = parseInt(clean.substring(11, 13));
  if (dtstr.endsWith('Z')) {
    const totalMin = h * 60 + min + 540;
    return { h: Math.floor(totalMin / 60) % 24, min: totalMin % 60 };
  }
  return { h, min };
}

function parseIcal(text, targetDate) {
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

    if (isAllDay) {
      if (dateStr !== targetDate) continue;
    } else if (dtstart.endsWith('Z')) {
      const baseDate = new Date(
        parseInt(dtstart.substring(0, 4)),
        parseInt(dtstart.substring(4, 6)) - 1,
        parseInt(dtstart.substring(6, 8)),
        parseInt(dtstart.substring(9, 11)),
        parseInt(dtstart.substring(11, 13))
      );
      baseDate.setMinutes(baseDate.getMinutes() + 540);
      const kstDate = `${baseDate.getFullYear()}${pad(baseDate.getMonth()+1)}${pad(baseDate.getDate())}`;
      if (kstDate !== targetDate) continue;
    } else {
      if (dateStr !== targetDate) continue;
    }

    let timeStr;
    if (isAllDay) {
      timeStr = '종일';
    } else {
      const s = parseTime(dtstart);
      const e = dtend ? parseTime(dtend) : null;
      timeStr = e
        ? `${pad(s.h)}:${pad(s.min)}–${pad(e.h)}:${pad(e.min)}`
        : `${pad(s.h)}:${pad(s.min)}`;
    }
    events.push({ summary, timeStr, allDay: isAllDay });
  }
  events.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return a.timeStr.localeCompare(b.timeStr);
  });
  return events;
}

function fetchIcal(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(raw));
    }).on('error', () => resolve(''));
  });
}

module.exports = async (req, res) => {
  const target = todayKST();
  const raws = await Promise.all(ICAL_URLS.map(fetchIcal));
  const all = raws.flatMap(raw => parseIcal(raw, target));
  all.sort((a, b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return a.timeStr.localeCompare(b.timeStr);
  });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(all);
};
