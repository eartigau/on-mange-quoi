/* ═══════════════════════════════════════════════════════════════════════
   On mange quoi ? Logique de la page.

   Tout se passe dans le navigateur : les trois YAML sont lus au chargement,
   les filtres et la compilation de la liste sont en mémoire, le PDF est
   fabriqué côté client. Le serveur local (on-mange-quoi.py) n'est là que
   pour réécrire les YAML quand on édite depuis l'onglet « Gérer ». Sans lui,
   la page fonctionne pareil, elle propose juste de télécharger les fichiers
   au lieu de les enregistrer.
   ═══════════════════════════════════════════════════════════════════════ */

'use strict';

const E = (id) => document.getElementById(id);

const D = {
  meta: null,          // contenu de meta.yaml
  recettes: [],        // liste des recettes
  rayonDe: {},         // ingrédient -> id de rayon
  choisies: new Set(), // noms des recettes cochées
  dejaLa: new Set(),   // ingrédients qu'on a déjà, écartés de la liste finale
  filtres: new Set(),  // tags actifs
  recherche: '',
  ecriture: false,     // vrai si le serveur local peut écrire les YAML
  editee: null,        // nom de la recette en cours d'édition, ou null
};

const CLE_STOCKAGE = 'on-mange-quoi/choisies';
const CLE_ECONOME = 'on-mange-quoi/pdf-econome';
const CLE_DEJA = 'on-mange-quoi/deja-la';
const RAYON_DEFAUT = 'autre';

/* ─────────────────────────────────────────────────── petits utilitaires ── */

/** Minuscules sans accents, pour comparer et chercher sans se battre. */
function pliage(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Tri alphabétique français, insensible aux accents et à la casse. */
const collateur = new Intl.Collator('fr', { sensitivity: 'base' });
const triFr = (a, b) => collateur.compare(a, b);

function creer(balise, classe, texte) {
  const n = document.createElement(balise);
  if (classe) n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

let minuteurToast = null;
function toast(message, erreur) {
  const t = E('toast');
  t.textContent = message;
  t.classList.toggle('toast-erreur', !!erreur);
  t.hidden = false;
  clearTimeout(minuteurToast);
  minuteurToast = setTimeout(() => { t.hidden = true; }, erreur ? 6000 : 3000);
}

/* Les rayons se voient attribuer une couleur à tour de rôle : la liste est
   plus rigolote à lire et on repère son rayon d'un coup d'œil. */
const TEINTES = ['#6f9a3f', '#e4572e', '#f4ac1a', '#a3468c', '#3d9bb5', '#c9701f'];

/** Petite pluie de confettis. Sautée si la personne préfère moins d'animation. */
function confettis(nombre) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < (nombre || 34); i++) {
    const c = creer('div', 'confetti');
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = TEINTES[i % TEINTES.length];
    c.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
    c.style.animationDuration = (1.3 + Math.random() * 0.9).toFixed(2) + 's';
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 2600);
  }
}

