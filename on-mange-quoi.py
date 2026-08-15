#!/usr/bin/env python3
"""Serveur local du site « On mange quoi ? ».

À la maison, on lance ce script et on ouvre la page dans le navigateur : elle
sert les fichiers de web/ et de data/, et surtout elle a le droit de réécrire
data/recettes.yaml et data/ingredients.yaml quand on édite depuis l'onglet
« Gérer ».

En ligne (GitHub Pages ou n'importe quel hébergement statique), ce script ne
tourne pas : la page détecte son absence, passe en lecture seule et propose de
télécharger les YAML modifiés au lieu de les enregistrer. Tout le reste, les
filtres, la compilation de la liste et le PDF, fonctionne pareil des deux
côtés puisque tout se passe dans le navigateur.

Aucune dépendance : rien que la bibliothèque standard de Python 3.

    python3 on-mange-quoi.py              # http://localhost:5757
    python3 on-mange-quoi.py --port 9000  # un autre port
    python3 on-mange-quoi.py --no-ouvrir  # sans ouvrir le navigateur
"""

import argparse
import http.server
import json
import mimetypes
import shutil
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

RACINE = Path(__file__).resolve().parent
WEB = RACINE / "web"
DATA = RACINE / "data"

# Seuls ces fichiers-là peuvent être réécrits par la page.
FICHIERS_INSCRIPTIBLES = {"recettes.yaml", "ingredients.yaml", "meta.yaml"}

# Un YAML de recettes complet fait quelques dizaines de kilooctets ; au-delà
# d'un mégaoctet, c'est qu'il se passe autre chose.
TAILLE_MAX = 1_000_000


class Gestionnaire(http.server.SimpleHTTPRequestHandler):
    """Sert web/ à la racine, data/ tel quel, et expose deux points d'API."""

    def translate_path(self, path):
        propre = path.split("?", 1)[0].split("#", 1)[0]
        morceaux = [m for m in propre.split("/") if m not in ("", ".", "..")]

        if not morceaux:
            return str(WEB / "index.html")
        base = DATA if morceaux[0] == "data" else WEB
        if morceaux[0] == "data":
            morceaux = morceaux[1:]

        cible = base.joinpath(*morceaux).resolve()
        # Ceinture et bretelles : on ne sort jamais des deux dossiers servis.
        if not (str(cible).startswith(str(WEB)) or str(cible).startswith(str(DATA))):
            return str(WEB / "index.html")
        return str(cible)

    def guess_type(self, path):
        if str(path).endswith((".yaml", ".yml")):
            return "text/yaml; charset=utf-8"
        type_ = mimetypes.guess_type(path)[0] or "application/octet-stream"
        if type_.startswith("text/") or type_ in ("application/javascript", "application/json"):
            type_ += "; charset=utf-8"
        return type_

    def end_headers(self):
        # Les YAML changent sous nos pieds quand on édite : pas de cache.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ── API ─────────────────────────────────────────────────────────────

    def do_GET(self):
        if self.path.split("?")[0] == "/api/etat":
            return self._json(200, {"ecriture": True, "racine": str(RACINE)})
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/ecrire":
            return self._json(404, {"ok": False, "erreur": "adresse inconnue"})
        try:
            return self._ecrire()
        except Exception as exc:  # on renvoie l'erreur à la page plutôt que 500
            return self._json(400, {"ok": False, "erreur": str(exc)})

    def _ecrire(self):
        taille = int(self.headers.get("Content-Length") or 0)
        if taille <= 0 or taille > TAILLE_MAX:
            raise ValueError("taille de requête invalide")

        charge = json.loads(self.rfile.read(taille).decode("utf-8"))
        fichiers = charge.get("fichiers") or {}
        if not isinstance(fichiers, dict) or not fichiers:
            raise ValueError("aucun fichier à écrire")

        for nom, contenu in fichiers.items():
            if nom not in FICHIERS_INSCRIPTIBLES:
                raise ValueError(f"fichier non autorisé : {nom}")
            if not isinstance(contenu, str) or not contenu.strip():
                raise ValueError(f"contenu vide pour {nom}")

        ecrits = []
        for nom, contenu in fichiers.items():
            cible = DATA / nom
            if cible.exists():
                shutil.copy2(cible, cible.with_suffix(cible.suffix + ".bak"))
            # Écriture puis remplacement : jamais de fichier à moitié écrit.
            provisoire = cible.with_suffix(cible.suffix + ".tmp")
            provisoire.write_text(contenu, encoding="utf-8")
            provisoire.replace(cible)
            ecrits.append(nom)
            print(f"  écrit : data/{nom}")

        return self._json(200, {"ok": True, "ecrits": sorted(ecrits)})

    def _json(self, code, charge):
        corps = json.dumps(charge, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def log_message(self, format, *args):
        # Une ligne par requête, c'est bruyant ; on ne garde que les erreurs.
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


class Serveur(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def principal():
    arg = argparse.ArgumentParser(description="Serveur local de « On mange quoi ? »")
    arg.add_argument("--port", type=int, default=5757, help="port d'écoute (5757 par défaut)")
    arg.add_argument("--hote", default="127.0.0.1", help="adresse d'écoute (127.0.0.1 par défaut)")
    arg.add_argument("--no-ouvrir", action="store_true", help="ne pas ouvrir le navigateur")
    options = arg.parse_args()

    for dossier in (WEB, DATA):
        if not dossier.is_dir():
            sys.exit(f"Dossier manquant : {dossier}")

    try:
        serveur = Serveur((options.hote, options.port), Gestionnaire)
    except OSError as exc:
        sys.exit(f"Impossible d'écouter sur {options.hote}:{options.port} ({exc}).\n"
                 f"Essayez : python3 {Path(__file__).name} --port {options.port + 1}")

    adresse = f"http://{options.hote}:{options.port}/"
    print("On mange quoi ?")
    print(f"  {adresse}")
    print(f"  données : {DATA}")
    print("  Ctrl+C pour arrêter.\n")

    if not options.no_ouvrir:
        threading.Timer(0.6, lambda: webbrowser.open(adresse)).start()

    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")
    finally:
        serveur.server_close()


if __name__ == "__main__":
    principal()
