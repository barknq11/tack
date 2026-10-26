// Prayer times, calculated offline from the sun's position (standard astronomical formulas).
// Usage: PrayerTimes.compute(date, { lat, lng, tz, method, asr, adjust }) → times as minutes after local midnight.
//   method: one of PrayerTimes.METHODS keys; asr: 'shafii' | 'hanafi';
//   adjust: { fajr, sunrise, dhuhr, asr, maghrib, isha } extra minutes, to match a mosque's timetable exactly.
(function (root) {
  'use strict';
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const sin = d => Math.sin(rad(d)), cos = d => Math.cos(rad(d)), tan = d => Math.tan(rad(d));
  const asin = x => deg(Math.asin(x)), acos = x => deg(Math.acos(Math.max(-1, Math.min(1, x))));
  const atan2 = (y, x) => deg(Math.atan2(y, x)), acot = x => deg(Math.atan(1 / x));
  const fix = (a, b) => { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; };

  // fajr/isha: sun angle below the horizon; ishaMin: Isha this many minutes after Maghrib instead;
  // maghrib: angle for Maghrib (otherwise sunset); maghribMin: minutes after sunset
  const METHODS = {
    mwl:     { name: 'Muslim World League (common in Iraq)', fajr: 18, isha: 17 },
    egypt:   { name: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
    makkah:  { name: 'Umm al-Qura, Makkah', fajr: 18.5, ishaMin: 90 },
    karachi: { name: 'University of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
    isna:    { name: 'ISNA (North America)', fajr: 15, isha: 15 },
    jafari:  { name: 'Ja\'fari (Shia Endowment, Leva Institute)', fajr: 16, isha: 14, maghrib: 4 },
    tehran:  { name: 'Institute of Geophysics, Tehran', fajr: 17.7, isha: 14, maghrib: 4.5 },
  };
  const NAMES = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
  }
  function sun(jd) {
    const D = jd - 2451545.0;
    const g = fix(357.529 + 0.98560028 * D, 360);
    const q = fix(280.459 + 0.98564736 * D, 360);
    const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
    const e = 23.439 - 0.00000036 * D;
    const ra = atan2(cos(e) * sin(L), cos(L)) / 15;
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(ra, 24) };
  }

  function compute(date, opts) {
    const { lat, lng } = opts;
    const tz = opts.tz != null ? opts.tz : -date.getTimezoneOffset() / 60;
    const m = METHODS[opts.method] || METHODS.mwl;
    const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
    const noon = t => fix(12 - sun(jd + t / 24).eqt, 24);
    const angleTime = (angle, t, before) => {
      const { decl } = sun(jd + t / 24);
      const h = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
      return noon(t) + (before ? -h : h);
    };
    const asrTime = (factor, t) => {
      const { decl } = sun(jd + t / 24);
      return angleTime(-acot(factor + tan(Math.abs(lat - decl))), t);
    };
    // Start from rough guesses (hours) and refine twice, since the sun moves during the day
    let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
    for (let i = 0; i < 2; i++) {
      t = {
        fajr: angleTime(m.fajr, t.fajr, true),
        sunrise: angleTime(0.833, t.sunrise, true),
        dhuhr: noon(t.dhuhr),
        asr: asrTime(opts.asr === 'hanafi' ? 2 : 1, t.asr),
        sunset: angleTime(0.833, t.sunset),
        maghrib: m.maghrib ? angleTime(m.maghrib, t.maghrib) : angleTime(0.833, t.sunset),
        isha: m.isha != null ? angleTime(m.isha, t.isha) : t.isha,
      };
    }
    t.dhuhr += 1 / 60; // the usual precaution: Dhuhr a minute after the sun's highest point
    if (m.maghribMin) t.maghrib = t.sunset + m.maghribMin / 60;
    if (m.ishaMin) t.isha = t.maghrib + m.ishaMin / 60;
    const adjust = opts.adjust || {};
    const out = {};
    for (const n of NAMES) {
      const hours = t[n] + tz - lng / 15;
      out[n] = Math.round(hours * 60) + (Number(adjust[n]) || 0); // minutes after local midnight
    }
    return out;
  }
  const fmt = (min, h12) => {
    const h = Math.floor(min / 60) % 24, mm = String(((min % 60) + 60) % 60).padStart(2, '0');
    return h12 ? `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:${mm}`;
  };

  root.PrayerTimes = { compute, METHODS, NAMES, fmt };
})(typeof window !== 'undefined' ? window : globalThis);
