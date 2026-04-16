import asyncio
import json
import cv2
import numpy as np
import websockets

async def handle_client(websocket):
    print("[MIN] Nouveau client connecté.")

    try:
        async for message in websocket:
            # On attend du binaire = JPEG
            if isinstance(message, str):
                print("[MIN] Message texte reçu (ignoré)")
                continue

            data = np.frombuffer(message, np.uint8)
            frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if frame is None:
                print("[MIN][WARN] Impossible de décoder le frame.")
                continue

            # Ici on ne fait AUCUN traitement, on renvoie juste l'image telle quelle
            ok, buf = cv2.imencode(".jpg", frame)
            if not ok:
                print("[MIN][WARN] Échec d'encodage JPEG.")
                continue

            # 1) Envoi image
            await websocket.send(buf.tobytes())

            # 2) Envoi JSON simple
            meta = {
                "type": "faces",
                "names": ["Unknown (mode MINIMAL)"],
            }
            await websocket.send(json.dumps(meta))

    except websockets.ConnectionClosed:
        print("[MIN] Client déconnecté.")
    except Exception as e:
        print("[MIN][ERROR] Exception:", e)

async def main():
    host = "127.0.0.1"
    port = 8878
    print(f"[MIN] Démarrage WebSocket minimal sur {host}:{port} ...")

    async with websockets.serve(
        handle_client,
        host,
        port,
        max_size=8 * 1024 * 1024,
    ):
        print("[MIN] Serveur minimal prêt. En attente de connexions...")
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
