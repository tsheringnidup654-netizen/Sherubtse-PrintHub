/* QR scanning for order collection (uses the browser's BarcodeDetector + camera; falls back to manual entry). */
(function () {
  'use strict';
  const startBtn = document.getElementById('scan-start');
  if (!startBtn) return;
  const stopBtn = document.getElementById('scan-stop');
  const video = document.getElementById('scan-video');
  const box = document.getElementById('scan-box');
  const note = document.getElementById('scan-note');
  let stream = null, raf = null;

  if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
    startBtn.disabled = true;
    note.textContent = 'Camera scanning is not supported in this browser. Scan the QR with your phone camera (it opens the collection page) or type the order number below.';
    return;
  }
  const detector = new BarcodeDetector({ formats: ['qr_code'] });

  function stop() {
    cancelAnimationFrame(raf);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; box.hidden = true; startBtn.hidden = false; stopBtn.hidden = true;
  }

  async function loop() {
    if (!stream) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        const value = codes[0].rawValue;
        stop();
        window.location.href = '/admin/collect?q=' + encodeURIComponent(value);
        return;
      }
    } catch (_) { /* keep scanning */ }
    raf = requestAnimationFrame(loop);
  }

  startBtn.addEventListener('click', async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream; await video.play();
      box.hidden = false; startBtn.hidden = true; stopBtn.hidden = false;
      loop();
    } catch (_) { window.PrintHub.toast('danger', 'Could not access the camera. Check browser permissions.'); }
  });
  stopBtn.addEventListener('click', stop);
})();
