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

/*
  AKTUELLEN ABSCHNITT IN DER RECHTEN SPALTE MARKIEREN.

  Die Ueberschriftenliste stand vorher unbeweglich da: man scrollte durch eine
  Referenzseite und sah nicht, wo man ist. Jetzt wandert die Markierung mit,
  und die Liste scrollt den markierten Eintrag in ihren sichtbaren Bereich.

  WARUM KEIN IntersectionObserver: der erste Versuch beobachtete ein Band von
  der Kopfleiste bis 30 % Fensterhoehe. Auf Referenzseiten liegen die
  Ueberschriften weit auseinander - meist war KEINE im Band, und weil ein
  Observer nur bei Uebergaengen meldet, blieb die Liste unmarkiert.
  Stattdessen die einfache, immer eindeutige Regel: markiert wird die LETZTE
  Ueberschrift oberhalb der Lesekante. Das ergibt an jeder Scrollposition genau
  einen Treffer, auch ganz oben und ganz unten.

  WARUM KEIN decodeURIComponent auf der Kennung: BookStack legt Anker wie
  "bkmrk-artikel%2C-warengruppe" an - das Prozentzeichen ist TEIL der Kennung,
  nicht ihre Kodierung. Dekodieren machte daraus "bkmrk-artikel,-warengruppe",
  und getElementById fand nichts mehr (03.09.2026: 2 von 5 Proben tot).
*/
(function () {
  var liste = document.querySelector('.seiteninhalt');
  if (!liste) { return; }

  var paare = [];
  Array.prototype.forEach.call(liste.querySelectorAll('a[href^="#"]'), function (a) {
    var roh = a.getAttribute('href').slice(1);
    // erst wie geschrieben, dann dekodiert - in dieser Reihenfolge
    var kopf = document.getElementById(roh);
    if (!kopf) {
      try { kopf = document.getElementById(decodeURIComponent(roh)); } catch (e) { kopf = null; }
    }
    if (kopf) { paare.push({ a: a, kopf: kopf }); }
  });
  if (!paare.length) { return; }

  var LESEKANTE = 110;   // etwas unter der klebenden Kopfleiste
  var aktiv = null;
  var geplant = false;

  function pruefen() {
    geplant = false;
    var treffer = paare[0];
    for (var i = 0; i < paare.length; i++) {
      if (paare[i].kopf.getBoundingClientRect().top <= LESEKANTE) { treffer = paare[i]; }
      else { break; }
    }
    if (treffer === aktiv) { return; }
    if (aktiv) { aktiv.a.classList.remove('aktuell'); }
    aktiv = treffer;
    aktiv.a.classList.add('aktuell');
    // Nur nachziehen, wenn der Eintrag ausserhalb des Sichtfensters der Liste
    // liegt - sonst ruckelt sie bei jedem Abschnitt.
    var lr = liste.parentElement.getBoundingClientRect();
    var ar = aktiv.a.getBoundingClientRect();
    if (ar.top < lr.top || ar.bottom > lr.bottom) {
      aktiv.a.scrollIntoView({ block: 'nearest' });
    }
  }

  function anstossen() {
    if (geplant) { return; }
    geplant = true;
    window.requestAnimationFrame(pruefen);
  }

  window.addEventListener('scroll', anstossen, { passive: true });
  window.addEventListener('resize', anstossen);
  pruefen();
})();

/*
  KOPIERKNOPF AM CODEFELD.

  Der Knopf steht im HTML, ist per CSS aber verborgen und wird hier
  freigeschaltet ("kann"). So sieht niemand eine Schaltflaeche, die ohne
  JavaScript nichts tun wuerde - und wer JS abgeschaltet hat, sieht den Code
  trotzdem vollstaendig und eingefaerbt, weil die Farben beim Erzeugen
  entstehen und nicht hier.

  navigator.clipboard braucht einen sicheren Kontext (https oder localhost).
  Auf GitHub Pages ist das gegeben; wo nicht, bleibt der Knopf weg, statt beim
  Klicken ins Leere zu laufen.
*/
(function () {
  if (!navigator.clipboard || !window.isSecureContext) { return; }

  Array.prototype.forEach.call(document.querySelectorAll('.codefeld'), function (feld) {
    var knopf = feld.querySelector('.codefeld-kopieren');
    var code = feld.querySelector('pre code');
    if (!knopf || !code) { return; }
    knopf.classList.add('kann');

    knopf.addEventListener('click', function () {
      navigator.clipboard.writeText(code.textContent).then(function () {
        var vorher = knopf.textContent;
        knopf.textContent = 'Kopiert';
        knopf.classList.add('fertig');
        window.setTimeout(function () {
          knopf.textContent = vorher;
          knopf.classList.remove('fertig');
        }, 1600);
      }).catch(function () {
        knopf.textContent = 'Ging nicht';
        window.setTimeout(function () { knopf.textContent = 'Kopieren'; }, 1600);
      });
    });
  });
})();