function dateLongue(d) {
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function dateCourte(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function telecharger(nomFichier, texte, type) {
  const blob = new Blob([texte], { type: (type || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ─────────────────────────────────────────────────────── porte d'entrée ──
   En ligne, la page demande un mot de passe avant de s'afficher.

   Soyons clairs sur ce que ça vaut : ce n'est PAS une serrure. Le site est un
   paquet de fichiers statiques, la vérification se fait ici même, dans du
   JavaScript que n'importe qui peut lire, et les YAML restent téléchargeables
   à leur adresse directe sans jamais passer par cette page. C'est l'écriteau
   « chez nous » sur la porte du chalet, pas un verrou. Rien de confidentiel ne
   doit atterrir dans ce dépôt en comptant là-dessus.

   À la maison (serveur local), la porte ne s'affiche pas du tout.
*/

const CLE_ENTREE = 'on-mange-quoi/entree';
// Empreinte djb2 du mot de passe, histoire de ne pas l'écrire en toutes
// lettres dans le fichier. Ça ne protège rien de plus, ça évite juste de le
// lire d'un coup d'œil.
const EMPREINTE_MDP = 0x597d06f8;

function empreinte(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h;
}

function surMachineLocale() {
  return ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname);
}

function dejaEntre() {
  try { return localStorage.getItem(CLE_ENTREE) === '1'; } catch (e) { return false; }
}

/** Résout quand on a le droit d'entrer. Immédiat à la maison. */
function passerLaPorte() {
  return new Promise((resolve) => {
    if (surMachineLocale() || dejaEntre()) return resolve();

    const porte = E('porte');
    porte.hidden = false;
    document.body.style.overflow = 'hidden';
    E('motDePasse').focus();

    E('formPorte').addEventListener('submit', (e) => {
      e.preventDefault();
      const saisie = E('motDePasse').value.trim().toLowerCase();
      if (empreinte(saisie) !== EMPREINTE_MDP) {
        E('porteRate').hidden = false;
        E('motDePasse').value = '';
        E('motDePasse').focus();
        // On relance l'animation de refus à chaque essai raté.
        porte.classList.remove('porte-secoue');
        void porte.offsetWidth;
        porte.classList.add('porte-secoue');
        return;
      }
      try { localStorage.setItem(CLE_ENTREE, '1'); } catch (err) { /* tant pis */ }
      porte.hidden = true;
      document.body.style.overflow = '';
      resolve();
    });
  });
}

/* ─────────────────────────────────────────────────────────── chargement ── */

async function lireYaml(chemin) {
  const r = await fetch(chemin + '?v=' + Date.now());
  if (!r.ok) throw new Error(`${chemin} : ${r.status}`);
  return jsyaml.load(await r.text()) || {};
}

async function charger() {
  const [meta, recettes, ingredients] = await Promise.all([
    lireYaml('data/meta.yaml'),
    lireYaml('data/recettes.yaml'),
    lireYaml('data/ingredients.yaml'),
  ]);

  D.meta = meta;
  D.meta.rayons = meta.rayons || [];
  D.meta.facettes = meta.facettes || [];
  D.recettes = (recettes.recettes || []).map(normaliserRecette);
  D.rayonDe = ingredients.rayons_par_ingredient || {};

  // Le rayon « à classer » doit toujours exister, c'est le filet de sécurité.
  if (!D.meta.rayons.some((r) => r.id === RAYON_DEFAUT)) {
    D.meta.rayons.push({ id: RAYON_DEFAUT, nom: 'À classer', icone: '❓' });
  }
}

function normaliserRecette(r) {
  return {
    nom: String(r.nom || '').trim(),
    tags: (r.tags || []).map((t) => String(t).trim()).filter(Boolean),
    portions: Number(r.portions) || null,
    ingredients: (r.ingredients || []).map((i) => String(i).trim()).filter(Boolean),
    note: r.note ? String(r.note).trim() : '',
  };
}

/** Le serveur local répond à cette adresse ; en ligne, elle n'existe pas. */
async function detecterMode() {
  try {
    const r = await fetch('api/etat', { cache: 'no-store' });
    if (r.ok) D.ecriture = !!(await r.json()).ecriture;
  } catch (e) {
    D.ecriture = false;
  }
  const pastille = E('modePill');
  pastille.textContent = D.ecriture ? '● serveur local' : '○ lecture seule';
  pastille.classList.toggle('mode-local', D.ecriture);
  // L'onglet « Gérer » n'est peut-être pas encore ouvert : on fige tout de
  // suite l'état du bouton d'enregistrement plutôt que d'attendre son rendu.
  E('btnSauver').disabled = !D.ecriture;
  pastille.title = D.ecriture
    ? 'Le serveur local tourne : les modifications sont écrites directement dans les YAML.'
    : "Page servie sans le serveur local : les modifications se récupèrent en téléchargeant les YAML.";
}

/* ────────────────────────────────────────────────────── choix et filtres ── */

function facettesEffectives() {
  const listees = new Set();
  const facettes = D.meta.facettes.map((f) => {
    (f.tags || []).forEach((t) => listees.add(t));
    return { nom: f.nom, tags: f.tags || [] };
  });
  const orphelins = new Set();
  D.recettes.forEach((r) => r.tags.forEach((t) => { if (!listees.has(t)) orphelins.add(t); }));
  if (orphelins.size) {
    facettes.push({ nom: 'Autres tags', tags: [...orphelins].sort(triFr) });
  }
  return facettes;
}

function recettesFiltrees() {
  const q = pliage(D.recherche.trim());
  const groupes = facettesEffectives()
    .map((f) => f.tags.filter((t) => D.filtres.has(t)))
    .filter((g) => g.length);

  return D.recettes.filter((r) => {
    // Dans une facette les tags s'additionnent (OU), entre facettes ils se
    // cumulent (ET) : « soupe OU salade » ET « végétarien ».
    for (const g of groupes) {
      if (!g.some((t) => r.tags.includes(t))) return false;
    }
    if (q) {
      const foin = pliage(r.nom + ' ' + r.tags.join(' ') + ' ' + r.ingredients.join(' '));
      if (!foin.includes(q)) return false;
    }
    return true;
  });
}

function basculerRecette(nom) {
  if (D.choisies.has(nom)) D.choisies.delete(nom);
  else D.choisies.add(nom);
  memoriserChoix();
  rendreChoisir();
}

function memoriserChoix() {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify([...D.choisies]));
  } catch (e) { /* navigation privée : tant pis, on ne mémorise pas */ }
}

function memoriserDeja() {
  try {
    localStorage.setItem(CLE_DEJA, JSON.stringify([...D.dejaLa]));
  } catch (e) { /* navigation privée : tant pis */ }
}

function relireDeja() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_DEJA) || '[]');
    // On ne garde que les ingrédients qui existent encore quelque part, sinon
    // la liste enfle indéfiniment au fil des recettes supprimées.
    const connus = new Set(ingredientsUtilises());
    brut.filter((i) => connus.has(i)).forEach((i) => D.dejaLa.add(i));
  } catch (e) { /* rien à relire */ }
}

function relireChoix() {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '[]');
    const connus = new Set(D.recettes.map((r) => r.nom));
    brut.filter((n) => connus.has(n)).forEach((n) => D.choisies.add(n));
  } catch (e) { /* rien à relire */ }
}

/* ─────────────────────────────────────────────── compilation de la liste ── */

/**
 * Regroupe les ingrédients des recettes cochées par rayon.
 * Renvoie [{rayon, articles:[{nom, sources:[...]}]}, ...] dans l'ordre des
 * rayons de meta.yaml, rayons vides écartés.
 */
function compilerListe() {
  const parIngredient = new Map();
  const choisies = D.recettes.filter((r) => D.choisies.has(r.nom));

  choisies.forEach((r) => {
    r.ingredients.forEach((i) => {
      if (!parIngredient.has(i)) parIngredient.set(i, []);
      const sources = parIngredient.get(i);
      if (!sources.includes(r.nom)) sources.push(r.nom);
    });
  });

  const paquets = new Map();
  parIngredient.forEach((sources, nom) => {
    const rayon = D.rayonDe[nom] || RAYON_DEFAUT;
    if (!paquets.has(rayon)) paquets.set(rayon, []);
    paquets.get(rayon).push({ nom, sources });
  });

  const connus = new Set(D.meta.rayons.map((r) => r.id));
  const groupes = [];

  D.meta.rayons.forEach((rayon) => {
    const articles = paquets.get(rayon.id);
    if (articles && articles.length) {
      articles.sort((a, b) => triFr(a.nom, b.nom));
      groupes.push({ rayon, articles });
    }
  });

  // Un YAML modifié à la main peut pointer vers un rayon inconnu : on ne
  // perd pas l'ingrédient pour autant, on le sort à la fin.
  paquets.forEach((articles, id) => {
    if (connus.has(id)) return;
    articles.sort((a, b) => triFr(a.nom, b.nom));
    groupes.push({ rayon: { id, nom: id, icone: '❓' }, articles });
  });

  return groupes;
}

