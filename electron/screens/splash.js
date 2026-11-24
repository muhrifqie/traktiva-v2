const status = document.getElementById("status");
window.traktiva.onStatus((s) => {
  if (s.text) status.textContent = s.text;
  if (s.version) document.getElementById("version").textContent = `v${s.version}`;
});
