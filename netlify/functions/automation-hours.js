// Tareas no esenciales: 19:00 inclusive a 02:00 exclusive, hora Argentina.
function localMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
}
function isAutomationActive(now = new Date()) {
  const minutes = localMinutes(now);
  return minutes < 120 || minutes >= 1140;
}
function openingGrace(maxMinutes, now = new Date()) {
  const minutes = localMinutes(now);
  return minutes >= 1140 && minutes < 1140 + maxMinutes;
}
function pausedResponse() {
  return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'Pausa automática 02:00–19:00 Argentina' }) };
}
module.exports = { localMinutes, isAutomationActive, openingGrace, pausedResponse };