/**
 * La liste telle qu'elle part à l'épicerie : sans ce qu'on a déjà, et sans
 * les rayons devenus vides du coup.
 */
function listeAAcheter() {
  return compilerListe()
    .map(({ rayon, articles }) => ({ rayon, articles: articles.filter((a) => !D.dejaLa.has(a.nom)) }))
    .filter((g) => g.articles.length);
}

/* ───────────────────────────────────────────────────── rendu : filtres ─── */

function rendreFiltres() {
  const hote = E('facettes');
  hote.innerHTML = '';
  const visibles = recettesFiltrees();

  facettesEffectives().forEach((f) => {
    const bloc = creer('div', 'facette');
    bloc.appendChild(creer('p', 'facette-titre', f.nom));
    const pastilles = creer('div', 'pastilles');

    f.tags.forEach((tag) => {
      const actif = D.filtres.has(tag);
      // Un tag qui ne mènerait à rien est grisé, mais reste cliquable pour
      // pouvoir le décocher.
      const utile = actif || visibles.some((r) => r.tags.includes(tag));
      const etiquette = creer('label', 'pastille' + (actif ? ' is-on' : '') + (utile ? '' : ' is-vide'));
      const boite = creer('input');
      boite.type = 'checkbox';
      boite.checked = actif;
      boite.addEventListener('change', () => {
        if (boite.checked) D.filtres.add(tag); else D.filtres.delete(tag);
        rendreChoisir();
      });
      etiquette.appendChild(boite);
      etiquette.appendChild(document.createTextNode(tag));
      pastilles.appendChild(etiquette);
    });

    bloc.appendChild(pastilles);
    hote.appendChild(bloc);
  });

  const n = visibles.length;
  E('compteFiltre').textContent =
    `${n} repas sur ${D.recettes.length} · ${D.choisies.size} coché${D.choisies.size > 1 ? 's' : ''}`;
}

/* ───────────────────────────────────────────────────── rendu : recettes ── */

function rendreGrille() {
  const hote = E('grilleRecettes');
  hote.innerHTML = '';
  const visibles = recettesFiltrees();

  visibles.forEach((r) => {
    const coche = D.choisies.has(r.nom);
    const tuile = creer('label', 'tuile' + (coche ? ' is-on' : ''));
    // Volontairement dépouillé : le nom du plat, rien d'autre. Le détail
    // (tags, portions, ingrédients) se consulte dans l'onglet « Gérer ».
    tuile.title = `${r.portions ? r.portions + ' portions · ' : ''}${r.ingredients.length} ingrédients\n${r.tags.join(', ')}`;

    const boite = creer('input');
    boite.type = 'checkbox';
    boite.checked = coche;
    boite.addEventListener('change', () => basculerRecette(r.nom));
    tuile.appendChild(boite);
    tuile.appendChild(creer('span', 'tuile-nom', r.nom));

    hote.appendChild(tuile);
  });

  E('messageVide').hidden = visibles.length > 0;
}

/* ──────────────────────────────────────────────────────── rendu : liste ── */

function rendreListe() {
  const menu = E('menuChoisi');
  const hote = E('listeRayons');
  menu.innerHTML = '';
  hote.innerHTML = '';

  const choisies = D.recettes.filter((r) => D.choisies.has(r.nom));
  const vide = choisies.length === 0;
  const aAcheter = vide ? [] : listeAAcheter();
  const rienAAcheter = aAcheter.length === 0;

  E('listeVide').hidden = !vide;
  E('btnPdf').disabled = rienAAcheter;
  E('btnImprimer').disabled = rienAAcheter;
  E('btnCopier').disabled = rienAAcheter;
  if (vide) {
    E('toutRemettre').hidden = true;
    return;
  }

  const jetons = creer('div', 'menu-choisi');
  choisies.forEach((r) => {
    const jeton = creer('span', 'jeton');
    jeton.appendChild(document.createTextNode(r.nom));
    const x = creer('button', null, '×');
    x.type = 'button';
    x.title = 'Retirer du menu';
    x.addEventListener('click', () => basculerRecette(r.nom));
    jeton.appendChild(x);
    jetons.appendChild(jeton);
  });
  menu.appendChild(jetons);

  const groupes = compilerListe();
  const nbDeja = groupes.reduce(
    (n, g) => n + g.articles.filter((a) => D.dejaLa.has(a.nom)).length, 0);
  const bouton = E('toutRemettre');
  bouton.hidden = nbDeja === 0;
  bouton.textContent = `Tout remettre (${nbDeja})`;

  groupes.forEach(({ rayon, articles }, i) => {
    const bloc = creer('div', 'rayon');
    bloc.style.setProperty('--teinte', rayon.id === RAYON_DEFAUT ? '#b3341c' : TEINTES[i % TEINTES.length]);

    const restants = articles.filter((a) => !D.dejaLa.has(a.nom)).length;
    const titre = creer('h3', 'rayon-titre');
    titre.appendChild(creer('span', 'rayon-icone', rayon.icone || '•'));
    titre.appendChild(document.createTextNode(rayon.nom));
    titre.appendChild(creer('span', 'compte',
      restants === articles.length ? String(articles.length) : `${restants} / ${articles.length}`));
    bloc.appendChild(titre);

    const ul = creer('ul');
    articles.forEach((a) => {
      const deja = D.dejaLa.has(a.nom);
      const li = creer('li');
      const etiquette = creer('label', 'article' + (deja ? ' est-deja' : ''));
      etiquette.title = deja
        ? "On en a déjà, il ne part pas sur la liste. Cliquer pour l'y remettre."
        : "Sur la liste. Cliquer si on en a déjà à la maison.";

      const boite = creer('input');
      boite.type = 'checkbox';
      boite.checked = deja;
      boite.addEventListener('change', () => {
        if (boite.checked) D.dejaLa.add(a.nom);
        else D.dejaLa.delete(a.nom);
        memoriserDeja();
        rendreListe();
      });

      etiquette.appendChild(boite);
      etiquette.appendChild(creer('span', 'ingredient-nom', a.nom));
      etiquette.appendChild(creer('span', 'ingredient-source', a.sources.join(', ')));
      li.appendChild(etiquette);
      ul.appendChild(li);
    });
    bloc.appendChild(ul);
    hote.appendChild(bloc);
  });
}

