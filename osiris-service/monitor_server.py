import asyncio
import websockets
import json
import psutil
import time

async def stats_handler(websocket):
    print("[MONITOR] Client connecté pour les stats.")
    try:
        while True:
            # Récupération des métriques système globales
            cpu_percent = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            
            # Recherche spécifique du processus OSiris pour avoir ses infos précises
            osiris_process = None
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    if 'osiris_server.py' in ' '.join(proc.info['cmdline'] or []):
                        osiris_process = proc
                        break
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass

            osiris_cpu = 0.0
            osiris_mem_mb = 0.0
            
            if osiris_process:
                with osiris_process.oneshot():
                    osiris_cpu = osiris_process.cpu_percent(interval=None)
                    osiris_mem_mb = osiris_process.memory_info().rss / (1024 * 1024)

            stats = {
                "cpu_global": cpu_percent,
                "mem_global_percent": mem.percent,
                "osiris_cpu": osiris_cpu,
                "osiris_mem": round(osiris_mem_mb, 1)
            }
            
            await websocket.send(json.dumps(stats))
            await asyncio.sleep(1) # Mise à jour toutes les secondes
            
    except websockets.ConnectionClosed:
        pass
    except Exception as e:
        print(f"[MONITOR] Erreur: {e}")

async def main():
    print("[MONITOR] Démarrage du serveur de monitoring sur le port 8899...")
    async with websockets.serve(stats_handler, "127.0.0.1", 8899):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())

