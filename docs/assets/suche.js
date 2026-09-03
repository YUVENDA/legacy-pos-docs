/* Volltextsuche fuer den statischen Partner-Export.
 *
 * Laeuft vollstaendig im Browser: der Index (assets/suchindex.json) wird beim
 * ersten Tastendruck einmal geladen, danach wird nur noch gefiltert. Keine
 * Fremdbibliothek, kein CDN, kein Server - damit funktioniert die Suche auf
 * jedem Webspace und auch offline aus dem Dateisystem.
 *
 * Gesucht wird in Titel, Kapitelname und Volltext. Alle eingegebenen Woerter
 * muessen vorkommen (UND-Verknuepfung), Reihenfolge egal.
 */
(function () {
  'use strict';

  var feld = document.getElementById('suchfeld');
  var kasten = document.getElementById('suchergebnis');
  if (!feld || !kasten) { return; }

  var auf = feld.getAttribute('data-auf') || '';
  var index = null;
  var laedt = false;

  function laden(dann) {
    if (index) { dann(); return; }
    if (laedt) { return; }
    laedt = true;
    var anfrage = new XMLHttpRequest();
    anfrage.open('GET', auf + 'assets/suchindex.json', true);
    anfrage.onload = function () {
      try { index = JSON.parse(anfrage.responseText); } catch (e) { index = []; }
      laedt = false;
      dann();
    };
    anfrage.onerror = function () { index = []; laedt = false; dann(); };
    anfrage.send();
  }

  /* Zwei Normalformen, weil beide Schreibweisen ueblich sind:
     "flach" ersetzt Umlaute durch den Grundbuchstaben (Kueche -> kuche),
     "breit" durch die Umschrift (Kueche -> kueche). Der Suchtext wird in
     BEIDEN Formen durchsucht - so findet sowohl "kuchenmonitor" als auch
     "kuechenmonitor" die Seite "Küchenmonitor". */
  function flach(s) {
    return s.toLowerCase()
      .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  }
  function breit(s) {
    return s.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  }

  function schuetzen(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function ausschnitt(text, woerter) {
    var normalisiert = flach(text);
    var pos = -1;
    for (var i = 0; i < woerter.length; i++) {
      var p = normalisiert.indexOf(woerter[i]);
      if (p >= 0 && (pos < 0 || p < pos)) { pos = p; }
    }
    if (pos < 0) { return ''; }
    var von = Math.max(0, pos - 45);
    var teil = text.substr(von, 150);
    if (von > 0) { teil = '…' + teil; }
    if (von + 150 < text.length) { teil = teil + '…'; }
    teil = schuetzen(teil);
    // Treffer hervorheben, laengste Woerter zuerst
    woerter.slice().sort(function (a, b) { return b.length - a.length; }).forEach(function (w) {
      if (w.length < 2) { return; }
      teil = teil.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'),
                          '<mark>$1</mark>');
    });
    return teil;
  }

  function suchen() {
    var frage = feld.value.trim();
    if (frage.length < 2) { kasten.hidden = true; kasten.innerHTML = ''; return; }
    laden(function () {
      var woerter = flach(frage).split(/\s+/).filter(function (w) { return w.length > 1; });
      if (!woerter.length) { kasten.hidden = true; return; }

      var treffer = [];
      for (var i = 0; i < index.length; i++) {
        var e = index[i];
        var roh = (e.t || '') + ' ' + (e.k || '') + ' ' + (e.x || '');
        var heu = flach(roh) + ' | ' + breit(roh);
        var titel = flach(e.t || '') + ' | ' + breit(e.t || '');
        var alle = true, punkte = 0;
        for (var j = 0; j < woerter.length; j++) {
          var w = woerter[j];
          if (heu.indexOf(w) < 0 && heu.indexOf(breit(w)) < 0) { alle = false; break; }
          // Treffer im Titel wiegen schwerer
          if (titel.indexOf(w) >= 0 || titel.indexOf(breit(w)) >= 0) { punkte += 10; }
          else { punkte += 1; }
        }
        if (alle) { treffer.push({ e: e, p: punkte }); }
      }
      treffer.sort(function (a, b) { return b.p - a.p; });

      if (!treffer.length) {
        kasten.innerHTML = '<div class="leer">Keine Treffer für „' + schuetzen(frage) + '"</div>';
        kasten.hidden = false;
        return;
      }

      var h = '';
      treffer.slice(0, 20).forEach(function (t) {
        var e = t.e;
        h += '<a href="' + auf + e.u + '">'
           + '<span class="titel">' + schuetzen(e.t) + '</span>'
           + (e.k ? '<span class="kap"> · ' + schuetzen(e.k) + '</span>' : '')
           + '<div class="aus">' + ausschnitt(e.x || '', woerter) + '</div>'
           + '</a>';
      });
      if (treffer.length > 20) {
        h += '<div class="leer">' + (treffer.length - 20) + ' weitere Treffer – Suche verfeinern</div>';
      }
      kasten.innerHTML = h;
      kasten.hidden = false;
    });
  }

  var bremse = null;
  feld.addEventListener('input', function () {
    clearTimeout(bremse);
    bremse = setTimeout(suchen, 120);
  });
  feld.addEventListener('focus', function () { if (feld.value.trim().length > 1) { suchen(); } });

  // Escape schliesst, Klick daneben schliesst
  feld.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { kasten.hidden = true; feld.blur(); }
  });
  document.addEventListener('click', function (ev) {
    if (!kasten.contains(ev.target) && ev.target !== feld) { kasten.hidden = true; }
  });
})();