function rendreChoisir() {
  rendreFiltres();
  rendreGrille();
  rendreListe();
  rendrePied();
}

function rendrePied() {
  const nonClasses = ingredientsUtilises().filter((i) => !D.rayonDe[i]).length;
  E('statsPied').textContent =
    `${D.recettes.length} repas · ${ingredientsUtilises().length} ingrédients` +
    (nonClasses ? ` · ${nonClasses} à classer` : '');
}

function ingredientsUtilises() {
  const s = new Set();
  D.recettes.forEach((r) => r.ingredients.forEach((i) => s.add(i)));
  return [...s].sort(triFr);
}

/* ──────────────────────────────────────────────────── sortie texte / PDF ── */

function listeEnTexte() {
  const choisies = D.recettes.filter((r) => D.choisies.has(r.nom));
  const lignes = [];
  lignes.push(`LISTE D'ÉPICERIE, ${dateLongue(new Date())}`);
  lignes.push('Au menu : ' + choisies.map((r) => r.nom).join(' · '));
  lignes.push('');
  listeAAcheter().forEach(({ rayon, articles }) => {
    lignes.push(rayon.nom.toUpperCase());
    articles.forEach((a) => {
      lignes.push(`  [ ] ${a.nom}  (${a.sources.join(', ')})`);
    });
    lignes.push('');
  });
  return lignes.join('\n');
}

/**
 * Fabrique le PDF : en-tête, rappel du menu, puis la liste sur deux colonnes
 * qui coulent d'une colonne à l'autre puis d'une page à l'autre.
 * Renvoie le document jsPDF ; c'est l'appelant qui décide de l'enregistrer.
 */
