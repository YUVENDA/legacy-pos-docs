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

  /* Aktuell hervorgehobener Treffer fuer die Tastaturbedienung. */
  var auswahl = -1;

  function eintraege() {
    return kasten.querySelectorAll('a');
  }

  function markieren(n) {
    var a = eintraege();
    if (!a.length) { return; }
    if (n < 0) { n = a.length - 1; }
    if (n >= a.length) { n = 0; }
    for (var i = 0; i < a.length; i++) { a[i].classList.remove('gewaehlt'); }
    auswahl = n;
    a[n].classList.add('gewaehlt');
    a[n].scrollIntoView({ block: 'nearest' });
  }

  /*
    SUCHE. Drei Dinge ueber das einfache Filtern hinaus:

    1. IST DIE EINGABE EINE REINE ZAHL, wird nur gegen die Seiten-ID gesucht.
       Sie steht auf jeder Seite in der Herkunftszeile, und im Support nennt
       ein Kunde meist genau die. Bei genau einem Treffer springt die Suche
       direkt dorthin - tippen, Enter, da.

    2. GRUPPIERT NACH BUCH. Bei einem haeufigen Wort wie "gastro" liegen die
       Treffer ueber mehrere Buecher verstreut; die Zwischenzeile zeigt, wo der
       Schwerpunkt liegt, statt eine flache Liste von zwanzig Zeilen zu geben.

    3. TREFFERZAHL IMMER. Vorher stand sie erst ab dem 21. Treffer da
       ("N weitere") - gerade bei wenigen Treffern ist sie aber die eigentliche
       Antwort auf "gibt es dazu ueberhaupt etwas".
  */
  function suchen() {
    var frage = feld.value.trim();
    auswahl = -1;
    if (frage.length < 2) { kasten.hidden = true; kasten.innerHTML = ''; return; }

    laden(function () {
      var nurZahl = /^[0-9]+$/.test(frage);
      var treffer = [];
      var woerter = [];

      if (nurZahl) {
        var gesucht = parseInt(frage, 10);
        for (var n = 0; n < index.length; n++) {
          if (index[n].i === gesucht) { treffer.push({ e: index[n], p: 100 }); }
        }
        // Genau eine Seite traegt diese ID - dann nicht anzeigen, sondern hin.
        if (treffer.length === 1) {
          window.location.href = auf + treffer[0].e.u;
          return;
        }
      } else {
        woerter = flach(frage).split(/\s+/).filter(function (w) { return w.length > 1; });
        if (!woerter.length) { kasten.hidden = true; return; }

        for (var i = 0; i < index.length; i++) {
          var e = index[i];
          var roh = (e.t || '') + ' ' + (e.k || '') + ' ' + (e.x || '');
          var heu = flach(roh) + ' | ' + breit(roh);
          var titel = flach(e.t || '') + ' | ' + breit(e.t || '');
          var kap = flach(e.k || '') + ' | ' + breit(e.k || '');
          var alle = true, punkte = 0;
          for (var j = 0; j < woerter.length; j++) {
            var w = woerter[j];
            var wb = breit(w);
            if (heu.indexOf(w) < 0 && heu.indexOf(wb) < 0) { alle = false; break; }
            /* Feiner als vorher (Titel 10, sonst 1): ein Titel, der MIT dem
               Wort beginnt, ist fast immer die gesuchte Seite; ein Treffer im
               Buch- oder Kapitelnamen ist mehr wert als einer irgendwo im
               Text. */
            if (titel.indexOf(w) === 0 || titel.indexOf(wb) === 0) { punkte += 40; }
            else if (titel.indexOf(w) >= 0 || titel.indexOf(wb) >= 0) { punkte += 20; }
            else if (kap.indexOf(w) >= 0 || kap.indexOf(wb) >= 0) { punkte += 5; }
            else { punkte += 1; }
          }
          if (alle) { treffer.push({ e: e, p: punkte }); }
        }
      }

      if (!treffer.length) {
        kasten.innerHTML = '<div class="leer">'
          + (nurZahl ? 'Keine Seite mit der ID ' + schuetzen(frage)
                     : 'Keine Treffer fuer \u201E' + schuetzen(frage) + '\u201C')
          + '</div>';
        kasten.hidden = false;
        return;
      }

      treffer.sort(function (a, b) { return b.p - a.p; });
      var gezeigt = treffer.slice(0, 20);

      var h = '<div class="suchzahl">' + treffer.length + ' Treffer'
            + (treffer.length > 20 ? ' \u2013 die 20 besten' : '') + '</div>';

      /*
        ECHT NACH BUCH GRUPPIEREN.

        Der Buchname ist das Stueck vor dem ersten Trennzeichen in
        "Buch > Kapitel". Jedes Buch erscheint GENAU EINMAL, und die Gruppen
        stehen in der Reihenfolge ihres besten Treffers - nicht alphabetisch,
        sonst stuende die wichtigste unten.

        Der erste Versuch fasste nur aufeinanderfolgende Zeilen zusammen. Weil
        die Liste nach Punkten sortiert ist, wechseln die Buecher dabei hin und
        her: bei "gastro" erschienen "Loesungen" und "Produkte" je zweimal
        (03.09.2026 gemessen). Damit war der Zweck der Gruppierung verfehlt -
        sie soll ja zeigen, wo der Schwerpunkt liegt.
      */
      var gruppen = [];
      var nachName = {};
      gezeigt.forEach(function (t) {
        var name = ((t.e.k || '').split('\u203A')[0] || '').trim() || '\u2013';
        if (!nachName[name]) {
          nachName[name] = { name: name, zeilen: [] };
          gruppen.push(nachName[name]);   // Reihenfolge = bester Treffer zuerst
        }
        nachName[name].zeilen.push(t);
      });

      gruppen.forEach(function (g) {
        h += '<div class="suchgruppe">' + schuetzen(g.name)
           + '<span class="suchgruppe-zahl">' + g.zeilen.length + '</span></div>';
        g.zeilen.forEach(function (t) {
          var e = t.e;
          var unter = (e.k || '').split('\u203A').slice(1).join('\u203A').trim();
          h += '<a href="' + auf + e.u + '">'
             + '<span class="titel">' + schuetzen(e.t) + '</span>'
             + (unter ? '<span class="kap"> \u00B7 ' + schuetzen(unter) + '</span>' : '')
             + (nurZahl ? '<span class="kap"> \u00B7 ID ' + e.i + '</span>' : '')
             + (woerter.length ? '<div class="aus">' + ausschnitt(e.x || '', woerter) + '</div>' : '')
             + '</a>';
        });
      });

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

  /*
    TASTATURBEDIENUNG. Vorher liess sich die Trefferliste nur mit der Maus
    benutzen - Escape war die einzige Taste. Wer den ganzen Tag sucht, will
    tippen, mit den Pfeiltasten waehlen und mit Enter oeffnen.
  */
  feld.addEventListener('keydown', function (ev) {
    var offen = !kasten.hidden && eintraege().length > 0;

    if (ev.key === 'Escape') { kasten.hidden = true; feld.blur(); return; }

    if (ev.key === 'ArrowDown' && offen) {
      ev.preventDefault();          // sonst springt der Textzeiger ans Ende
      markieren(auswahl + 1);
      return;
    }
    if (ev.key === 'ArrowUp' && offen) {
      ev.preventDefault();
      markieren(auswahl - 1);
      return;
    }
    if (ev.key === 'Enter' && offen) {
      var a = eintraege();
      // Ohne Auswahl gilt der erste Treffer - das ist fast immer der gesuchte.
      var ziel = a[auswahl >= 0 ? auswahl : 0];
      if (ziel) { ev.preventDefault(); window.location.href = ziel.getAttribute('href'); }
      return;
    }
  });

  /* Zeigen mit der Maus hebt die Tastaturauswahl auf, sonst saehen zwei
     Zeilen gleichzeitig hervorgehoben aus. */
  kasten.addEventListener('mousemove', function () {
    if (auswahl < 0) { return; }
    var a = eintraege();
    for (var i = 0; i < a.length; i++) { a[i].classList.remove('gewaehlt'); }
    auswahl = -1;
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