function construirePdf(options) {
  const eco = !!(options && options.monochrome);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const PAGE_L = 210, PAGE_H = 297, MARGE = 15, ECART = 9;
  const COL_L = (PAGE_L - 2 * MARGE - ECART) / 2;
  const BAS = PAGE_H - MARGE - 6;

  // En mode économe, tout passe au noir et au gris : aucun aplat de couleur,
  // aucun bandeau plein, l'imprimante ne dépense presque rien.
  const ENCRE = eco ? [0, 0, 0] : [60, 42, 30];
  const TOMATE = eco ? [0, 0, 0] : [228, 87, 46];
  const GRIS = eco ? [105, 105, 105] : [141, 114, 97];
  const PALETTE = eco
    ? [[0, 0, 0]]
    : [[111, 154, 63], [228, 87, 46], [201, 138, 12],
       [163, 70, 140], [61, 155, 181], [201, 112, 31]];

  const choisies = D.recettes.filter((r) => D.choisies.has(r.nom));
  const groupes = listeAAcheter();
  const maintenant = new Date();
  let page = 1;

  function enTetePage(premiere) {
    const h = premiere ? 24 : 16;
    // Fond blanc explicite : certaines visionneuses affichent autrement une
    // page transparente sur du gris ou du noir.
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_L, PAGE_H, 'F');

    if (eco) {
      // Un simple filet sous le titre au lieu du bandeau plein.
      doc.setTextColor(0, 0, 0);
      doc.setFont('Fraunces', 'bold');
      doc.setFontSize(premiere ? 18 : 12.5);
      doc.text('On mange quoi ?', MARGE, premiere ? 15 : 11);
      doc.setFont('Outfit', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRIS);
      doc.text("Liste d'épicerie · " + dateLongue(maintenant),
        PAGE_L - MARGE, premiere ? 15 : 11, { align: 'right' });
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.6);
      doc.line(MARGE, premiere ? 18.5 : 14, PAGE_L - MARGE, premiere ? 18.5 : 14);
      return premiere ? 21 : 16;
    }

    // Le bandeau rayé du store de bistrot, repris de la page.
    doc.setFillColor(...TOMATE);
    doc.rect(0, 0, PAGE_L, h, 'F');
    doc.setFillColor(255, 122, 82);
    for (let x0 = 0; x0 < PAGE_L; x0 += 24) doc.rect(x0, 0, 12, h, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('Fraunces', 'bold');
    doc.setFontSize(premiere ? 18 : 12.5);
    doc.text('On mange quoi ?', MARGE, premiere ? 15.5 : 11);
    doc.setFont('Outfit', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 238, 226);
    doc.text("Liste d'épicerie · " + dateLongue(maintenant),
      PAGE_L - MARGE, premiere ? 15.5 : 11, { align: 'right' });
    return h;
  }

  function piedPage() {
    doc.setFont('Outfit', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text(`${choisies.length} repas · ${groupes.reduce((n, g) => n + g.articles.length, 0)} articles`,
      MARGE, PAGE_H - 9);
    doc.text(String(page), PAGE_L - MARGE, PAGE_H - 9, { align: 'right' });
  }

  // ── page 1 : en-tête + rappel du menu ──────────────────────────────────
  let hautColonnes = enTetePage(true) + 8;

  doc.setFont('Outfit', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...TOMATE);
  doc.text('AU MENU', MARGE, hautColonnes);
  hautColonnes += 4.5;

  doc.setFont('Outfit', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...ENCRE);
  const menu = doc.splitTextToSize(
    choisies.map((r) => r.nom + (r.portions ? ` (${r.portions})` : '')).join('   ·   '),
    PAGE_L - 2 * MARGE);
  doc.text(menu, MARGE, hautColonnes);
  hautColonnes += menu.length * 4 + 3;

  doc.setDrawColor(...(eco ? [170, 170, 170] : [226, 208, 190]));
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1.4, 1.4], 0);
  doc.line(MARGE, hautColonnes, PAGE_L - MARGE, hautColonnes);
  doc.setLineDashPattern([], 0);
  hautColonnes += 7;

  // ── coulée sur deux colonnes ───────────────────────────────────────────
  let col = 0;
  let y = hautColonnes;
  const x = () => MARGE + col * (COL_L + ECART);

  function colonneSuivante() {
    if (col === 0) {
      col = 1;
      y = hautColonnes;
    } else {
      piedPage();
      doc.addPage();
      page += 1;
      hautColonnes = enTetePage(false) + 8;
      col = 0;
      y = hautColonnes;
    }
  }

  function placeRestante() { return BAS - y; }

  function dessinerTitreRayon(rayon, teinte) {
    doc.setFont('Fraunces', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...teinte);
    doc.text(rayon.nom, x(), y);
    doc.setDrawColor(...teinte);
    doc.setLineWidth(0.45);
    doc.line(x(), y + 1.7, x() + COL_L, y + 1.7);
    y += 6;
  }

  // Géométrie d'un article : la case à cocher, le nom, puis la provenance
  // entre parenthèses en plus petit, au bout de la même ligne.
  const RETRAIT = 5;      // décalage du texte, après la case à cocher
  const H_NOM = 3.9;      // avance sous la ligne du nom
  const H_SUITE = 2.8;    // avance sous chaque ligne de provenance en dessous
  const BOUT_MINI = 14;   // en deçà, la provenance passe directement à la ligne

  /**
   * Découpe la provenance en lignes. La première tient au bout de la ligne du
   * nom (chaîne vide s'il n'y reste pas la place), les suivantes reviennent
   * sous le nom, alignées sur le retrait.
   */
  function decouperProvenance(texte, placeBout) {
    doc.setFont('Outfit', 'normal');
    doc.setFontSize(6.6);
    const pleine = COL_L - RETRAIT;
    const lignes = [''];
    texte.split(' ').forEach((mot) => {
      const i = lignes.length - 1;
      const essai = lignes[i] ? lignes[i] + ' ' + mot : mot;
      const large = i === 0 ? placeBout : pleine;
      // Le « lignes[i] vide » évite la boucle sans fin sur un mot trop long.
      if (doc.getTextWidth(essai) <= large || (!lignes[i] && i > 0)) lignes[i] = essai;
      else lignes.push(mot);
    });
    return lignes;
  }

  /** Mesure sans rien dessiner : hauteur, lignes, et où commence le bout. */
  function mesurerArticle(a) {
    doc.setFont('Outfit', 'normal');
    doc.setFontSize(8.8);
    const finNom = RETRAIT + doc.getTextWidth(a.nom) + 1.3;
    const placeBout = COL_L - finNom;
    const lignes = decouperProvenance('(' + a.sources.join(', ') + ')',
      placeBout >= BOUT_MINI ? placeBout : 0);
    return { finNom, lignes, hauteur: H_NOM + (lignes.length - 1) * H_SUITE + 0.5 };
  }

  function dessinerArticle(a) {
    const m = mesurerArticle(a);

    // La case à cocher, pour barrer au crayon dans l'allée.
    doc.setDrawColor(...(eco ? [90, 90, 90] : [198, 176, 156]));
    doc.setLineWidth(0.3);
    doc.roundedRect(x(), y - 2.4, 2.9, 2.9, 0.6, 0.6);

    doc.setFont('Outfit', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(...ENCRE);
    doc.text(a.nom, x() + RETRAIT, y);

    doc.setFontSize(6.6);
    doc.setTextColor(...GRIS);
    let yy = y;
    m.lignes.forEach((ligne, i) => {
      if (i === 0) {
        if (ligne) doc.text(ligne, x() + m.finNom, yy);
        return;
      }
      yy += H_SUITE;
      doc.text(ligne, x() + RETRAIT, yy);
    });

    y += m.hauteur;
  }

  groupes.forEach(({ rayon, articles }, i) => {
    const teinte = rayon.id === RAYON_DEFAUT && !eco
      ? [179, 52, 28]
      : PALETTE[i % PALETTE.length];
    // On ne laisse jamais un titre de rayon seul en bas de colonne.
    if (placeRestante() < 6 + mesurerArticle(articles[0]).hauteur) colonneSuivante();
    dessinerTitreRayon(rayon, teinte);
    articles.forEach((a) => {
      if (placeRestante() < mesurerArticle(a).hauteur) {
        colonneSuivante();
        dessinerTitreRayon({ nom: rayon.nom + ' (suite)' }, teinte);
      }
      dessinerArticle(a);
    });
    y += 2.5;
  });

  piedPage();
  return doc;
}

function telechargerPdf() {
  const eco = E('pdfEconome').checked;
  construirePdf({ monochrome: eco })
    .save(`epicerie-${dateCourte(new Date())}${eco ? '-nb' : ''}.pdf`);
}

/* ═══════════════════════════════════════════════ onglet « Gérer » ═══════ */

function rendreGerer() {
  rendreChoixRecette();
  rendreFormulaire();
  rendreIngredients();
  E('explicationSauvegarde').textContent = D.ecriture
    ? 'Le serveur local tourne : « Enregistrer les fichiers » réécrit data/recettes.yaml et data/ingredients.yaml (une copie .bak est gardée à chaque fois).'
    : "Cette page est servie sans le serveur local, elle ne peut donc pas écrire sur le disque. Téléchargez les YAML et remplacez ceux du dossier data/, ou lancez python3 on-mange-quoi.py pour enregistrer directement.";
  E('btnSauver').disabled = !D.ecriture;
}

function rendreChoixRecette() {
  const sel = E('choixRecette');
  sel.innerHTML = '';
  const vide = creer('option', null, '(nouvelle recette)');
  vide.value = '';
  sel.appendChild(vide);
  [...D.recettes].sort((a, b) => triFr(a.nom, b.nom)).forEach((r) => {
    const o = creer('option', null, r.nom);
    o.value = r.nom;
    sel.appendChild(o);
  });
  sel.value = D.editee || '';
}

function rendreFormulaire() {
  const r = D.recettes.find((x) => x.nom === D.editee) ||
    { nom: '', tags: [], portions: 4, ingredients: [], note: '' };

  E('fNom').value = r.nom;
  E('fPortions').value = r.portions || '';
  E('fIngredients').value = r.ingredients.join('\n');
  E('fNote').value = r.note || '';
  E('supprimerRecette').disabled = !D.editee;

  const zone = E('fTags');
  zone.innerHTML = '';
  const choisis = new Set(r.tags);
  const proposes = [];
  facettesEffectives().forEach((f) => f.tags.forEach((t) => proposes.push(t)));
  r.tags.forEach((t) => { if (!proposes.includes(t)) proposes.push(t); });

  proposes.forEach((tag) => {
    const etiquette = creer('label', 'pastille' + (choisis.has(tag) ? ' is-on' : ''));
    const boite = creer('input');
    boite.type = 'checkbox';
    boite.value = tag;
    boite.checked = choisis.has(tag);
    boite.addEventListener('change', () => etiquette.classList.toggle('is-on', boite.checked));
    etiquette.appendChild(boite);
    etiquette.appendChild(document.createTextNode(tag));
    zone.appendChild(etiquette);
  });

  const dl = E('listeIngredientsConnus');
  dl.innerHTML = '';
  ingredientsUtilises().forEach((i) => {
    const o = creer('option');
    o.value = i;
    dl.appendChild(o);
  });

  apercuNouveaux();
}

/** Prévient tout de suite si la recette introduit des ingrédients inconnus. */
function apercuNouveaux() {
  const lignes = E('fIngredients').value.split('\n').map((s) => s.trim()).filter(Boolean);
  const inconnus = lignes.filter((i) => !D.rayonDe[i]);
  const p = E('apercuNouveaux');
  if (!inconnus.length) {
    p.textContent = lignes.length ? `${lignes.length} ingrédients, tous déjà classés.` : '';
    p.className = 'hint';
  } else {
    p.textContent = `À classer après enregistrement : ${inconnus.join(', ')}`;
    p.className = 'hint alerte';
  }
}

function rendreIngredients() {
  const hote = E('listeIngredients');
  hote.innerHTML = '';
  const q = pliage(E('rechercheIngredient').value.trim());

  // Tous les ingrédients : ceux utilisés par une recette et ceux déjà classés.
  const tous = [...new Set([...ingredientsUtilises(), ...Object.keys(D.rayonDe)])];
  const nonClasses = tous.filter((i) => !D.rayonDe[i]).sort(triFr);
  const classes = tous.filter((i) => D.rayonDe[i]).sort(triFr);

  const alerte = E('alerteNonClasses');
  if (nonClasses.length) {
    alerte.textContent = `${nonClasses.length} ingrédient${nonClasses.length > 1 ? 's' : ''} sans rayon : ${nonClasses.length > 1 ? 'ils atterrissent' : 'il atterrit'} dans « À classer » au bas du PDF.`;
    alerte.className = 'hint alerte';
  } else {
    alerte.textContent = 'Tous les ingrédients ont un rayon.';
    alerte.className = 'hint';
  }

  [...nonClasses, ...classes]
    .filter((i) => !q || pliage(i).includes(q))
    .forEach((ing) => {
      const orphelin = !D.rayonDe[ing];
      const ligne = creer('div', 'ligne-ingredient' + (orphelin ? ' non-classe' : ''));
      const nom = creer('span', 'nom', ing);
      nom.title = ing;
      ligne.appendChild(nom);

      const sel = creer('select');
      const rien = creer('option', null, '(à classer)');
      rien.value = '';
      sel.appendChild(rien);
      D.meta.rayons.filter((r) => r.id !== RAYON_DEFAUT).forEach((r) => {
        const o = creer('option', null, r.nom);
        o.value = r.id;
        sel.appendChild(o);
      });
      sel.value = D.rayonDe[ing] || '';
      sel.addEventListener('change', () => {
        if (sel.value) D.rayonDe[ing] = sel.value;
        else delete D.rayonDe[ing];
        rendreIngredients();
        rendrePied();
        rendreListe();
      });
      ligne.appendChild(sel);
      hote.appendChild(ligne);
    });
}

function enregistrerRecette(evt) {
  evt.preventDefault();
  const nom = E('fNom').value.trim();
  if (!nom) { toast('Il faut un nom de plat.', true); return; }

  const conflit = D.recettes.find((r) => r.nom === nom && r.nom !== D.editee);
  if (conflit) { toast(`« ${nom} » existe déjà.`, true); return; }

  const recette = normaliserRecette({
    nom,
    tags: [...E('fTags').querySelectorAll('input:checked')].map((b) => b.value),
    portions: E('fPortions').value,
    ingredients: E('fIngredients').value.split('\n'),
    note: E('fNote').value,
  });

  const i = D.recettes.findIndex((r) => r.nom === D.editee);
  if (i >= 0) {
    // Un renommage suit la recette dans la sélection en cours.
    if (D.choisies.delete(D.recettes[i].nom)) D.choisies.add(nom);
    D.recettes[i] = recette;
  } else {
    D.recettes.push(recette);
  }

  D.editee = nom;
  memoriserChoix();
  rendreGerer();
  rendreChoisir();
  toast(D.ecriture
    ? `« ${nom} » modifiée. Pensez à « Enregistrer les fichiers » plus bas.`
    : `« ${nom} » modifiée en mémoire. Téléchargez recettes.yaml pour la garder.`);
}

function supprimerRecetteCourante() {
  if (!D.editee) return;
  if (!confirm(`Supprimer « ${D.editee} » ?`)) return;
  D.recettes = D.recettes.filter((r) => r.nom !== D.editee);
  D.choisies.delete(D.editee);
  D.editee = null;
  memoriserChoix();
  rendreGerer();
  rendreChoisir();
  toast('Recette supprimée.');
}

/* ══════════════════════════════════════════ écriture des YAML ═══════════ */

/** Faut-il mettre ce scalaire entre quotes pour rester du YAML valide ? */
function besoinDeQuotes(s) {
  if (s === '') return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/: /.test(s) || / #/.test(s)) return true;
  if (/^\s|\s$/.test(s)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return true;
  return false;
}

function sc(v) {
  const s = String(v);
  return besoinDeQuotes(s) ? "'" + s.replace(/'/g, "''") + "'" : s;
}

/** Idem, mais dans une liste en ligne [a, b] où la virgule compte aussi. */
function scFlux(v) {
  const s = String(v);
  return (besoinDeQuotes(s) || /[,[\]{}]/.test(s)) ? "'" + s.replace(/'/g, "''") + "'" : s;
}

const ENTETE_RECETTES = `# Les repas de la famille.
#
# La liste des plats vient du document « Repas .docx » (Salades, Soupes,
# Végétarien, Viande). Les listes d'ingrédients ont été remplies à partir des
# versions classiques de chaque plat : à relire et à ajuster au goût de la
# maison, c'est le fichier fait pour ça.
#
# Chaque recette :
#   nom         : le titre affiché sur le site et dans le menu du PDF
#   tags        : les mots-clés servant aux filtres (voir facettes/meta.yaml)
#   portions    : pour combien de personnes, à titre indicatif
#   ingredients : un ingrédient par ligne. Le nom écrit ici doit correspondre à
#                 une entrée de ingredients.yaml pour tomber dans le bon rayon,
#                 sinon il finit dans « À classer ».
#   note        : optionnel, le truc de famille à ne pas oublier
`;

const ENTETE_INGREDIENTS = `# Nature de chaque ingrédient : à quel rayon d'épicerie il appartient.
#
# Les identifiants de rayon sont ceux définis dans meta.yaml. Un ingrédient
# absent d'ici se retrouve dans « À classer », sur le site comme dans le PDF ;
# l'onglet « Gérer » de la page web permet de le classer sans ouvrir ce
# fichier à la main.
#
# Le regroupement suit la liste d'épicerie familiale : les bouillons et le vin
# sont avec les produits laitiers et boissons, les épices avec les huiles, les
# œufs avec la viande.
`;

function yamlRecettes() {
  const L = [ENTETE_RECETTES, 'recettes:', ''];
  D.recettes.forEach((r) => {
    L.push(`  - nom: ${sc(r.nom)}`);
    L.push(`    tags: [${r.tags.map(scFlux).join(', ')}]`);
    if (r.portions) L.push(`    portions: ${r.portions}`);
    L.push('    ingredients:');
    r.ingredients.forEach((i) => L.push(`      - ${sc(i)}`));
    if (r.note) L.push(`    note: ${sc(r.note)}`);
    L.push('');
  });
  return L.join('\n');
}

function yamlIngredients() {
  const L = [ENTETE_INGREDIENTS, 'rayons_par_ingredient:'];
  const restants = new Set(Object.keys(D.rayonDe));

  D.meta.rayons.forEach((rayon) => {
    const noms = [...restants].filter((i) => D.rayonDe[i] === rayon.id).sort(triFr);
    if (!noms.length) return;
    L.push('');
    L.push(`  # ${rayon.nom}`);
    noms.forEach((i) => { L.push(`  ${sc(i)}: ${rayon.id}`); restants.delete(i); });
  });

  // Rayons inconnus de meta.yaml : on les garde plutôt que de les perdre.
  const orphelins = [...restants].sort(triFr);
  if (orphelins.length) {
    L.push('');
    L.push('  # Rayons non déclarés dans meta.yaml');
    orphelins.forEach((i) => L.push(`  ${sc(i)}: ${sc(D.rayonDe[i])}`));
  }

  L.push('');
  return L.join('\n');
}

async function sauvegarderSurDisque() {
  const bouton = E('btnSauver');
  bouton.disabled = true;
  E('etatSauvegarde').textContent = 'Enregistrement…';
  try {
    const r = await fetch('api/ecrire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fichiers: {
          'recettes.yaml': yamlRecettes(),
          'ingredients.yaml': yamlIngredients(),
        },
      }),
    });
    const rep = await r.json();
    if (!r.ok || !rep.ok) throw new Error(rep.erreur || `HTTP ${r.status}`);
    E('etatSauvegarde').textContent =
      `Écrit à ${new Date().toLocaleTimeString('fr-CA')} : ${rep.ecrits.join(', ')}.`;
    toast('Fichiers enregistrés.');
  } catch (e) {
    E('etatSauvegarde').textContent = 'Échec : ' + e.message;
    toast('Enregistrement impossible : ' + e.message, true);
  } finally {
    bouton.disabled = !D.ecriture;
  }
}

/* ══════════════════════════════════════════════════ mise en place ═══════ */

function brancherOnglets() {
  E('onglets').addEventListener('click', (e) => {
    const bouton = e.target.closest('.tab');
    if (!bouton) return;
    const vue = bouton.dataset.vue;
    [...E('onglets').querySelectorAll('.tab')].forEach((b) => b.classList.toggle('is-active', b === bouton));
    E('vue-choisir').hidden = vue !== 'choisir';
    E('vue-gerer').hidden = vue !== 'gerer';
    if (vue === 'gerer') rendreGerer();
  });
}

function brancherEvenements() {
  E('recherche').addEventListener('input', (e) => {
    D.recherche = e.target.value;
    // La liste d'épicerie ne dépend pas de la recherche, inutile de la refaire.
    rendreFiltres();
    rendreGrille();
  });

  E('viderFiltres').addEventListener('click', () => {
    D.filtres.clear();
    D.recherche = '';
    E('recherche').value = '';
    rendreChoisir();
  });

  E('toutDecocher').addEventListener('click', () => {
    D.choisies.clear();
    memoriserChoix();
    rendreChoisir();
  });

  E('hasard').addEventListener('click', () => {
    const bassin = recettesFiltrees().map((r) => r.nom);
    for (let i = bassin.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bassin[i], bassin[j]] = [bassin[j], bassin[i]];
    }
    D.choisies = new Set(bassin.slice(0, 5));
    memoriserChoix();
    rendreChoisir();
    if (D.choisies.size) {
      confettis(24);
      toast('Cinq repas tirés au sort. Bon appétit !');
    } else {
      toast('Aucun repas ne correspond aux filtres.');
    }
  });

  E('btnPdf').addEventListener('click', () => {
    try {
      telechargerPdf();
      confettis(44);
      toast('PDF prêt. Bonne épicerie !');
    } catch (e) {
      toast('PDF impossible : ' + e.message, true);
    }
  });

  // La case garde son état d'une visite à l'autre, comme la sélection.
  const econome = E('pdfEconome');
  econome.checked = localStorage.getItem(CLE_ECONOME) === '1';
  E('etiquetteEconome').classList.toggle('is-on', econome.checked);
  econome.addEventListener('change', () => {
    E('etiquetteEconome').classList.toggle('is-on', econome.checked);
    try { localStorage.setItem(CLE_ECONOME, econome.checked ? '1' : '0'); } catch (e) { /* tant pis */ }
  });

  E('toutRemettre').addEventListener('click', () => {
    D.dejaLa.clear();
    memoriserDeja();
    rendreListe();
    toast('Tout est remis sur la liste.');
  });

  E('btnImprimer').addEventListener('click', () => window.print());

  E('btnCopier').addEventListener('click', async () => {
    const texte = listeEnTexte();
    try {
      await navigator.clipboard.writeText(texte);
      toast('Liste copiée.');
    } catch (e) {
      telecharger('epicerie.txt', texte);
      toast('Presse-papier refusé, la liste a été téléchargée.');
    }
  });

  E('choixRecette').addEventListener('change', (e) => {
    D.editee = e.target.value || null;
    rendreFormulaire();
  });

  E('nouvelleRecette').addEventListener('click', () => {
    D.editee = null;
    rendreChoixRecette();
    rendreFormulaire();
    E('fNom').focus();
  });

  E('formRecette').addEventListener('submit', enregistrerRecette);
  E('supprimerRecette').addEventListener('click', supprimerRecetteCourante);
  E('fIngredients').addEventListener('input', apercuNouveaux);
  E('rechercheIngredient').addEventListener('input', rendreIngredients);
  E('btnSauver').addEventListener('click', sauvegarderSurDisque);
  E('btnTelechargerRecettes').addEventListener('click',
    () => telecharger('recettes.yaml', yamlRecettes(), 'text/yaml'));
  E('btnTelechargerIngredients').addEventListener('click',
    () => telecharger('ingredients.yaml', yamlIngredients(), 'text/yaml'));
}

async function demarrer() {
  await passerLaPorte();
  brancherOnglets();
  try {
    await charger();
  } catch (e) {
    // Cas de loin le plus fréquent : la page a été ouverte en double-cliquant
    // sur index.html. Le navigateur interdit alors de lire les YAML voisins,
    // et le message brut de fetch (« Load failed ») n'aide personne.
    const local = location.protocol === 'file:';
    E('grilleRecettes').innerHTML = local
      ? '<p class="hint alerte"><strong>La page a été ouverte directement depuis le disque.</strong><br>' +
        'Les navigateurs refusent de lire les fichiers YAML voisins dans ce mode. Lancez le serveur :<br>' +
        '<code>cd on-mange-quoi &amp;&amp; python3 on-mange-quoi.py</code><br>' +
        'puis ouvrez l\'adresse qu\'il affiche, <code>http://127.0.0.1:5757/</code>, ' +
        'au lieu du fichier index.html.</p>'
      : `<p class="hint alerte"><strong>Impossible de lire les fichiers YAML.</strong> (${e.message})<br>` +
        'Vérifiez que le dossier <code>data/</code> est bien à côté de <code>web/</code> ' +
        'et qu\'il contient meta.yaml, recettes.yaml et ingredients.yaml.</p>';
    return;
  }
  await detecterMode();
  relireChoix();
  relireDeja();
  brancherEvenements();
  rendreChoisir();
}

demarrer();
